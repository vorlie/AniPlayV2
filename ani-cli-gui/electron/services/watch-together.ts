import WebSocket, { type RawData } from 'ws'
import type {
  WatchTogetherContent,
  WatchTogetherCreateInput,
  WatchTogetherIdentity,
  WatchTogetherJoinInput,
  WatchTogetherMessage,
  WatchTogetherParticipant,
  WatchTogetherPlaybackState,
  WatchTogetherRole,
  WatchTogetherState,
} from '../../src/watch-together-types'

const DEFAULT_ENDPOINT = 'https://watch-together.vorlie.pl'
const PROTOCOL_VERSION = 1
const CONNECT_TIMEOUT_MS = 12_000
const RECONNECT_WINDOW_MS = 90_000
const RECONNECT_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 15_000]
const HEARTBEAT_MS = 25_000
const ROOM_CODE_PATTERN = /^[0-9A-HJKMNP-TV-Z]{10}$/

type JsonRecord = Record<string, unknown>

interface ServerSnapshot {
  code: string
  content: WatchTogetherContent
  playback: WatchTogetherPlaybackState
  participants: WatchTogetherParticipant[]
  chat: WatchTogetherMessage[]
  role: WatchTogetherRole
  serverTime: string
}

type ServerMessage =
  | { type: 'snapshot'; snapshot: ServerSnapshot }
  | { type: 'error'; code: string; error: string }
  | { type: 'pong'; serverTime: string }

export interface WatchTogetherServiceConfig {
  available: boolean
  endpoint: string | null
  message: string | null
}

function record(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : null
}

function onlyKeys(value: JsonRecord, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key))
}

function finite(value: unknown, min = 0): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min
}

function text(value: unknown, max: number): string | null {
  return typeof value === 'string' && value.trim() && value.length <= max ? value : null
}

export function normalizeWatchTogetherCode(value: string): string {
  const code = value.trim().toUpperCase().replace(/[\s-]+/g, '')
  if (!ROOM_CODE_PATTERN.test(code)) throw new Error('Room codes contain 10 Crockford Base32 characters')
  return code
}

function parseContent(value: unknown): WatchTogetherContent | null {
  const item = record(value)
  if (!item) return null
  const keys = Object.keys(item)
  if (keys.some((key) => !['provider', 'showId', 'animeName', 'episode', 'translationType', 'aniListMediaId'].includes(key))) return null
  const provider = text(item.provider, 32)
  const showId = text(item.showId, 200)
  const animeName = text(item.animeName, 200)
  const episode = text(item.episode, 32)
  if (!provider || !showId || !animeName || !episode || (item.translationType !== 'sub' && item.translationType !== 'dub')) return null
  if (item.aniListMediaId !== undefined && (!Number.isInteger(item.aniListMediaId) || !finite(item.aniListMediaId, 1))) return null
  return {
    provider,
    showId,
    animeName,
    episode,
    translationType: item.translationType,
    ...(typeof item.aniListMediaId === 'number' ? { aniListMediaId: item.aniListMediaId } : {}),
  }
}

function parsePlayback(value: unknown): WatchTogetherPlaybackState | null {
  const item = record(value)
  if (!item || !onlyKeys(item, ['position', 'paused', 'duration', 'revision', 'updatedAt']) || !finite(item.position) || typeof item.paused !== 'boolean' || !Number.isInteger(item.revision) || !finite(item.revision)) return null
  if (item.duration !== undefined && !finite(item.duration)) return null
  if (item.updatedAt !== undefined && !text(item.updatedAt, 64)) return null
  return {
    position: item.position,
    paused: item.paused,
    revision: item.revision,
    ...(typeof item.duration === 'number' ? { duration: item.duration } : {}),
    ...(typeof item.updatedAt === 'string' ? { updatedAt: item.updatedAt } : {}),
  }
}

function parseParticipant(value: unknown): WatchTogetherParticipant | null {
  const item = record(value)
  if (!item || !onlyKeys(item, ['id', 'aniListId', 'name', 'avatar', 'role', 'ready', 'connected', 'connectedAt']) || !text(item.id, 80) || !Number.isInteger(item.aniListId) || !finite(item.aniListId, 1) || !text(item.name, 80)) return null
  if (item.role !== 'host' && item.role !== 'guest') return null
  if (typeof item.ready !== 'boolean' || typeof item.connected !== 'boolean') return null
  if (item.avatar !== undefined && item.avatar !== null && !text(item.avatar, 500)) return null
  if (item.connectedAt !== undefined && !finite(item.connectedAt)) return null
  return {
    id: item.id as string,
    aniListId: item.aniListId as number,
    name: item.name as string,
    avatar: item.avatar as string | null | undefined,
    role: item.role,
    ready: item.ready,
    connected: item.connected,
    connectedAt: item.connectedAt as number | undefined,
  }
}

function parseChat(value: unknown): WatchTogetherMessage | null {
  const item = record(value)
  if (!item || !onlyKeys(item, ['id', 'authorId', 'authorName', 'body', 'createdAt']) || !text(item.id, 80) || !text(item.authorId, 80) || !text(item.authorName, 80) || !text(item.body, 500) || !text(item.createdAt, 64)) return null
  return { id: item.id as string, authorId: item.authorId as string, authorName: item.authorName as string, body: item.body as string, createdAt: item.createdAt as string }
}

export function parseWatchTogetherServerMessage(data: RawData): ServerMessage | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(typeof data === 'string' ? data : data.toString('utf8')) as unknown
  } catch {
    return null
  }
  const message = record(parsed)
  if (!message || typeof message.type !== 'string') return null
  if (message.type === 'error') {
    if (!onlyKeys(message, ['type', 'code', 'error'])) return null
    const code = text(message.code, 80)
    const error = text(message.error, 500)
    return code && error ? { type: 'error', code, error } : null
  }
  if (message.type === 'pong') {
    if (!onlyKeys(message, ['type', 'serverTime'])) return null
    const serverTime = text(message.serverTime, 64)
    return serverTime ? { type: 'pong', serverTime } : null
  }
  if (message.type !== 'snapshot' || !onlyKeys(message, ['type', 'snapshot'])) return null
  const snapshot = record(message.snapshot)
  if (!snapshot || !onlyKeys(snapshot, ['code', 'content', 'playback', 'participants', 'chat', 'role', 'serverTime'])) return null
  const code = (() => {
    try { return typeof snapshot.code === 'string' ? normalizeWatchTogetherCode(snapshot.code) : null }
    catch { return null }
  })()
  const content = parseContent(snapshot.content)
  const playback = parsePlayback(snapshot.playback)
  const participants = Array.isArray(snapshot.participants) ? snapshot.participants.map(parseParticipant) : []
  const chat = Array.isArray(snapshot.chat) ? snapshot.chat.map(parseChat) : []
  const serverTime = text(snapshot.serverTime, 64)
  if (!code || !content || !playback || participants.some((item) => item === null) || chat.some((item) => item === null) || !serverTime) return null
  if (snapshot.role !== 'host' && snapshot.role !== 'guest') return null
  return {
    type: 'snapshot',
    snapshot: {
      code,
      content,
      playback,
      participants: participants as WatchTogetherParticipant[],
      chat: chat as WatchTogetherMessage[],
      role: snapshot.role,
      serverTime,
    },
  }
}

function validateIdentity(identity: WatchTogetherIdentity): WatchTogetherIdentity {
  if (!Number.isInteger(identity.aniListId) || identity.aniListId <= 0 || !identity.name.trim()) throw new Error('Sign in to AniList before using Watch Together')
  return { aniListId: identity.aniListId, name: identity.name.trim().slice(0, 80), avatar: identity.avatar ?? null }
}

export function resolveWatchTogetherEndpoint(value: string): string {
  const url = new URL(value.trim())
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) {
    throw new Error('Watch Together must use HTTPS (HTTP is allowed only for local development)')
  }
  if (url.username || url.password || url.search || url.hash) throw new Error('The Watch Together endpoint is invalid')
  return url.toString().replace(/\/$/, '')
}

export class WatchTogetherService {
  private ws: WebSocket | null = null
  private reconnectTimer: NodeJS.Timeout | null = null
  private heartbeatTimer: NodeJS.Timeout | null = null
  private reconnectStartedAt = 0
  private reconnectAttempt = 0
  private generation = 0
  private intentionalClose = false
  private currentCode: string | null = null
  private currentIdentity: WatchTogetherIdentity | null = null
  private hostToken: string | undefined
  private state: WatchTogetherState = {
    code: '', connected: false, role: 'guest', content: null, playback: null,
    participants: [], chat: [], status: 'idle', endpoint: DEFAULT_ENDPOINT, error: null, errorCode: null,
  }

  constructor(
    private readonly onChanged?: (state: WatchTogetherState) => void,
    private readonly onInvite?: (code: string) => void,
  ) {}

  getConfig(): WatchTogetherServiceConfig {
    try {
      return { available: true, endpoint: this.resolveEndpoint(), message: null }
    } catch (error) {
      return { available: false, endpoint: null, message: error instanceof Error ? error.message : 'Watch Together is not configured' }
    }
  }

  getState(): WatchTogetherState { return this.state }

  async create(input: WatchTogetherCreateInput, identity: WatchTogetherIdentity): Promise<WatchTogetherState> {
    const endpoint = this.resolveEndpoint()
    const profile = validateIdentity(identity)
    const response = await fetch(`${endpoint}/v1/rooms`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: input.content, playback: input.playback ?? { position: 0, paused: true, revision: 0 } }),
      signal: AbortSignal.timeout(CONNECT_TIMEOUT_MS),
    })
    const payload = await response.json() as { code?: unknown; hostToken?: unknown; error?: unknown }
    if (!response.ok || typeof payload.code !== 'string' || typeof payload.hostToken !== 'string') {
      throw new Error(typeof payload.error === 'string' ? payload.error : 'The room could not be created')
    }
    const code = normalizeWatchTogetherCode(payload.code)
    this.prepareConnection(code, profile, payload.hostToken, 'host', input.content, input.playback ?? { position: 0, paused: true, revision: 0 })
    await this.connect(true)
    return this.state
  }

  async join(input: WatchTogetherJoinInput, identity: WatchTogetherIdentity): Promise<WatchTogetherState> {
    const code = normalizeWatchTogetherCode(input.code)
    this.prepareConnection(code, validateIdentity(identity), undefined, 'guest', null, null)
    await this.connect(true)
    return this.state
  }

  async reconnect(): Promise<WatchTogetherState> {
    if (!this.currentCode || !this.currentIdentity) throw new Error('There is no room to reconnect to')
    this.clearTimers()
    this.reconnectStartedAt = Date.now()
    this.reconnectAttempt = 0
    await this.connect(true)
    return this.state
  }

  async leave(): Promise<void> {
    this.intentionalClose = true
    this.generation += 1
    this.clearTimers()
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ type: 'leave' }))
    this.ws?.close(1000, 'left room')
    this.ws = null
    this.currentCode = null
    this.currentIdentity = null
    this.hostToken = undefined
    this.setState({
      code: '', connected: false, role: 'guest', status: 'idle', endpoint: this.safeEndpoint(), error: null, errorCode: null,
      content: null, playback: null, participants: [], chat: [],
    })
  }

  async sendChat(body: string): Promise<void> {
    const normalized = body.replace(/\s+/g, ' ').trim()
    if (!normalized) return
    this.send({ type: 'chat', body: normalized.slice(0, 500) })
  }

  async updatePlayback(payload: WatchTogetherPlaybackState): Promise<void> {
    if (this.state.role !== 'host') throw new Error('Only the room host can control playback')
    this.send({ type: 'playback-command', payload: { position: payload.position, paused: payload.paused, ...(payload.duration === undefined ? {} : { duration: payload.duration }) } })
  }

  async setContent(content: WatchTogetherContent): Promise<void> {
    if (this.state.role !== 'host') throw new Error('Only the room host can change the episode')
    this.send({ type: 'content-change', content })
  }

  async setReady(ready: boolean): Promise<void> { this.send({ type: 'ready', ready }) }
  async consumeInvite(code: string): Promise<void> { this.onInvite?.(normalizeWatchTogetherCode(code)) }

  shutdown(): void {
    this.intentionalClose = true
    this.generation += 1
    this.clearTimers()
    this.ws?.close()
    this.ws = null
  }

  private prepareConnection(
    code: string,
    identity: WatchTogetherIdentity,
    hostToken: string | undefined,
    role: WatchTogetherRole,
    content: WatchTogetherContent | null,
    playback: WatchTogetherPlaybackState | null,
  ): void {
    this.intentionalClose = true
    this.generation += 1
    this.clearTimers()
    this.ws?.close()
    this.ws = null
    this.intentionalClose = false
    this.currentCode = code
    this.currentIdentity = identity
    this.hostToken = hostToken
    this.reconnectStartedAt = Date.now()
    this.reconnectAttempt = 0
    this.setState({
      code, connected: false, role, status: 'connecting', endpoint: this.resolveEndpoint(), error: null, errorCode: null,
      content, playback, participants: [], chat: [],
    })
  }

  private async connect(failFast: boolean): Promise<void> {
    if (!this.currentCode || !this.currentIdentity) throw new Error('Room connection state is missing')
    const code = this.currentCode
    const identity = this.currentIdentity
    const endpoint = this.resolveEndpoint()
    const generation = ++this.generation
    const url = new URL(`${endpoint}/v1/rooms/${encodeURIComponent(code)}/ws`)
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
    this.ws?.close()
    const socket = new WebSocket(url)
    this.ws = socket

    await new Promise<void>((resolve, reject) => {
      let settled = false
      const finish = (error?: Error) => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        if (error) reject(error)
        else resolve()
      }
      const timeout = setTimeout(() => {
        socket.close(4008, 'connection timeout')
        finish(new Error('The room connection timed out'))
      }, CONNECT_TIMEOUT_MS)

      socket.on('open', () => {
        socket.send(JSON.stringify({
          type: 'hello', version: PROTOCOL_VERSION, participant: identity,
          ...(this.hostToken ? { hostToken: this.hostToken } : {}),
        }))
      })
      socket.on('message', (data: RawData) => {
        if (generation !== this.generation) return
        const message = parseWatchTogetherServerMessage(data)
        if (!message) {
          this.setConnectionError('INVALID_SERVER_MESSAGE', 'The room returned an invalid response')
          socket.close(4007, 'invalid server message')
          finish(new Error('The room returned an invalid response'))
          return
        }
        if (message.type === 'pong') return
        if (message.type === 'error') {
          this.setState({ ...this.state, error: message.error, errorCode: message.code })
          if (!this.state.connected) finish(new Error(message.error))
          return
        }
        const snapshot = message.snapshot
        this.reconnectAttempt = 0
        this.reconnectStartedAt = Date.now()
        this.setState({
          code: snapshot.code, connected: true, role: snapshot.role, status: 'connected', endpoint,
          error: null, errorCode: null, content: snapshot.content, playback: snapshot.playback,
          participants: snapshot.participants, chat: snapshot.chat, serverTime: snapshot.serverTime,
        })
        this.startHeartbeat(generation)
        finish()
      })
      socket.on('error', () => {
        if (generation !== this.generation) return
        this.setConnectionError('CONNECTION_FAILED', 'The room connection failed')
        if (failFast) finish(new Error('The room connection failed'))
      })
      socket.on('close', () => {
        if (generation !== this.generation) return
        this.ws = null
        this.stopHeartbeat()
        if (this.intentionalClose || !this.currentCode) return
        this.scheduleReconnect()
        finish(new Error(this.state.error ?? 'The room connection was closed'))
      })
    })
  }

  private scheduleReconnect(): void {
    const elapsed = Date.now() - this.reconnectStartedAt
    if (elapsed >= RECONNECT_WINDOW_MS) {
      this.setConnectionError('RECONNECT_EXHAUSTED', 'The room could not reconnect. Try again manually.')
      return
    }
    const base = RECONNECT_DELAYS_MS[Math.min(this.reconnectAttempt, RECONNECT_DELAYS_MS.length - 1)] ?? 15_000
    const delay = Math.round(base * (0.8 + Math.random() * 0.4))
    this.reconnectAttempt += 1
    this.setState({ ...this.state, connected: false, status: 'reconnecting', error: 'Reconnecting…', errorCode: null })
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      void this.connect(false).catch(() => {})
    }, Math.min(delay, Math.max(0, RECONNECT_WINDOW_MS - elapsed)))
  }

  private send(payload: object): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) throw new Error('Watch Together is not connected')
    this.ws.send(JSON.stringify(payload))
  }

  private startHeartbeat(generation: number): void {
    this.stopHeartbeat()
    this.heartbeatTimer = setInterval(() => {
      if (generation === this.generation && this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ type: 'ping' }))
    }, HEARTBEAT_MS)
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer)
    this.heartbeatTimer = null
  }

  private clearTimers(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
    this.stopHeartbeat()
  }

  private resolveEndpoint(): string {
    return resolveWatchTogetherEndpoint(process.env.ANIPLAY_WATCH_TOGETHER_URL?.trim() || process.env.VITE_WATCH_TOGETHER_URL?.trim() || DEFAULT_ENDPOINT)
  }

  private safeEndpoint(): string {
    try { return this.resolveEndpoint() } catch { return DEFAULT_ENDPOINT }
  }

  private setConnectionError(code: string, error: string): void {
    this.setState({ ...this.state, connected: false, status: 'error', error, errorCode: code })
  }

  private setState(next: WatchTogetherState): void {
    this.state = { ...next }
    this.onChanged?.(this.state)
  }
}
