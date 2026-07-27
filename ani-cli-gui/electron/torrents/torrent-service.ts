import { app } from 'electron'
import { spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import { join } from 'node:path'
import { randomBytes, randomUUID } from 'node:crypto'
import type { Server } from 'node:http'
import WebTorrent from 'webtorrent'
import type { Instance as WebTorrentInstance, Torrent, TorrentFile } from 'webtorrent'
import type {
  TorrentFileInfo,
  TorrentRelease,
  TorrentSessionState,
  TorrentSettings,
  TorrentStartInput,
  TorrentStartResult,
} from '../../src/torrent-types'
import { extractTorrentEpisode } from './nyaa'

const METADATA_TIMEOUT_MS = 45_000
const VIDEO_EXTENSIONS = new Set(['.mkv', '.mp4', '.webm', '.m4v', '.avi', '.mov'])
const INTERNAL_EXTENSIONS = new Set(['.mp4', '.webm', '.m4v'])
const EMPTY_STATE: TorrentSessionState = {
  phase: 'idle',
  sessionId: null,
  infoHash: null,
  name: null,
  selectedFile: null,
  files: [],
  playbackUrl: null,
  downloadedBytes: 0,
  uploadedBytes: 0,
  downloadSpeed: 0,
  uploadSpeed: 0,
  progress: 0,
  peers: 0,
  error: null,
}

interface NodeTorrentServer {
  server: Server
  pathname: string
  destroy(callback?: () => void): void
}

type PersistedTorrentSettings = Partial<TorrentSettings>

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function extension(path: string): string {
  const match = /\.[a-z0-9]+$/i.exec(path)
  return match?.[0]?.toLowerCase() ?? ''
}

function safeInfoHash(value: string): boolean {
  return /^[a-f0-9]{40}$/i.test(value)
}

function fileInfo(file: TorrentFile, index: number): TorrentFileInfo {
  const ext = extension(file.name)
  return {
    index,
    name: file.name,
    path: file.path,
    sizeBytes: file.length,
    episode: extractTorrentEpisode(file.name),
    playableInternally: INTERNAL_EXTENSIONS.has(ext),
  }
}

function directorySize(path: string): number {
  let total = 0
  try {
    for (const entry of fs.readdirSync(path, { withFileTypes: true })) {
      const child = join(path, entry.name)
      total += entry.isDirectory() ? directorySize(child) : fs.statSync(child).size
    }
  } catch {
    return total
  }
  return total
}

export function chooseEpisodeFile(files: TorrentFileInfo[], episode: string): TorrentFileInfo[] {
  const videos = files.filter((file) => VIDEO_EXTENSIONS.has(extension(file.name)))
  const exact = videos.filter((file) => file.episode === episode)
  if (exact.length) return exact.sort((a, b) => b.sizeBytes - a.sizeBytes)
  return videos.length === 1 ? videos : videos.sort((a, b) => b.sizeBytes - a.sizeBytes)
}

export function selectCacheEvictions<T extends { size: number; modified: number }>(entries: T[], limit: number): T[] {
  const oldestFirst = [...entries].sort((a, b) => a.modified - b.modified)
  let total = oldestFirst.reduce((sum, entry) => sum + entry.size, 0)
  const evictions: T[] = []
  for (const entry of oldestFirst) {
    if (total <= limit) break
    evictions.push(entry)
    total -= entry.size
  }
  return evictions
}

export class TorrentService {
  private readonly onChange: (state: TorrentSessionState) => void
  private client: WebTorrentInstance | null = null
  private server: NodeTorrentServer | null = null
  private state: TorrentSessionState = structuredClone(EMPTY_STATE)
  private settings!: TorrentSettings
  private activeTorrent: Torrent | null = null
  private activePlayer: ChildProcess | null = null
  private stateTimer: NodeJS.Timeout | null = null
  private serverOrigin = ''

  constructor(onChange: (state: TorrentSessionState) => void) {
    this.onChange = onChange
  }

  async initialize(): Promise<void> {
    this.settings = this.loadSettings()
    fs.mkdirSync(this.settings.cacheDirectory, { recursive: true })
    this.cleanupCache()
    this.emit()
  }

  getState(): TorrentSessionState {
    return structuredClone(this.state)
  }

  getSettings(): TorrentSettings {
    return structuredClone(this.settings)
  }

  setSettings(update: Partial<TorrentSettings>): TorrentSettings {
    if (typeof update.cacheDirectory === 'string' && update.cacheDirectory.trim()) this.settings.cacheDirectory = update.cacheDirectory.trim()
    if (typeof update.cacheLimitGiB === 'number' && Number.isFinite(update.cacheLimitGiB)) this.settings.cacheLimitGiB = Math.max(1, Math.min(500, update.cacheLimitGiB))
    if (typeof update.deleteAfterPlayback === 'boolean') this.settings.deleteAfterPlayback = update.deleteAfterPlayback
    if (typeof update.downloadLimitKiB === 'number' && Number.isFinite(update.downloadLimitKiB)) this.settings.downloadLimitKiB = Math.max(0, Math.round(update.downloadLimitKiB))
    if (typeof update.uploadLimitKiB === 'number' && Number.isFinite(update.uploadLimitKiB)) this.settings.uploadLimitKiB = Math.max(0, Math.round(update.uploadLimitKiB))
    if (typeof update.mpvPath === 'string') this.settings.mpvPath = update.mpvPath.trim()
    if (typeof update.privacyAccepted === 'boolean') this.settings.privacyAccepted = update.privacyAccepted
    fs.mkdirSync(this.settings.cacheDirectory, { recursive: true })
    this.applyLimits()
    this.persistSettings()
    return this.getSettings()
  }

  async start(input: TorrentStartInput): Promise<TorrentStartResult> {
    this.validateRelease(input.release)
    if (!this.settings.privacyAccepted) throw new Error('Accept the torrent privacy notice before starting playback')
    await this.stop()
    await this.createClient()
    const client = this.client
    if (!client) throw new Error('Could not initialize the torrent client')
    this.cleanupCache()
    const sessionId = randomUUID()
    this.state = {
      ...structuredClone(EMPTY_STATE),
      phase: 'metadata',
      sessionId,
      infoHash: input.release.infoHash,
      name: input.release.title,
    }
    this.emit()

    const cachePath = join(this.settings.cacheDirectory, input.release.infoHash.toLowerCase())
    fs.mkdirSync(cachePath, { recursive: true })
    const torrent = client.add(input.release.magnet, {
      path: cachePath,
      destroyStoreOnDestroy: this.settings.deleteAfterPlayback,
    })
    this.activeTorrent = torrent
    torrent.on('warning', (error) => console.warn('[torrent]', errorMessage(error)))
    torrent.on('error', (error) => this.fail(errorMessage(error)))
    try {
      await this.waitForMetadata(torrent)
    } catch (error) {
      if (this.activeTorrent === torrent) await this.stop()
      throw error
    }
    if (this.activeTorrent !== torrent) throw new Error('Torrent session was cancelled')

    const files = torrent.files.map(fileInfo).filter((file) => VIDEO_EXTENSIONS.has(extension(file.name)))
    if (!files.length) {
      await this.stop()
      throw new Error('This torrent does not contain a supported video file')
    }
    torrent.files.forEach((file) => file.deselect())
    const candidates = chooseEpisodeFile(files, input.episode)
    this.state = { ...this.state, phase: 'selecting', files, name: torrent.name || input.release.title }
    if (candidates.length === 1) {
      this.selectFile(candidates[0].index)
      return { state: this.getState(), requiresFileSelection: false }
    }
    this.emit()
    return { state: this.getState(), requiresFileSelection: true }
  }

  selectFile(index: number): TorrentSessionState {
    const torrent = this.activeTorrent
    if (!torrent?.ready) throw new Error('Torrent metadata is not ready')
    const file = torrent.files[index]
    const info = this.state.files.find((candidate) => candidate.index === index)
    if (!file || !info || !VIDEO_EXTENSIONS.has(extension(file.name))) throw new Error('Invalid torrent video selection')
    torrent.files.forEach((candidate) => candidate.deselect())
    file.select()
    const relativeUrl = file.streamURL
    this.state = {
      ...this.state,
      phase: 'ready',
      selectedFile: info,
      playbackUrl: `${this.serverOrigin}${relativeUrl}`,
      error: null,
    }
    this.emit()
    return this.getState()
  }

  playExternal(title: string): void {
    if (!this.state.playbackUrl || !this.state.selectedFile) throw new Error('No torrent file is ready to play')
    if (this.activePlayer) throw new Error('mpv is already playing a torrent')
    const executable = this.settings.mpvPath || 'mpv'
    const child = spawn(executable, [
      `--force-media-title=${title}`,
      '--save-position-on-quit=no',
      this.state.playbackUrl,
    ], { windowsHide: true, stdio: 'ignore' })
    this.activePlayer = child
    this.state = { ...this.state, phase: 'playing' }
    this.emit()
    child.once('error', (error) => {
      this.activePlayer = null
      this.fail(`Could not launch mpv: ${error.message}`)
    })
    child.once('close', () => {
      this.activePlayer = null
      if (this.state.phase === 'error') {
        this.emit()
        return
      }
      void this.stop()
    })
  }

  async stop(): Promise<TorrentSessionState> {
    this.activePlayer?.kill()
    this.activePlayer = null
    const torrent = this.activeTorrent
    this.activeTorrent = null
    if (torrent) {
      await new Promise<void>((resolve) => torrent.destroy({ destroyStore: this.settings.deleteAfterPlayback }, () => resolve()))
    }
    await this.destroyClient()
    this.state = { ...structuredClone(EMPTY_STATE), phase: 'stopped' }
    this.emit()
    return this.getState()
  }

  async shutdown(): Promise<void> {
    await this.stop()
  }

  private waitForMetadata(torrent: Torrent): Promise<void> {
    if (torrent.ready) return Promise.resolve()
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup()
        reject(new Error('Timed out while waiting for torrent metadata'))
      }, METADATA_TIMEOUT_MS)
      const ready = () => { cleanup(); resolve() }
      const failed = (error: Error | string) => { cleanup(); reject(new Error(errorMessage(error))) }
      const cleanup = () => {
        clearTimeout(timer)
        torrent.removeListener('ready', ready)
        torrent.removeListener('error', failed)
      }
      torrent.once('ready', ready)
      torrent.once('error', failed)
    })
  }

  private refreshState(): void {
    const torrent = this.activeTorrent
    if (!torrent) return
    this.state = {
      ...this.state,
      downloadedBytes: torrent.downloaded,
      uploadedBytes: torrent.uploaded,
      downloadSpeed: torrent.downloadSpeed,
      uploadSpeed: torrent.uploadSpeed,
      progress: this.state.selectedFile
        ? torrent.files[this.state.selectedFile.index]?.progress ?? torrent.progress
        : torrent.progress,
      peers: torrent.numPeers,
    }
    this.emit()
  }

  private validateRelease(release: TorrentRelease): void {
    if (!safeInfoHash(release.infoHash) || release.id !== release.infoHash) throw new Error('Invalid torrent info hash')
    if (!release.magnet.startsWith(`magnet:?xt=urn:btih:${release.infoHash}`) || release.magnet.length > 8_192) throw new Error('Invalid torrent magnet')
  }

  private applyLimits(): void {
    this.client?.throttleDownload(this.settings.downloadLimitKiB > 0 ? this.settings.downloadLimitKiB * 1024 : -1)
    this.client?.throttleUpload(this.settings.uploadLimitKiB > 0 ? this.settings.uploadLimitKiB * 1024 : -1)
  }

  private async createClient(): Promise<void> {
    if (this.client) return
    const client = new WebTorrent({ maxConns: 55 })
    const token = randomBytes(24).toString('base64url')
    const server = client.createServer({
      hostname: '127.0.0.1',
      origin: '*',
      pathname: `/torrent/${token}`,
    }, 'node') as unknown as NodeTorrentServer
    client.on('error', (error) => this.fail(errorMessage(error)))
    this.client = client
    this.server = server
    this.applyLimits()
    try {
      await new Promise<void>((resolve, reject) => {
        server.server.once('error', reject)
        server.server.listen(0, '127.0.0.1', () => {
          const address = server.server.address()
          if (!address || typeof address === 'string') {
            reject(new Error('Could not bind the torrent streaming server'))
            return
          }
          this.serverOrigin = `http://127.0.0.1:${address.port}`
          resolve()
        })
      })
      this.stateTimer = setInterval(() => this.refreshState(), 500)
    } catch (error) {
      await this.destroyClient()
      throw error
    }
  }

  private async destroyClient(): Promise<void> {
    if (this.stateTimer) clearInterval(this.stateTimer)
    this.stateTimer = null
    this.serverOrigin = ''
    const server = this.server
    const client = this.client
    this.server = null
    this.client = null
    if (server) await new Promise<void>((resolve) => server.destroy(resolve))
    if (client) await new Promise<void>((resolve) => client.destroy(() => resolve()))
  }

  private loadSettings(): TorrentSettings {
    const defaults: TorrentSettings = {
      cacheDirectory: join(app.getPath('userData'), 'torrent-cache'),
      cacheLimitGiB: 20,
      deleteAfterPlayback: false,
      downloadLimitKiB: 0,
      uploadLimitKiB: 0,
      mpvPath: '',
      privacyAccepted: false,
    }
    try {
      const parsed = JSON.parse(fs.readFileSync(this.settingsPath(), 'utf8')) as PersistedTorrentSettings
      return {
        ...defaults,
        ...parsed,
        cacheDirectory: typeof parsed.cacheDirectory === 'string' && parsed.cacheDirectory.trim() ? parsed.cacheDirectory : defaults.cacheDirectory,
      }
    } catch {
      return defaults
    }
  }

  private persistSettings(): void {
    fs.writeFileSync(this.settingsPath(), JSON.stringify(this.settings, null, 2), 'utf8')
  }

  private settingsPath(): string {
    return join(app.getPath('userData'), 'torrent-settings.json')
  }

  private cleanupCache(): void {
    const root = this.settings.cacheDirectory
    const limit = this.settings.cacheLimitGiB * 1024 ** 3
    try {
      const activeInfoHash = this.activeTorrent?.infoHash.toLowerCase()
      const entries = fs.readdirSync(root, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && safeInfoHash(entry.name) && entry.name.toLowerCase() !== activeInfoHash)
        .map((entry) => {
          const path = join(root, entry.name)
          return { path, size: directorySize(path), modified: fs.statSync(path).mtimeMs }
        })
      for (const entry of selectCacheEvictions(entries, limit)) {
        const resolved = fs.realpathSync(entry.path)
        const resolvedRoot = fs.realpathSync(root)
        if (resolved.startsWith(`${resolvedRoot}${process.platform === 'win32' ? '\\' : '/'}`)) {
          fs.rmSync(resolved, { recursive: true, force: true })
        }
      }
    } catch (error) {
      console.warn('[torrent] Cache cleanup skipped:', errorMessage(error))
    }
  }

  private fail(message: string): void {
    this.state = { ...this.state, phase: 'error', error: message }
    this.emit()
  }

  private emit(): void {
    this.onChange(this.getState())
  }
}
