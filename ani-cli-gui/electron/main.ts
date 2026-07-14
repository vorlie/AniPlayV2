import { app, BrowserWindow, ipcMain, session, shell, type IpcMainInvokeEvent } from 'electron'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
import fs from 'node:fs'
import { promises as fsp } from 'node:fs'
import { searchAnime, getEpisodes, getEpisodeLinks, reloadCipherMap, type TranslationType } from './scrape'
import { DownloadManager } from './downloads/download-manager'
import type { DownloadRequest } from '../src/download-types'
import { AniListService } from './services/anilist'
import type { AnimeSummary, ListUpdateInput } from '../src/anilist-types'
import type { AnimeSearchResult } from '../src/catalog-types'
import type { CatalogProvider } from '../src/catalog-types'
import { DiscordPresenceService, validatePlayback } from './services/discord-presence'
import { getDesuEpisodePageUrl } from './providers/desu'
import { getDocchiEpisodePageUrl } from './providers/docchi'
import { UpdateService } from './services/updater'
import { RemoteNoticeService } from './services/remote-notices'
import { getMiruroEpisodePageUrl } from './providers/miruro'
import { getAnikotoEpisodePageUrl } from './providers/anikoto'
import { AdBlockService } from './services/adblock'
import type { AdBlockSettings } from '../src/adblock-types'

const __dirname = dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = join(__dirname, '..')
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? join(process.env.APP_ROOT, 'public') : RENDERER_DIST

let win: BrowserWindow | null
let mediaHeadersConfigured = false
let downloadManager: DownloadManager
let aniListService: AniListService
let discordPresenceService: DiscordPresenceService
let updateService: UpdateService
let remoteNoticeService: RemoteNoticeService
let adBlockService: AdBlockService

const PROJECT_PAGES = {
  repository: 'https://github.com/vorlie/AniPlayV2',
  issues: 'https://github.com/vorlie/AniPlayV2/issues',
  pulls: 'https://github.com/vorlie/AniPlayV2/pulls',
  discord: 'https://discord.gg/9SXX6ddpNR',
} as const

const GRAPHICS_SETTINGS_FILE = 'graphics-settings.json'

interface GraphicsSettings {
  safeGraphicsMode: boolean
}

function readGraphicsSettings(): GraphicsSettings {
  try {
    const raw = fs.readFileSync(join(app.getPath('userData'), GRAPHICS_SETTINGS_FILE), 'utf8')
    const data = JSON.parse(raw) as Partial<GraphicsSettings>
    return { safeGraphicsMode: data.safeGraphicsMode === true }
  } catch {
    return { safeGraphicsMode: false }
  }
}

async function writeGraphicsSettings(settings: GraphicsSettings): Promise<GraphicsSettings> {
  const directory = app.getPath('userData')
  await fsp.mkdir(directory, { recursive: true })
  await fsp.writeFile(join(directory, GRAPHICS_SETTINGS_FILE), JSON.stringify(settings, null, 2), 'utf8')
  return settings
}

function hasSafeGraphicsOverride(): boolean {
  return process.argv.includes('--safe-graphics') || process.env.ANIPLAY_SAFE_GRAPHICS === '1'
}

const graphicsSettingsAtStartup = readGraphicsSettings()
const safeGraphicsModeActive = graphicsSettingsAtStartup.safeGraphicsMode || hasSafeGraphicsOverride()
if (safeGraphicsModeActive) {
  app.disableHardwareAcceleration()
  app.commandLine.appendSwitch('disable-gpu-compositing')
}

function isTrustedSender(event: IpcMainInvokeEvent): boolean {
  const frameUrl = event.senderFrame?.url
  if (!frameUrl) return false

  try {
    const url = new URL(frameUrl)
    if (VITE_DEV_SERVER_URL) {
      return url.origin === new URL(VITE_DEV_SERVER_URL).origin
    }
    return url.protocol === 'file:' && resolve(fileURLToPath(url)) === resolve(RENDERER_DIST, 'index.html')
  } catch {
    return false
  }
}

function assertTrustedSender(event: IpcMainInvokeEvent): void {
  if (!isTrustedSender(event)) throw new Error('IPC request rejected')
}

function requireString(value: unknown, name: string, maxLength: number): string {
  if (typeof value !== 'string') throw new TypeError(`${name} must be a string`)
  const normalized = value.trim()
  if (!normalized || normalized.length > maxLength) {
    throw new RangeError(`${name} must contain between 1 and ${maxLength} characters`)
  }
  return normalized
}

function requireTranslationType(value: unknown): TranslationType {
  if (value !== 'sub' && value !== 'dub') throw new TypeError('translationType must be sub or dub')
  return value
}

function requireCatalogProvider(value: unknown): CatalogProvider {
  if (value !== 'allanime' && value !== 'desu' && value !== 'docchi' && value !== 'miruro' && value !== 'anikoto') throw new TypeError('catalogProvider must be allanime, desu, docchi, miruro, or anikoto')
  return value
}

function requirePositiveInteger(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) throw new TypeError(`${name} must be a positive integer`)
  return value
}

function requireDownloadRequest(value: unknown): DownloadRequest {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new TypeError('Invalid download request')
  const request = value as Record<string, unknown>
  const duration = request.durationSeconds
  if (duration !== undefined && (typeof duration !== 'number' || !Number.isFinite(duration) || duration <= 0 || duration > 86_400)) {
    throw new TypeError('durationSeconds must be a positive number')
  }
  return {
    animeId: requireString(request.animeId, 'animeId', 1000),
    animeName: requireString(request.animeName, 'animeName', 300),
    episode: requireString(request.episode, 'episode', 32),
    translationType: requireTranslationType(request.translationType),
    catalogProvider: requireCatalogProvider(request.catalogProvider),
    provider: requireString(request.provider, 'provider', 100),
    resolution: requireString(request.resolution, 'resolution', 32),
    durationSeconds: duration as number | undefined,
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error'
}

function configureMediaRequestHeaders() {
  if (mediaHeadersConfigured) return
  mediaHeadersConfigured = true

  const referer = 'https://youtu-chan.com'
  const urls = [
    '*://video.wixstatic.com/*',
    '*://tools.fast4speed.rsvp/*',
    '*://*.fast4speed.rsvp/*',
    '*://mp4upload.com/*',
    '*://*.mp4upload.com/*',
    '*://dailymotion.com/*',
    '*://*.dailymotion.com/*',
    '*://*.dmcdn.net/*',
    '*://miruro.to/*',
    '*://*.miruro.to/*',
    '*://ultracloud.cc/*',
    '*://*.ultracloud.cc/*',
    '*://megaplay.buzz/*',
    '*://*.megaplay.buzz/*',
    '*://mewstream.buzz/*',
    '*://*.mewstream.buzz/*',
    '*://lostproject.club/*',
    '*://*.lostproject.club/*',
    '*://voltara.click/*',
    '*://*.voltara.click/*',
  ]

  session.defaultSession.webRequest.onBeforeSendHeaders({ urls }, (details, callback) => {
    const headers = details.requestHeaders || {}
    const hostname = new URL(details.url).hostname.toLowerCase()
    const isMp4Upload = hostname === 'mp4upload.com' || hostname.endsWith('.mp4upload.com')
    const isDailymotion = hostname === 'dailymotion.com' || hostname.endsWith('.dailymotion.com') || hostname.endsWith('.dmcdn.net')
    const isMiruro = hostname === 'miruro.to' || hostname.endsWith('.miruro.to') || hostname === 'ultracloud.cc' || hostname.endsWith('.ultracloud.cc')
    const isMegaPlay = hostname === 'megaplay.buzz' || hostname.endsWith('.megaplay.buzz') || hostname === 'mewstream.buzz' || hostname.endsWith('.mewstream.buzz') || hostname === 'lostproject.club' || hostname.endsWith('.lostproject.club') || hostname === 'voltara.click' || hostname.endsWith('.voltara.click')
    const requestReferer = isMegaPlay ? 'https://megaplay.buzz/' : isMiruro ? 'https://www.miruro.to/' : isDailymotion ? 'https://www.dailymotion.com/' : isMp4Upload ? 'https://www.mp4upload.com/' : referer
    headers['Referer'] = requestReferer
    headers['Origin'] = new URL(requestReferer).origin
    if (!headers['User-Agent']) {
      headers['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:150.0) Gecko/20100101 Firefox/150.0'
    }
    callback({ requestHeaders: headers })
  })

  const corsMediaUrls = [
    '*://video.wixstatic.com/*',
    '*://tools.fast4speed.rsvp/*',
    '*://*.fast4speed.rsvp/*',
    '*://mp4upload.com/*',
    '*://*.mp4upload.com/*',
    '*://dailymotion.com/*',
    '*://*.dailymotion.com/*',
    '*://*.dailymotion.com/cdn/*',
    '*://*.dmcdn.net/*',
    '*://ultracloud.cc/*',
    '*://*.ultracloud.cc/*',
    '*://megaplay.buzz/*',
    '*://*.megaplay.buzz/*',
    '*://mewstream.buzz/*',
    '*://*.mewstream.buzz/*',
    '*://lostproject.club/*',
    '*://*.lostproject.club/*',
    '*://voltara.click/*',
    '*://*.voltara.click/*',
  ]
  session.defaultSession.webRequest.onHeadersReceived({ urls: corsMediaUrls }, (details, callback) => {
    const responseHeaders = { ...details.responseHeaders }
    for (const name of Object.keys(responseHeaders)) {
      const lowerName = name.toLowerCase()
      if (
        lowerName === 'access-control-allow-origin'
        || lowerName === 'access-control-allow-methods'
        || lowerName === 'access-control-allow-headers'
        || lowerName === 'access-control-expose-headers'
      ) {
        delete responseHeaders[name]
      }
    }
    responseHeaders['Access-Control-Allow-Origin'] = ['*']
    responseHeaders['Access-Control-Allow-Methods'] = ['GET, HEAD, OPTIONS']
    responseHeaders['Access-Control-Allow-Headers'] = ['Range, Origin, Referer, User-Agent, Content-Type']
    responseHeaders['Access-Control-Expose-Headers'] = ['Content-Length, Content-Range, Accept-Ranges']
    callback({ responseHeaders })
  })
}

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#1C1B1F',
      symbolColor: '#D0BCFF'
    },
    webPreferences: {
      preload: join(__dirname, 'preload.mjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date).toLocaleString())
  })

  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame && errorCode === -3) return
    console.error(isMainFrame ? 'Renderer failed to load:' : 'Subframe failed to load:', { errorCode, errorDescription, validatedURL })
  })

  win.webContents.on('render-process-gone', (_event, details) => {
    console.error('Renderer process gone:', details)
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (adBlockService.shouldBlockKnownEmbeddedRequest(url)) return { action: 'deny' }
    shell.openExternal(url).catch((error: unknown) => console.warn('Could not open external URL:', errorMessage(error)))
    return { action: 'deny' }
  })

  // Register the scraping handlers
  ipcMain.handle('search', async (event, query: unknown, translationType: unknown, catalogProvider: unknown, aniListFirstSearch: unknown, includeAdultDocchi: unknown) => {
    try {
      assertTrustedSender(event)
      const results = await searchAnime(requireString(query, 'query', 200), requireTranslationType(translationType), requireCatalogProvider(catalogProvider), aniListFirstSearch === true, includeAdultDocchi === true)
      return { success: true, data: results }
    } catch (error: unknown) {
      return { success: false, error: errorMessage(error) }
    }
  })

  ipcMain.handle('anilist:auth-status', (event) => { assertTrustedSender(event); return aniListService.getSession() })
  ipcMain.handle('anilist:auth-start', async (event) => { assertTrustedSender(event); return aniListService.startAuth() })
  ipcMain.handle('anilist:auth-logout', (event) => { assertTrustedSender(event); return aniListService.logout() })
  ipcMain.handle('anilist:dashboard', async (event) => { assertTrustedSender(event); return aniListService.dashboard() })
  ipcMain.handle('anilist:media', async (event, id: unknown) => { assertTrustedSender(event); return aniListService.details(requirePositiveInteger(id, 'mediaId')) })
  ipcMain.handle('anilist:list-update', async (event, input: unknown) => {
    assertTrustedSender(event)
    if (!input || typeof input !== 'object') throw new TypeError('Invalid list update')
    const value = input as ListUpdateInput
    requirePositiveInteger(value.mediaId, 'mediaId')
    if (!['CURRENT', 'PLANNING', 'COMPLETED', 'PAUSED', 'DROPPED', 'REPEATING'].includes(value.status)) throw new TypeError('Invalid list status')
    for (const [name, item] of Object.entries({ progress: value.progress, score: value.score, repeat: value.repeat })) if (item !== undefined && (typeof item !== 'number' || !Number.isFinite(item) || item < 0)) throw new TypeError(`${name} must be a non-negative number`)
    return aniListService.updateList(value)
  })
  ipcMain.handle('anilist:list-delete', async (event, id: unknown) => { assertTrustedSender(event); return aniListService.deleteList(requirePositiveInteger(id, 'entryId')) })
  ipcMain.handle('anilist:mapping-resolve', (event, media: unknown, candidates: unknown, translationType: unknown) => {
    assertTrustedSender(event); const mode = requireTranslationType(translationType)
    if (!media || typeof media !== 'object' || !Array.isArray(candidates)) throw new TypeError('Invalid mapping request')
    return aniListService.resolveMapping(media as AnimeSummary, candidates as AnimeSearchResult[], mode)
  })
  ipcMain.handle('anilist:mapping-confirm', (event, mediaId: unknown, anime: unknown, translationType: unknown) => {
    assertTrustedSender(event); const mode = requireTranslationType(translationType)
    if (!anime || typeof anime !== 'object') throw new TypeError('Invalid catalog candidate')
    return aniListService.confirmMapping(requirePositiveInteger(mediaId, 'mediaId'), anime as AnimeSearchResult, mode)
  })
  ipcMain.handle('anilist:mapping-forget', (event, mediaId: unknown) => { assertTrustedSender(event); return aniListService.forgetMapping(requirePositiveInteger(mediaId, 'mediaId')) })
  ipcMain.handle('anilist:mapping-enrich', async (event, anime: unknown, translationType: unknown) => {
    assertTrustedSender(event); const mode = requireTranslationType(translationType)
    if (!anime || typeof anime !== 'object') throw new TypeError('Invalid catalog anime')
    const value = anime as Record<string, unknown>
    const normalized: AnimeSearchResult = {
      id: requireString(value.id, 'animeId', 1000),
      name: requireString(value.name, 'animeName', 300),
      episodes: typeof value.episodes === 'number' && Number.isInteger(value.episodes) && value.episodes >= 0 ? value.episodes : 0,
      catalogProvider: value.catalogProvider === 'desu' || value.catalogProvider === 'docchi' || value.catalogProvider === 'miruro' || value.catalogProvider === 'anikoto' ? value.catalogProvider : 'allanime',
    }
    return aniListService.resolveAniListMetadata(normalized, mode)
  })

  ipcMain.handle('discord-presence:get-settings', (event) => { assertTrustedSender(event); return discordPresenceService.getSettings() })
  ipcMain.handle('discord-presence:set-enabled', (event, enabled: unknown) => {
    assertTrustedSender(event)
    if (typeof enabled !== 'boolean') throw new TypeError('enabled must be a boolean')
    return discordPresenceService.setEnabled(enabled)
  })
  ipcMain.handle('discord-presence:update', (event, playback: unknown) => { assertTrustedSender(event); return discordPresenceService.update(validatePlayback(playback)) })
  ipcMain.handle('discord-presence:clear', async (event) => { assertTrustedSender(event); await discordPresenceService.clear() })

  ipcMain.handle('episodes', async (event, showId: unknown, translationType: unknown, catalogProvider: unknown) => {
    try {
      assertTrustedSender(event)
      const eps = await getEpisodes(requireString(showId, 'showId', 1000), requireTranslationType(translationType), requireCatalogProvider(catalogProvider))
      return { success: true, data: eps }
    } catch (error: unknown) {
      return { success: false, error: errorMessage(error) }
    }
  })

  ipcMain.handle('links', async (event, showId: unknown, epNo: unknown, translationType: unknown, catalogProvider: unknown) => {
    try {
      assertTrustedSender(event)
      const links = await getEpisodeLinks(
        requireString(showId, 'showId', 1000),
        requireString(epNo, 'episode', 32),
        requireTranslationType(translationType),
        requireCatalogProvider(catalogProvider),
      )
      return { success: true, data: links }
    } catch (error: unknown) {
      return { success: false, error: errorMessage(error) }
    }
  })

  ipcMain.handle('open-provider-episode', async (event, showId: unknown, epNo: unknown, catalogProvider: unknown, translationType: unknown) => {
    try {
      assertTrustedSender(event)
      const provider = requireCatalogProvider(catalogProvider)
      const animeId = requireString(showId, 'showId', 1000)
      const episode = requireString(epNo, 'episode', 32)
      const mode = translationType === undefined ? 'sub' : requireTranslationType(translationType)
      const url = provider === 'desu'
        ? await getDesuEpisodePageUrl(animeId, episode)
        : provider === 'docchi'
          ? await getDocchiEpisodePageUrl(animeId, episode)
          : provider === 'miruro'
            ? await getMiruroEpisodePageUrl(animeId, episode)
            : provider === 'anikoto'
              ? await getAnikotoEpisodePageUrl(animeId, episode, mode)
              : null
      if (!url) throw new Error('Browser fallback is not available for this provider')
      await shell.openExternal(url)
      return { success: true }
    } catch (error: unknown) {
      return { success: false, error: errorMessage(error) }
    }
  })

  ipcMain.handle('open-project-page', async (event, page: unknown) => {
    try {
      assertTrustedSender(event)
      if (typeof page !== 'string' || !(page in PROJECT_PAGES)) return { success: false }
      await shell.openExternal(PROJECT_PAGES[page as keyof typeof PROJECT_PAGES])
      return { success: true }
    } catch {
      return { success: false }
    }
  })

  ipcMain.handle('graphics:get-settings', (event) => {
    assertTrustedSender(event)
    const settings = readGraphicsSettings()
    return {
      ...settings,
      active: safeGraphicsModeActive,
      restartRequired: settings.safeGraphicsMode !== graphicsSettingsAtStartup.safeGraphicsMode,
      launchOverride: hasSafeGraphicsOverride(),
    }
  })

  ipcMain.handle('graphics:set-safe-mode', async (event, enabled: unknown) => {
    assertTrustedSender(event)
    if (typeof enabled !== 'boolean') throw new TypeError('enabled must be boolean')
    const settings = await writeGraphicsSettings({ safeGraphicsMode: enabled })
    return {
      ...settings,
      active: safeGraphicsModeActive,
      restartRequired: settings.safeGraphicsMode !== graphicsSettingsAtStartup.safeGraphicsMode,
      launchOverride: hasSafeGraphicsOverride(),
    }
  })

  ipcMain.handle('adblock:get-state', (event) => {
    assertTrustedSender(event)
    return adBlockService.getState()
  })

  ipcMain.handle('adblock:set-settings', async (event, settings: unknown) => {
    assertTrustedSender(event)
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) throw new TypeError('Invalid adblock settings')
    const value = settings as Partial<AdBlockSettings>
    return adBlockService.setSettings({
      mode: value.mode,
      blockKnownAdHosts: value.blockKnownAdHosts,
    })
  })

  ipcMain.handle('sync-ciphermap', async (event) => {
    try {
      assertTrustedSender(event)
      // Resolve the latest release tag from GitHub API
      const releasesRes = await fetch(
        'https://api.github.com/repos/pystardust/ani-cli/releases/latest',
        { headers: { 'Accept': 'application/vnd.github+json', 'User-Agent': 'AniPlayV2' }, signal: AbortSignal.timeout(10_000) }
      )
      if (!releasesRes.ok) throw new Error(`GitHub releases API returned ${releasesRes.status}`)
      const releaseJson = await releasesRes.json() as { tag_name: string }
      const tag = releaseJson.tag_name

      const ANI_CLI_RAW = `https://raw.githubusercontent.com/pystardust/ani-cli/${tag}/ani-cli`
      const res = await fetch(ANI_CLI_RAW, { signal: AbortSignal.timeout(15_000) })
      if (!res.ok) throw new Error(`GitHub returned ${res.status} for tag ${tag}`)
      const content = await res.text()

      // ---- parse ciphermap — new format: inline s/^XX$/Y/g; entries in provider_init ----
      // The sed chain lives on one long line inside provider_init(), e.g.:
      //   s/^79$/A/g;s/^7a$/B/g;...
      const pairRegex = /s\/\^([0-9a-f]{2})\$\/((?:\\.|[^/])*)\//g
      const cipherMap: Record<string, string> = {}

      for (const match of content.matchAll(pairRegex)) {
        const hex = match[1]
        let ch = match[2]
        ch = ch
          .replace(/\\\//g, '/')
          .replace(/\\\[/g, '[')
          .replace(/\\\]/g, ']')
          .replace(/\\\(/g, '(')
          .replace(/\\\)/g, ')')
          .replace(/\\\$/g, '$')
          .replace(/\\\\/g, '\\')
        cipherMap[hex] = ch
      }

      if (Object.keys(cipherMap).length < 60) {
        throw new Error(`Parsed too few map entries (${Object.keys(cipherMap).length}); aborting`)
      }

      const readVar = (name: string) => {
        const m = content.match(new RegExp(`${name}="([^"]*)"`)) 
        return m ? m[1] : null
      }
      const queryHashMatch = content.match(/query_hash="([a-f0-9]{32,64})"/i)
      const keySeedMatch   = content.match(/printf '%s' '([^']+)' \| openssl dgst -sha256/i)

      const payload = {
        source:      `github:pystardust/ani-cli@${tag}`,
        tag,
        generatedAt: new Date().toISOString(),
        entries:     Object.keys(cipherMap).length,
        metadata: {
          userAgent:   readVar('agent'),
          referer:     readVar('allanime_refr'),
          baseDomain:  readVar('allanime_base'),
          apiUrl:      readVar('allanime_api'),
          modeDefault: readVar('mode'),
          queryHash:   queryHashMatch ? queryHashMatch[1] : null,
          keySeed:     keySeedMatch   ? keySeedMatch[1]   : null,
        },
        cipherMap,
      }

      const outPath = join(app.getPath('userData'), 'ciphermap.json')
      fs.writeFileSync(outPath, JSON.stringify(payload, null, 2) + '\n', 'utf8')

      // hot-reload into the running scraper
      reloadCipherMap(cipherMap)

      return { success: true, entries: payload.entries, generatedAt: payload.generatedAt, tag, source: payload.source }
    } catch (error: unknown) {
      return { success: false, error: errorMessage(error) }
    }
  })

  ipcMain.handle('get-ciphermap-info', async (event) => {
    try {
      assertTrustedSender(event)
      const outPath = join(app.getPath('userData'), 'ciphermap.json')
      if (!fs.existsSync(outPath)) return { success: true, data: null }
      const raw = fs.readFileSync(outPath, 'utf8')
      const parsed = JSON.parse(raw)
      return { success: true, data: { generatedAt: parsed.generatedAt, entries: parsed.entries, source: parsed.source, tag: parsed.tag ?? null } }
    } catch {
      return { success: true, data: null }
    }
  })

  ipcMain.handle('downloads:get-state', (event) => {
    assertTrustedSender(event)
    return downloadManager.getState()
  })

  ipcMain.handle('downloads:start', (event, request: unknown) => {
    try {
      assertTrustedSender(event)
      return downloadManager.start(requireDownloadRequest(request))
    } catch (error: unknown) {
      return { success: false, error: errorMessage(error) }
    }
  })

  ipcMain.handle('downloads:cancel', (event, id: unknown) => {
    try {
      assertTrustedSender(event)
      return downloadManager.cancel(requireString(id, 'downloadId', 100))
    } catch (error: unknown) {
      return { success: false, error: errorMessage(error) }
    }
  })

  ipcMain.handle('downloads:retry', (event, id: unknown) => {
    try {
      assertTrustedSender(event)
      return downloadManager.retry(requireString(id, 'downloadId', 100))
    } catch (error: unknown) {
      return { success: false, error: errorMessage(error) }
    }
  })

  ipcMain.handle('downloads:clear-finished', (event) => {
    assertTrustedSender(event)
    return downloadManager.clearFinished()
  })

  ipcMain.handle('downloads:choose-directory', async (event) => {
    assertTrustedSender(event)
    return downloadManager.chooseDirectory()
  })

  ipcMain.handle('downloads:reveal', (event, id: unknown) => {
    try {
      assertTrustedSender(event)
      return downloadManager.reveal(requireString(id, 'downloadId', 100))
    } catch (error: unknown) {
      return { success: false, error: errorMessage(error) }
    }
  })

  ipcMain.handle('updater:get-state', (event) => { assertTrustedSender(event); return updateService.getState() })
  ipcMain.handle('updater:check', (event) => { assertTrustedSender(event); return updateService.check() })
  ipcMain.handle('updater:download', (event) => { assertTrustedSender(event); return updateService.download() })
  ipcMain.handle('updater:install', (event) => { assertTrustedSender(event); updateService.install() })

  ipcMain.handle('notices:get-state', (event) => { assertTrustedSender(event); return remoteNoticeService.getState() })
  ipcMain.handle('notices:refresh', (event) => { assertTrustedSender(event); return remoteNoticeService.refresh() })
  ipcMain.handle('notices:dismiss', (event, id: unknown) => {
    assertTrustedSender(event)
    return remoteNoticeService.dismiss(requireString(id, 'noticeId', 120))
  })
  ipcMain.handle('notices:open', (event, id: unknown) => {
    assertTrustedSender(event)
    return remoteNoticeService.openLink(requireString(id, 'noticeId', 120))
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
    win.webContents.openDevTools()
  } else {
    const indexPath = join(RENDERER_DIST, 'index.html')
    win.loadFile(indexPath).catch((err) => {
      console.error('Failed to load renderer index.html:', indexPath, err)
    })
  }
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('before-quit', () => { adBlockService?.shutdown(); remoteNoticeService?.shutdown(); updateService?.shutdown(); downloadManager?.shutdown(); aniListService?.shutdown(); void discordPresenceService?.shutdown() })

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.whenReady().then(() => {
  remoteNoticeService = new RemoteNoticeService((state) => {
    if (win && !win.isDestroyed()) win.webContents.send('notices:changed', state)
  })
  remoteNoticeService.initialize()
  updateService = new UpdateService((state) => {
    if (win && !win.isDestroyed()) win.webContents.send('updater:changed', state)
  })
  updateService.initialize()
  aniListService = new AniListService()
  aniListService.initialize()
  void aniListService.validateSession()
  discordPresenceService = new DiscordPresenceService()
  discordPresenceService.initialize()
  downloadManager = new DownloadManager((state) => {
    if (win && !win.isDestroyed()) win.webContents.send('downloads:changed', state)
  })
  downloadManager.initialize()
  adBlockService = new AdBlockService()
  adBlockService.initialize(session.defaultSession)
  configureMediaRequestHeaders()
  createWindow()
})
