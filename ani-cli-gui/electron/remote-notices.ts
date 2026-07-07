import { app, shell } from 'electron'
import fs from 'node:fs'
import { join } from 'node:path'
import type { CatalogProvider } from '../src/catalog-types'
import type { RemoteNotice, RemoteNoticeSeverity, RemoteNoticeState } from '../src/remote-notice-types'

const DEFAULT_STATUS_URL = 'https://cdn.vorlie.pl/aniplay/status.json'
const MAX_STATUS_BYTES = 128 * 1024
const REFRESH_INTERVAL_MS = 45 * 60 * 1000
const STARTUP_REFRESH_DELAY_MS = 3_000
const REQUEST_TIMEOUT_MS = 5_000
const STORE_FILE = 'remote-notices.json'

interface RemoteNoticeDocument {
  version: 1
  updatedAt?: string
  notices: RemoteNoticeInput[]
}

interface RemoteNoticeInput {
  id?: unknown
  severity?: unknown
  title?: unknown
  message?: unknown
  providers?: unknown
  minVersion?: unknown
  maxVersion?: unknown
  startsAt?: unknown
  endsAt?: unknown
  dismissible?: unknown
  link?: unknown
}

interface NoticeStore {
  cachedDocument?: unknown
  dismissed?: Record<string, string>
}

const severities = new Set<RemoteNoticeSeverity>(['info', 'warning', 'critical', 'update'])
const providers = new Set<CatalogProvider>(['allanime', 'desu', 'miruro'])

function text(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  if (!normalized || normalized.length > maxLength) return undefined
  return normalized
}

function optionalDate(value: unknown): string | undefined {
  const candidate = text(value, 64)
  if (!candidate) return undefined
  const time = Date.parse(candidate)
  return Number.isFinite(time) ? new Date(time).toISOString() : undefined
}

function isActiveDateRange(input: RemoteNoticeInput, now: Date): boolean {
  const startsAt = optionalDate(input.startsAt)
  if (startsAt && Date.parse(startsAt) > now.getTime()) return false
  const endsAt = optionalDate(input.endsAt)
  if (endsAt && Date.parse(endsAt) <= now.getTime()) return false
  return true
}

function parseSemver(version: string): [number, number, number] | null {
  const match = version.trim().match(/^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/)
  if (!match) return null
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

function compareSemver(left: string, right: string): number {
  const a = parseSemver(left)
  const b = parseSemver(right)
  if (!a || !b) return 0
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] > b[index] ? 1 : -1
  }
  return 0
}

function isActiveVersionRange(input: RemoteNoticeInput, appVersion: string): boolean {
  const minVersion = text(input.minVersion, 32)
  if (minVersion && compareSemver(appVersion, minVersion) < 0) return false
  const maxVersion = text(input.maxVersion, 32)
  if (maxVersion && compareSemver(appVersion, maxVersion) > 0) return false
  return true
}

function normalizeProviders(value: unknown): CatalogProvider[] | undefined {
  if (!Array.isArray(value)) return undefined
  const normalized = value.filter((item): item is CatalogProvider => typeof item === 'string' && providers.has(item as CatalogProvider))
  return normalized.length ? Array.from(new Set(normalized)) : undefined
}

function normalizeLink(value: unknown): string | undefined {
  const candidate = text(value, 500)
  if (!candidate) return undefined
  try {
    const url = new URL(candidate)
    return url.protocol === 'https:' ? url.toString() : undefined
  } catch {
    return undefined
  }
}

export function normalizeRemoteNoticeDocument(value: unknown, appVersion: string, dismissed: Record<string, string> = {}, now = new Date()): RemoteNoticeState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Remote notice document must be an object')
  const document = value as RemoteNoticeDocument
  if (document.version !== 1) throw new Error('Unsupported remote notice document version')
  if (!Array.isArray(document.notices)) throw new Error('Remote notice document must include notices')

  const notices: RemoteNotice[] = []
  for (const input of document.notices) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) continue
    const id = text(input.id, 120)
    const severity = text(input.severity, 32) as RemoteNoticeSeverity | undefined
    const title = text(input.title, 160)
    const message = text(input.message, 1_000)
    if (!id || dismissed[id] || !severity || !severities.has(severity) || !title || !message) continue
    if (!isActiveDateRange(input, now) || !isActiveVersionRange(input, appVersion)) continue
    notices.push({
      id,
      severity,
      title,
      message,
      providers: normalizeProviders(input.providers),
      dismissible: input.dismissible !== false,
      link: normalizeLink(input.link),
    })
  }

  return {
    notices,
    sourceUpdatedAt: optionalDate(document.updatedAt),
    stale: false,
  }
}

function readStore(path: string): NoticeStore {
  try {
    if (!fs.existsSync(path)) return {}
    const parsed = JSON.parse(fs.readFileSync(path, 'utf8')) as NoticeStore
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeStore(path: string, store: NoticeStore): void {
  try {
    fs.writeFileSync(path, `${JSON.stringify(store, null, 2)}\n`, 'utf8')
  } catch {
    // Remote notices are optional; storage failures must not affect playback.
  }
}

export class RemoteNoticeService {
  private readonly statusUrl: string
  private readonly storePath = join(app.getPath('userData'), STORE_FILE)
  private readonly onChanged: (state: RemoteNoticeState) => void
  private readonly appVersion = app.getVersion()
  private store: NoticeStore = {}
  private state: RemoteNoticeState = { notices: [], stale: false }
  private refreshTimer: NodeJS.Timeout | null = null
  private startupTimer: NodeJS.Timeout | null = null
  private refreshPromise: Promise<RemoteNoticeState> | null = null

  constructor(onChanged: (state: RemoteNoticeState) => void, statusUrl = process.env.ANIPLAY_STATUS_URL ?? DEFAULT_STATUS_URL) {
    this.onChanged = onChanged
    this.statusUrl = statusUrl
  }

  initialize(): void {
    this.store = readStore(this.storePath)
    this.applyCachedDocument()
    this.startupTimer = setTimeout(() => { void this.refresh() }, STARTUP_REFRESH_DELAY_MS)
    this.refreshTimer = setInterval(() => { void this.refresh() }, REFRESH_INTERVAL_MS)
  }

  shutdown(): void {
    if (this.startupTimer) clearTimeout(this.startupTimer)
    if (this.refreshTimer) clearInterval(this.refreshTimer)
    this.startupTimer = null
    this.refreshTimer = null
  }

  getState(): RemoteNoticeState {
    return this.state
  }

  async refresh(): Promise<RemoteNoticeState> {
    if (this.refreshPromise) return this.refreshPromise
    this.refreshPromise = this.fetchAndApply().finally(() => { this.refreshPromise = null })
    return this.refreshPromise
  }

  dismiss(id: string): RemoteNoticeState {
    const notice = this.state.notices.find((item) => item.id === id)
    if (!notice || !notice.dismissible) return this.state
    this.store.dismissed = { ...(this.store.dismissed ?? {}), [id]: new Date().toISOString() }
    writeStore(this.storePath, this.store)
    this.applyCachedDocument()
    return this.state
  }

  async openLink(id: string): Promise<boolean> {
    const notice = this.state.notices.find((item) => item.id === id)
    if (!notice?.link) return false
    try {
      const url = new URL(notice.link)
      if (url.protocol !== 'https:') return false
      await shell.openExternal(url.toString())
      return true
    } catch {
      return false
    }
  }

  private applyCachedDocument(error?: string): void {
    if (!this.store.cachedDocument) {
      this.setState({ notices: [], stale: Boolean(error), error })
      return
    }

    try {
      const next = normalizeRemoteNoticeDocument(this.store.cachedDocument, this.appVersion, this.store.dismissed ?? {})
      this.setState({
        ...next,
        fetchedAt: this.state.fetchedAt,
        stale: Boolean(error),
        error,
      })
    } catch {
      this.setState({ notices: [], stale: Boolean(error), error })
    }
  }

  private async fetchAndApply(): Promise<RemoteNoticeState> {
    try {
      const url = new URL(this.statusUrl)
      if (url.protocol !== 'https:') throw new Error('Remote notice URL must use HTTPS')

      const response = await fetch(url, {
        headers: { Accept: 'application/json', 'User-Agent': `AniPlay/${this.appVersion}` },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
      if (!response.ok) throw new Error(`Remote notice endpoint returned ${response.status}`)
      const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''
      if (!contentType.includes('application/json')) throw new Error('Remote notice endpoint did not return JSON')
      const contentLength = Number(response.headers.get('content-length') ?? 0)
      if (contentLength > MAX_STATUS_BYTES) throw new Error('Remote notice response is too large')

      const body = await response.text()
      if (Buffer.byteLength(body, 'utf8') > MAX_STATUS_BYTES) throw new Error('Remote notice response is too large')
      const document = JSON.parse(body) as unknown
      const next = normalizeRemoteNoticeDocument(document, this.appVersion, this.store.dismissed ?? {})
      this.store.cachedDocument = document
      writeStore(this.storePath, this.store)
      this.setState({ ...next, fetchedAt: new Date().toISOString(), stale: false })
      return this.state
    } catch (error) {
      this.applyCachedDocument(error instanceof Error ? error.message : 'Remote notice refresh failed')
      return this.state
    }
  }

  private setState(state: RemoteNoticeState): void {
    this.state = state
    this.onChanged(this.state)
  }
}
