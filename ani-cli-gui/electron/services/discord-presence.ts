import { app } from 'electron'
import fs from 'node:fs'
import { join } from 'node:path'
import * as DiscordRPC from 'discord-rpc'
import type { DiscordActivityPayload, DiscordPlaybackPresence, DiscordPresenceSettings } from '../../src/discord-presence-types'

const DEFAULT_CLIENT_ID = '1440472840578142381'
const SETTINGS_FILE = 'discord-presence.json'
const FALLBACK_ASSET = 'aniplay'
// const APP_NAME = 'on AniPlay'
const MAX_TEXT = 128

interface RpcClient {
  login(options: { clientId: string }): Promise<unknown>
  destroy(): Promise<void>
  clearActivity(): Promise<unknown>
  on(event: string, listener: () => void): unknown
  removeAllListeners(): unknown
  request?(command: string, args: unknown): Promise<unknown>
}

export type RpcClientFactory = () => RpcClient

function finite(value: number | undefined, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : fallback
}

function truncate(value: string, max = MAX_TEXT) {
  const normalized = value.replace(/\s+/g, ' ').trim()
  return normalized.length <= max ? normalized : `${normalized.slice(0, max - 1).trimEnd()}…`
}

function formatRemaining(seconds: number) {
  const total = Math.max(0, Math.round(seconds))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = total % 60
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}` : `${minutes}:${String(secs).padStart(2, '0')}`
}

export function validCoverUrl(value: string | undefined): string | undefined {
  if (!value || value.length > 2048) return undefined
  try {
    const url = new URL(value)
    return url.protocol === 'https:' ? url.toString() : undefined
  } catch {
    return undefined
  }
}

export function buildDiscordActivity(playback: DiscordPlaybackPresence, now = Date.now(), forceFallback = false): DiscordActivityPayload {
  const currentTime = finite(playback.currentTime)
  const duration = finite(playback.duration)
  const remaining = duration > 0 ? Math.max(0, duration - currentTime) : 0
  const audio = playback.translationType === 'dub' ? 'Dubbed' : 'Subbed'
  const cover = forceFallback ? undefined : validCoverUrl(playback.coverUrl)
  const mediaId = playback.aniListMediaId
  const activity: DiscordActivityPayload = {
    name: truncate(playback.animeName),
    type: 3,
    details: truncate(playback.animeName),
    state: playback.playing
      ? truncate(`Episode ${playback.episode} · ${audio}`)
      : truncate(`Paused · Episode ${playback.episode}${remaining > 0 ? ` · ${formatRemaining(remaining)} remaining` : ''}`),
    assets: {
      large_image: cover ?? FALLBACK_ASSET,
      large_text: truncate(playback.animeName),
      small_image: FALLBACK_ASSET,
      small_text: 'AniPlay',
    },
    instance: false,
  }
  if (playback.playing && remaining > 0) activity.timestamps = { end: Math.round(now + remaining * 1000) }
  if (mediaId && Number.isInteger(mediaId) && mediaId > 0) activity.buttons = [{ label: 'View on AniList', url: `https://anilist.co/anime/${mediaId}` }]
  return activity
}

export function validatePlayback(value: unknown): DiscordPlaybackPresence {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Invalid Discord playback state')
  const input = value as Partial<DiscordPlaybackPresence>
  if (typeof input.animeName !== 'string' || !input.animeName.trim() || input.animeName.length > 500) throw new TypeError('Invalid anime name')
  if (typeof input.episode !== 'string' || !input.episode.trim() || input.episode.length > 32) throw new TypeError('Invalid episode')
  if (input.translationType !== 'sub' && input.translationType !== 'dub') throw new TypeError('Invalid translation type')
  if (typeof input.currentTime !== 'number' || !Number.isFinite(input.currentTime) || input.currentTime < 0) throw new TypeError('Invalid playback position')
  if (input.duration !== undefined && (typeof input.duration !== 'number' || !Number.isFinite(input.duration) || input.duration < 0 || input.duration > 86_400)) throw new TypeError('Invalid duration')
  if (typeof input.playing !== 'boolean') throw new TypeError('Invalid playing state')
  if (input.aniListMediaId !== undefined && (typeof input.aniListMediaId !== 'number' || !Number.isInteger(input.aniListMediaId) || input.aniListMediaId <= 0)) throw new TypeError('Invalid AniList media ID')
  return { animeName: input.animeName.trim(), episode: input.episode.trim(), translationType: input.translationType, currentTime: input.currentTime, duration: input.duration, playing: input.playing, aniListMediaId: input.aniListMediaId, coverUrl: validCoverUrl(input.coverUrl) }
}

export class DiscordPresenceService {
  private enabled = false
  private connected = false
  private connecting = false
  private client?: RpcClient
  private latest?: DiscordPlaybackPresence
  private lastPayload = ''
  private retryTimer?: NodeJS.Timeout
  private retryAttempt = 0
  private shuttingDown = false
  private readonly clientId = process.env.DISCORD_CLIENT_ID ?? DEFAULT_CLIENT_ID
  private readonly clientFactory: RpcClientFactory
  private readonly settingsPath: string

  constructor(clientFactory: RpcClientFactory = () => new DiscordRPC.Client({ transport: 'ipc' }), settingsPath?: string) {
    this.clientFactory = clientFactory
    this.settingsPath = settingsPath ?? join(app.getPath('userData'), SETTINGS_FILE)
  }

  initialize() {
    try { this.enabled = Boolean((JSON.parse(fs.readFileSync(this.settingsPath, 'utf8')) as { enabled?: boolean }).enabled) } catch { this.enabled = false }
    if (this.enabled) void this.connect()
  }

  getSettings(): DiscordPresenceSettings { return { enabled: this.enabled, connected: this.connected } }

  setEnabled(enabled: boolean) {
    this.enabled = enabled
    fs.writeFileSync(this.settingsPath, JSON.stringify({ enabled }), 'utf8')
    if (enabled) void this.connect()
    else { this.latest = undefined; this.lastPayload = ''; this.cancelRetry(); void this.clear() }
    return this.getSettings()
  }

  update(playback: DiscordPlaybackPresence) {
    this.latest = playback
    if (!this.enabled) return this.getSettings()
    if (!this.connected) void this.connect()
    else void this.publish(playback)
    return this.getSettings()
  }

  async clear() {
    this.lastPayload = ''
    if (!this.client || !this.connected) return
    try { await this.client.clearActivity() } catch { this.markDisconnected() }
  }

  async shutdown() {
    this.shuttingDown = true; this.cancelRetry()
    try { if (this.connected) await this.client?.clearActivity() } catch { /* Discord is optional */ }
    try { this.client?.removeAllListeners(); await this.client?.destroy() } catch { /* Discord is optional */ }
    this.client = undefined; this.connected = false
  }

  private async connect() {
    if (!this.enabled || this.connected || this.connecting || this.shuttingDown) return
    this.connecting = true
    const client = this.clientFactory(); this.client = client
    client.on('ready', () => { this.connected = true; this.connecting = false; this.retryAttempt = 0; if (this.latest) void this.publish(this.latest) })
    client.on('disconnected', () => this.markDisconnected())
    try { await client.login({ clientId: this.clientId }) } catch { this.markDisconnected() }
  }

  private async publish(playback: DiscordPlaybackPresence) {
    const payload = buildDiscordActivity(playback)
    const serialized = JSON.stringify(payload)
    if (serialized === this.lastPayload || !this.client?.request) return
    try {
      await this.client.request('SET_ACTIVITY', { pid: process.pid, activity: payload })
      this.lastPayload = serialized
    } catch {
      if (payload.assets.large_image !== FALLBACK_ASSET) {
        const fallback = buildDiscordActivity(playback, Date.now(), true)
        try { await this.client.request('SET_ACTIVITY', { pid: process.pid, activity: fallback }); this.lastPayload = JSON.stringify(fallback); return } catch { /* reconnect below */ }
      }
      this.markDisconnected()
    }
  }

  private markDisconnected() {
    this.connected = false; this.connecting = false; this.lastPayload = ''
    try { this.client?.removeAllListeners(); void this.client?.destroy() } catch { /* Discord is optional */ }
    this.client = undefined
    if (this.enabled && !this.shuttingDown) this.scheduleRetry()
  }

  private scheduleRetry() {
    if (this.retryTimer) return
    const delay = Math.min(60_000, 2_000 * 2 ** Math.min(this.retryAttempt++, 5))
    this.retryTimer = setTimeout(() => { this.retryTimer = undefined; void this.connect() }, delay)
    this.retryTimer.unref()
  }

  private cancelRetry() { if (this.retryTimer) clearTimeout(this.retryTimer); this.retryTimer = undefined }
}
