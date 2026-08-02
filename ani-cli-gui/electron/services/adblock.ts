import { app, type Session } from 'electron'
import fs from 'node:fs'
import { promises as fsp } from 'node:fs'
import { join } from 'node:path'
import { ElectronBlocker } from '@ghostery/adblocker-electron'
import type { AdBlockMode, AdBlockSettings, AdBlockState } from '../../src/adblock-types'

const SETTINGS_FILE = 'adblock-settings.json'

const LIST_URLS = {
  easyList: 'https://raw.githubusercontent.com/easylist/easylist/master/easylist/easylist.txt',
  easyPrivacy: 'https://raw.githubusercontent.com/easylist/easylist/master/easyprivacy/easyprivacy.txt',
  ublockFilters: 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/filters.txt',
  badware: 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/badware.txt',
  resourceAbuse: 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/resource-abuse.txt',
  quickFixes: 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/quick-fixes.txt',
  annoyances: 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/annoyances.txt',
} as const

const PRESET_LISTS: Record<AdBlockMode, string[]> = {
  off: [],
  easylist: [
    LIST_URLS.easyList,
  ],
  basic: [
    LIST_URLS.easyList,
    LIST_URLS.ublockFilters,
    LIST_URLS.badware,
    LIST_URLS.resourceAbuse,
  ],
  balanced: [
    LIST_URLS.easyList,
    LIST_URLS.ublockFilters,
    LIST_URLS.badware,
    LIST_URLS.resourceAbuse,
    LIST_URLS.easyPrivacy,
    LIST_URLS.quickFixes,
  ],
  strict: [
    LIST_URLS.easyList,
    LIST_URLS.ublockFilters,
    LIST_URLS.badware,
    LIST_URLS.resourceAbuse,
    LIST_URLS.easyPrivacy,
    LIST_URLS.quickFixes,
    LIST_URLS.annoyances,
  ],
}

const BLOCKED_EMBED_HOST_PATTERNS = [
  /(^|\.)doubleclick\.net$/i,
  /(^|\.)googlesyndication\.com$/i,
  /(^|\.)googleadservices\.com$/i,
  /(^|\.)adservice\.google\./i,
  /(^|\.)adnxs\.com$/i,
  /(^|\.)adsystem\.com$/i,
  /(^|\.)exoclick\.com$/i,
  /(^|\.)exosrv\.com$/i,
  /(^|\.)popcash\.net$/i,
  /(^|\.)popads\.net$/i,
  /(^|\.)propellerads\.com$/i,
  /(^|\.)propellerclick\.com$/i,
  /(^|\.)onclickads\.net$/i,
  /(^|\.)adsterra\.com$/i,
  /(^|\.)highperformanceformat\.com$/i,
  /(^|\.)highperformancecpmgate\.com$/i,
  /(^|\.)statlytic\.net$/i,
  /(^|\.)b7510\.com$/i,
]

const BLOCKED_EMBED_PATH_PATTERNS = [
  /(^|[/?&_.-])(ad|ads|advert|banner|popunder|popup|prebid|vast|vpaid)([/?&_.=-]|$)/i,
]

const DEFAULT_SETTINGS: AdBlockSettings = {
  mode: 'easylist',
  blockKnownAdHosts: true,
}

interface PersistedAdBlockSettings extends AdBlockSettings {
  totalBlockedCount: number
}

function normalizeSettings(value: Partial<AdBlockSettings> | null | undefined): AdBlockSettings {
  const mode = value?.mode === 'off' || value?.mode === 'easylist' || value?.mode === 'basic' || value?.mode === 'balanced' || value?.mode === 'strict'
    ? value.mode
    : DEFAULT_SETTINGS.mode
  return {
    mode,
    blockKnownAdHosts: value?.blockKnownAdHosts !== false,
  }
}

function normalizePersistedSettings(value: Partial<PersistedAdBlockSettings> | null | undefined): PersistedAdBlockSettings {
  const totalBlockedCount = typeof value?.totalBlockedCount === 'number' && Number.isFinite(value.totalBlockedCount) && value.totalBlockedCount >= 0
    ? Math.floor(value.totalBlockedCount)
    : 0
  return {
    ...normalizeSettings(value),
    totalBlockedCount,
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error'
}

function getCacheVersion(): string {
  const now = new Date()

  const year = now.getUTCFullYear()
  const start = Date.UTC(year, 0, 1)
  const days = Math.floor((now.getTime() - start) / 86400000)
  const week = Math.ceil((days + new Date(start).getUTCDay() + 1) / 7)

  return `${year}-w${String(week).padStart(2, '0')}`
}

export class AdBlockService {
  private settings: AdBlockSettings = DEFAULT_SETTINGS
  private blocker: ElectronBlocker | null = null
  private session: Session | null = null
  private blockedCount = 0
  private totalBlockedCount = 0
  private blocksSincePersist = 0
  private lastError: string | undefined
  private loadToken = 0

  initialize(targetSession: Session): void {
    this.session = targetSession
    const persisted = this.readSettings()
    this.settings = persisted
    this.totalBlockedCount = persisted.totalBlockedCount
    this.configureRequestHandler(targetSession)
    void this.loadBlocker()
  }

  shutdown(): void {
    this.persistCountsSync()
    this.session?.webRequest.onBeforeRequest(null)
    this.session = null
    this.blocker = null
  }

  getState(): AdBlockState {
    return {
      ...this.settings,
      active: this.settings.mode !== 'off' || this.settings.blockKnownAdHosts,
      listCount: PRESET_LISTS[this.settings.mode].length,
      blockedCount: this.blockedCount,
      totalBlockedCount: this.totalBlockedCount,
      lastError: this.lastError,
    }
  }

  async setSettings(input: Partial<AdBlockSettings>): Promise<AdBlockState> {
    this.settings = normalizeSettings({ ...this.settings, ...input })
    await this.writeSettings()
    await this.loadBlocker()
    return this.getState()
  }

  shouldBlockKnownEmbeddedRequest(rawUrl: string): boolean {
    if (!this.settings.blockKnownAdHosts) return false
    try {
      const url = new URL(rawUrl)
      const hostname = url.hostname.toLowerCase()
      if (BLOCKED_EMBED_HOST_PATTERNS.some((pattern) => pattern.test(hostname))) return true
      return BLOCKED_EMBED_PATH_PATTERNS.some((pattern) => pattern.test(`${url.pathname}${url.search}`))
    } catch {
      return false
    }
  }

  private configureRequestHandler(targetSession: Session): void {
    targetSession.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (details, callback) => {
      if (this.shouldBlockKnownEmbeddedRequest(details.url)) {
        this.recordBlockedRequest()
        callback({ cancel: true })
        return
      }

      if (!this.blocker || this.settings.mode === 'off') {
        callback({})
        return
      }

      this.blocker.onBeforeRequest(details, (response) => {
        if (response.cancel || response.redirectURL) this.recordBlockedRequest()
        callback(response)
      })
    })
  }

  private recordBlockedRequest(): void {
    this.blockedCount += 1
    this.totalBlockedCount += 1
    this.blocksSincePersist += 1
    if (this.blocksSincePersist >= 10) this.persistCounts()
  }

  private persistCounts(): void {
    if (this.blocksSincePersist <= 0) return
    this.blocksSincePersist = 0
    void this.writeSettings().catch((error: unknown) => {
      this.lastError = errorMessage(error)
      console.warn('[adblock] Could not persist block count:', this.lastError)
    })
  }

  private persistCountsSync(): void {
    if (this.blocksSincePersist <= 0) return
    this.blocksSincePersist = 0
    try {
      const directory = app.getPath('userData')
      fs.mkdirSync(directory, { recursive: true })
      fs.writeFileSync(join(directory, SETTINGS_FILE), JSON.stringify({
        ...this.settings,
        totalBlockedCount: this.totalBlockedCount,
      }, null, 2), 'utf8')
    } catch (error: unknown) {
      this.lastError = errorMessage(error)
      console.warn('[adblock] Could not persist block count:', this.lastError)
    }
  }

  private async cleanupOldCaches(currentVersion: string): Promise<void> {
    const dir = app.getPath('userData')
    const files = await fsp.readdir(dir)

    const prefix = `adblock-${this.settings.mode}-`

    await Promise.all(
      files
        .filter(file =>
          file.startsWith(prefix) &&
          file.endsWith('.bin') &&
          !file.endsWith(`${currentVersion}.bin`)
        )
        .map(file =>
          fsp.unlink(join(dir, file)).catch(() => {})
        )
    )
  }

  private async loadBlocker(): Promise<void> {
    const token = ++this.loadToken
    const urls = PRESET_LISTS[this.settings.mode]
    if (!urls.length) {
      this.blocker = null
      this.lastError = undefined
      return
    }

    try {
      const cacheVersion = getCacheVersion()
      const cachePath = join(app.getPath('userData'), `adblock-${this.settings.mode}-${cacheVersion}.bin`)
      const blocker = await ElectronBlocker.fromLists(fetch, urls, {
        enableMutationObserver: false,
        loadCosmeticFilters: false,
        loadCSPFilters: false,
        loadNetworkFilters: true,
      }, {
        path: cachePath,
        read: fsp.readFile,
        write: fsp.writeFile,
      })
      if (token !== this.loadToken) return
      this.blocker = blocker
      this.lastError = undefined
      console.log(`[adblock] ${this.settings.mode} mode enabled with ${urls.length} lists`)
      await this.cleanupOldCaches(cacheVersion)
    } catch (error: unknown) {
      if (token !== this.loadToken) return
      this.blocker = null
      this.lastError = errorMessage(error)
      console.warn('[adblock] Filter lists could not be enabled:', this.lastError)
    }
  }

  private readSettings(): PersistedAdBlockSettings {
    try {
      const raw = fs.readFileSync(join(app.getPath('userData'), SETTINGS_FILE), 'utf8')
      return normalizePersistedSettings(JSON.parse(raw) as Partial<PersistedAdBlockSettings>)
    } catch {
      return { ...DEFAULT_SETTINGS, totalBlockedCount: 0 }
    }
  }

  private async writeSettings(): Promise<void> {
    const directory = app.getPath('userData')
    await fsp.mkdir(directory, { recursive: true })
    await fsp.writeFile(join(directory, SETTINGS_FILE), JSON.stringify({
      ...this.settings,
      totalBlockedCount: this.totalBlockedCount,
    }, null, 2), 'utf8')
  }
}
