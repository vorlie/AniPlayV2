import { app, BrowserWindow, dialog, ipcMain, session, shell, type IpcMainInvokeEvent } from 'electron'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
import fs from 'node:fs'
import { promises as fsp } from 'node:fs'
import { searchAnime, getEpisodes, getEpisodeLinks, type TranslationType } from './scrape'
import { DownloadManager } from './downloads/download-manager'
import type { DownloadRequest } from '../src/download-types'
import { AniListService } from './services/anilist'
import type { AnimeSummary, ListUpdateInput } from '../src/anilist-types'
import type { AnimeSearchResult } from '../src/catalog-types'
import type { CatalogProvider } from '../src/catalog-types'
import type { WatchTogetherContent, WatchTogetherIdentity, WatchTogetherPlaybackState } from '../src/watch-together-types'
import { DiscordPresenceService, validatePlayback } from './services/discord-presence'
import { getDesuEpisodePageUrl } from './providers/desu'
import { getDocchiEpisodePageUrl } from './providers/docchi'
import { UpdateService } from './services/updater'
import { RemoteNoticeService } from './services/remote-notices'
import { getAniDbEpisodePageUrl, getAniDbMediaHeaders } from './providers/anidb'
import { getAnikotoEpisodePageUrl } from './providers/anikoto'
import { getAnikoto2EpisodePageUrl } from './providers/anikoto2'
import { AdBlockService } from './services/adblock'
import type { AdBlockSettings } from '../src/adblock-types'
import type { ProfileSharePayload } from '../src/profile-share-types'
import { createProfileShareSvg } from '../src/lib/profile-share'
import { ViewingLogService } from './services/viewing-log'
import { WatchTogetherService } from './services/watch-together'
import { correctedMegaPlayContentType, isMegaPlayMediaHost, isProviderOwnedFrameRequest, MEGAPLAY_MEDIA_URL_PATTERNS } from './media-headers'
import { shouldEnableShowcaseDemo, SHOWCASE_PRELOAD_SWITCH } from './showcase/demo-mode'
import { searchNyaa } from './torrents/nyaa'
import { TorrentService } from './torrents/torrent-service'
import type { TorrentRelease, TorrentSettings, TorrentStartInput } from '../src/torrent-types'

const __dirname = dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = join(__dirname, '..')
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? join(process.env.APP_ROOT, 'public') : RENDERER_DIST
const showcaseDemo = shouldEnableShowcaseDemo(app.isPackaged, process.argv)
if (showcaseDemo) {
  app.setPath('userData', resolve(process.env.ANIPLAY_SHOWCASE_USER_DATA ?? join(app.getPath('temp'), 'aniplay-showcase')))
}

let win: BrowserWindow | null
let mediaHeadersConfigured = false
let downloadManager: DownloadManager
let aniListService: AniListService
let discordPresenceService: DiscordPresenceService
let updateService: UpdateService
let remoteNoticeService: RemoteNoticeService
let adBlockService: AdBlockService
let viewingLogService: ViewingLogService
let watchTogetherService: WatchTogetherService
let torrentService: TorrentService
let pendingWatchTogetherInvite: string | null = null
let shutdownStarted = false
let shutdownComplete = false
const hasSingleInstanceLock = app.requestSingleInstanceLock()
if (!hasSingleInstanceLock) app.quit()

const PROJECT_PAGES = {
  documentation: 'https://vorlie.github.io/AniPlayV2/docs/',
  repository: 'https://github.com/vorlie/AniPlayV2',
  issues: 'https://github.com/vorlie/AniPlayV2/issues',
  pulls: 'https://github.com/vorlie/AniPlayV2/pulls',
  discord: 'https://discord.gg/9SXX6ddpNR',
} as const

const GRAPHICS_SETTINGS_FILE = 'graphics-settings.json'
const PROFILE_IMAGE_MAX_BYTES = 5 * 1024 * 1024
const WATCH_TOGETHER_CODE_PATTERN = /^[0-9A-HJKMNP-TV-Z]{10}$/

function watchTogetherIdentity(): WatchTogetherIdentity {
  const session = aniListService.getSession()
  if (!session.authenticated || !session.user) throw new Error('Sign in to AniList before using Watch Together')
  return { aniListId: session.user.id, name: session.user.name, avatar: session.user.avatar ?? null }
}

interface GraphicsSettings {
  safeGraphicsMode: boolean
}

function profileSharePayload(value: unknown): ProfileSharePayload {
  if (!value || typeof value !== 'object') throw new TypeError('Invalid profile share payload')
  const item = value as Partial<ProfileSharePayload>
  const finite = (number: unknown, name: string) => {
    if (typeof number !== 'number' || !Number.isFinite(number) || number < 0) throw new TypeError(`Invalid ${name}`)
    return number
  }
  const shortText = (text: unknown, name: string, max = 100) => {
    if (typeof text !== 'string' || !text.trim() || text.length > max) throw new TypeError(`Invalid ${name}`)
    return text.trim()
  }
  const optionalAniListUrl = (url: unknown) => {
    if (url === undefined) return undefined
    const parsed = new URL(shortText(url, 'image URL', 1000))
    if (parsed.protocol !== 'https:' || !(parsed.hostname === 'anilist.co' || parsed.hostname.endsWith('.anilist.co'))) throw new TypeError('Invalid AniList image URL')
    return parsed.toString()
  }
  if (item.style !== 'hero' && item.style !== 'stats') throw new TypeError('Invalid profile share style')
  if (!item.labels || typeof item.labels !== 'object') throw new TypeError('Invalid profile share labels')
  const labels = item.labels as ProfileSharePayload['labels']
  return {
    style: item.style,
    username: shortText(item.username, 'username', 80),
    avatarUrl: optionalAniListUrl(item.avatarUrl),
    bannerUrl: optionalAniListUrl(item.bannerUrl),
    animeCount: finite(item.animeCount, 'anime count'),
    completed: finite(item.completed, 'completed count'),
    episodesWatched: finite(item.episodesWatched, 'episode count'),
    daysWatched: finite(item.daysWatched, 'watch time'),
    meanScore: finite(item.meanScore, 'mean score'),
    genres: Array.isArray(item.genres) ? item.genres.slice(0, 5).map((genre) => ({ label: shortText(genre?.label, 'genre', 50), count: finite(genre?.count, 'genre count') })) : [],
    milestone: item.milestone === undefined ? undefined : shortText(item.milestone, 'milestone', 80),
    labels: {
      profile: shortText(labels.profile, 'profile label', 50), anime: shortText(labels.anime, 'anime label', 50),
      completed: shortText(labels.completed, 'completed label', 50), episodes: shortText(labels.episodes, 'episodes label', 50),
      days: shortText(labels.days, 'days label', 50), meanScore: shortText(labels.meanScore, 'score label', 50), topGenres: shortText(labels.topGenres, 'genres label', 50),
    },
  }
}

async function imageDataUrl(url?: string) {
  if (!url) return undefined
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(8_000) })
    const type = response.headers.get('content-type')?.split(';')[0]
    const declaredSize = Number(response.headers.get('content-length') ?? 0)
    if (!response.ok || !type?.startsWith('image/') || declaredSize > PROFILE_IMAGE_MAX_BYTES) return undefined
    const bytes = Buffer.from(await response.arrayBuffer())
    if (bytes.length > PROFILE_IMAGE_MAX_BYTES) return undefined
    return `data:${type};base64,${bytes.toString('base64')}`
  } catch { return undefined }
}

async function renderSvgToPng(svg: string) {
  const renderer = new BrowserWindow({
    show: false,
    width: 1200,
    height: 630,
    backgroundColor: '#17131e',
    webPreferences: { sandbox: true, offscreen: true },
  })
  try {
    await renderer.loadURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`)
    await Promise.race([
      renderer.webContents.executeJavaScript('document.fonts.ready.then(() => true)').catch(() => false),
      new Promise((resolve) => setTimeout(resolve, 5_000)),
    ])
    const image = await renderer.webContents.capturePage({ x: 0, y: 0, width: 1200, height: 630 })
    if (image.isEmpty()) throw new Error('Could not render profile image')
    return image.toPNG()
  } finally {
    renderer.destroy()
  }
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
  if (value !== 'desu' && value !== 'docchi' && value !== 'anidb' && value !== 'anikoto' && value !== 'anikoto2') throw new TypeError('catalogProvider must be desu, docchi, anidb, anikoto, or anikoto2')
  return value
}

function requirePositiveInteger(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) throw new TypeError(`${name} must be a positive integer`)
  return value
}

function requireTorrentRelease(value: unknown): TorrentRelease {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Invalid torrent release')
  const item = value as Record<string, unknown>
  const infoHash = requireString(item.infoHash, 'infoHash', 40).toLowerCase()
  if (!/^[a-f0-9]{40}$/.test(infoHash)) throw new TypeError('Invalid torrent info hash')
  const numeric = (candidate: unknown, fallback = 0) => typeof candidate === 'number' && Number.isFinite(candidate) ? candidate : fallback
  const optionalText = (candidate: unknown, max: number) => typeof candidate === 'string' && candidate.length <= max ? candidate : null
  return {
    id: infoHash,
    title: requireString(item.title, 'torrent title', 500),
    infoHash,
    magnet: requireString(item.magnet, 'magnet', 8192),
    size: requireString(item.size, 'torrent size', 60),
    sizeBytes: typeof item.sizeBytes === 'number' && Number.isFinite(item.sizeBytes) && item.sizeBytes >= 0 ? item.sizeBytes : null,
    seeders: Math.max(0, Math.round(numeric(item.seeders))),
    leechers: Math.max(0, Math.round(numeric(item.leechers))),
    publishedAt: optionalText(item.publishedAt, 80),
    trusted: item.trusted === true,
    remake: item.remake === true,
    resolution: optionalText(item.resolution, 20),
    codec: optionalText(item.codec, 30),
    episode: optionalText(item.episode, 30),
    batch: item.batch === true,
  }
}

function requireTorrentStart(value: unknown): TorrentStartInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Invalid torrent start request')
  const item = value as Record<string, unknown>
  return { release: requireTorrentRelease(item.release), episode: requireString(item.episode, 'episode', 32) }
}

function requireTorrentSettings(value: unknown): Partial<TorrentSettings> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Invalid torrent settings')
  const item = value as Record<string, unknown>
  const result: Partial<TorrentSettings> = {}
  for (const key of ['cacheLimitGiB', 'downloadLimitKiB', 'uploadLimitKiB'] as const) {
    if (item[key] !== undefined) {
      if (typeof item[key] !== 'number' || !Number.isFinite(item[key])) throw new TypeError(`Invalid ${key}`)
      result[key] = item[key]
    }
  }
  if (item.cacheDirectory !== undefined) result.cacheDirectory = requireString(item.cacheDirectory, 'cacheDirectory', 1000)
  if (item.mpvPath !== undefined) {
    if (typeof item.mpvPath !== 'string' || item.mpvPath.length > 1000) throw new TypeError('Invalid mpvPath')
    result.mpvPath = item.mpvPath.trim()
  }
  if (item.deleteAfterPlayback !== undefined) result.deleteAfterPlayback = item.deleteAfterPlayback === true
  if (item.privacyAccepted !== undefined) result.privacyAccepted = item.privacyAccepted === true
  return result
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
    '*://*/*',
    ...MEGAPLAY_MEDIA_URL_PATTERNS,
  ]

  session.defaultSession.webRequest.onBeforeSendHeaders({ urls }, (details, callback) => {
    if (isProviderOwnedFrameRequest(details.resourceType, details.frame?.parent?.url, VITE_DEV_SERVER_URL)) {
      callback({ requestHeaders: details.requestHeaders })
      return
    }
    const headers = details.requestHeaders || {}
    const hostname = new URL(details.url).hostname.toLowerCase()
    const isMp4Upload = hostname === 'mp4upload.com' || hostname.endsWith('.mp4upload.com')
    const isDailymotion = hostname === 'dailymotion.com' || hostname.endsWith('.dailymotion.com') || hostname.endsWith('.dmcdn.net')
    const isMegaPlay = isMegaPlayMediaHost(hostname)
    const aniDbHeaders = getAniDbMediaHeaders(details.url)
    if (aniDbHeaders) {
      for (const [key, value] of Object.entries(aniDbHeaders)) headers[key] = value
      callback({ requestHeaders: headers })
      return
    }
    const isAllAnimeMedia = hostname === 'video.wixstatic.com'
      || hostname === 'tools.fast4speed.rsvp' || hostname.endsWith('.fast4speed.rsvp')
    if (!isMp4Upload && !isDailymotion && !isMegaPlay && !isAllAnimeMedia) {
      callback({ requestHeaders: headers })
      return
    }
    const requestReferer = isMegaPlay ? 'https://megaplay.buzz/' : isDailymotion ? 'https://www.dailymotion.com/' : isMp4Upload ? 'https://www.mp4upload.com/' : referer
    headers['Referer'] = requestReferer
    headers['Origin'] = new URL(requestReferer).origin
    if (!headers['User-Agent']) {
      headers['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:150.0) Gecko/20100101 Firefox/150.0'
    }
    callback({ requestHeaders: headers })
  })

  const corsMediaUrls = ['*://*/*']
  session.defaultSession.webRequest.onHeadersReceived({ urls: corsMediaUrls }, (details, callback) => {
    if (isProviderOwnedFrameRequest(details.resourceType, details.frame?.parent?.url, VITE_DEV_SERVER_URL)) {
      callback({ responseHeaders: details.responseHeaders })
      return
    }
    const hostname = new URL(details.url).hostname.toLowerCase()
    const isKnownMedia = hostname === 'video.wixstatic.com'
      || hostname === 'tools.fast4speed.rsvp' || hostname.endsWith('.fast4speed.rsvp')
      || hostname === 'mp4upload.com' || hostname.endsWith('.mp4upload.com')
      || hostname === 'dailymotion.com' || hostname.endsWith('.dailymotion.com') || hostname.endsWith('.dmcdn.net')
      || isMegaPlayMediaHost(hostname)
      || getAniDbMediaHeaders(details.url) !== null
    if (!isKnownMedia) {
      callback({ responseHeaders: details.responseHeaders })
      return
    }
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
    const contentTypeName = Object.keys(responseHeaders).find((name) => name.toLowerCase() === 'content-type')
    const correctedContentType = correctedMegaPlayContentType(details.url, contentTypeName ? responseHeaders[contentTypeName]?.[0] : undefined)
    if (correctedContentType) {
      if (contentTypeName) delete responseHeaders[contentTypeName]
      responseHeaders['Content-Type'] = [correctedContentType]
    }
    callback({ responseHeaders })
  })
}

function createWindow() {
  app.removeListener('open-url', handleOpenUrl)
  app.on('open-url', handleOpenUrl)
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
      additionalArguments: showcaseDemo ? [SHOWCASE_PRELOAD_SWITCH] : [],
    },
  })

  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date).toLocaleString())
    if (pendingWatchTogetherInvite) {
      win?.webContents.send('watchTogether:invite', pendingWatchTogetherInvite)
      pendingWatchTogetherInvite = null
    }
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

  ipcMain.handle('watchTogether:get-config', (event) => {
    assertTrustedSender(event)
    return watchTogetherService.getConfig()
  })
  ipcMain.handle('watchTogether:get-state', (event) => {
    assertTrustedSender(event)
    return watchTogetherService.getState()
  })
  ipcMain.handle('watchTogether:create', async (event, input: unknown) => {
    assertTrustedSender(event)
    if (!input || typeof input !== 'object') throw new TypeError('Invalid watch together input')
    const payload = input as Record<string, unknown>
    return watchTogetherService.create({
      content: payload.content as WatchTogetherContent,
      playback: payload.playback as WatchTogetherPlaybackState,
    }, watchTogetherIdentity())
  })
  ipcMain.handle('watchTogether:join', async (event, input: unknown) => {
    assertTrustedSender(event)
    if (!input || typeof input !== 'object') throw new TypeError('Invalid watch together input')
    const payload = input as Record<string, unknown>
    return watchTogetherService.join({
      code: requireString(payload.code, 'code', 20).trim().toUpperCase(),
    }, watchTogetherIdentity())
  })
  ipcMain.handle('watchTogether:leave', async (event) => {
    assertTrustedSender(event)
    await watchTogetherService.leave()
  })
  ipcMain.handle('watchTogether:reconnect', async (event) => {
    assertTrustedSender(event)
    return watchTogetherService.reconnect()
  })
  ipcMain.handle('watchTogether:send-chat', async (event, body: unknown) => {
    assertTrustedSender(event)
    await watchTogetherService.sendChat(requireString(body, 'body', 500))
  })
  ipcMain.handle('watchTogether:update-playback', async (event, payload: unknown) => {
    assertTrustedSender(event)
    await watchTogetherService.updatePlayback(payload as WatchTogetherPlaybackState)
  })
  ipcMain.handle('watchTogether:set-content', async (event, content: unknown) => {
    assertTrustedSender(event)
    await watchTogetherService.setContent(content as WatchTogetherContent)
  })
  ipcMain.handle('watchTogether:set-ready', async (event, ready: unknown) => {
    assertTrustedSender(event)
    if (typeof ready !== 'boolean') throw new TypeError('ready must be a boolean')
    await watchTogetherService.setReady(ready)
  })
  ipcMain.handle('watchTogether:consume-invite', async (event, code: unknown) => {
    assertTrustedSender(event)
    await watchTogetherService.consumeInvite(requireString(code, 'code', 20))
  })

  // Register the scraping handlers
  ipcMain.handle('search', async (event, query: unknown, translationType: unknown, catalogProvider: unknown, aniListFirstSearch: unknown, includeAdult: unknown) => {
    try {
      assertTrustedSender(event)
      const results = await searchAnime(requireString(query, 'query', 200), requireTranslationType(translationType), requireCatalogProvider(catalogProvider), aniListFirstSearch === true, includeAdult === true)
      return { success: true, data: results }
    } catch (error: unknown) {
      return { success: false, error: errorMessage(error) }
    }
  })

  ipcMain.handle('anilist:auth-status', (event) => { assertTrustedSender(event); return aniListService.getSession() })
  ipcMain.handle('anilist:auth-start', async (event) => { assertTrustedSender(event); return aniListService.startAuth() })
  ipcMain.handle('anilist:auth-logout', (event) => { assertTrustedSender(event); return aniListService.logout() })
  ipcMain.handle('anilist:dashboard', async (event) => { assertTrustedSender(event); return aniListService.dashboard() })
  ipcMain.handle('anilist:profile', async (event) => { assertTrustedSender(event); return aniListService.profile() })
  ipcMain.handle('anilist:profile-export', async (event, value: unknown) => {
    assertTrustedSender(event)
    const payload = profileSharePayload(value)
    const [avatarDataUrl, bannerDataUrl] = await Promise.all([imageDataUrl(payload.avatarUrl), payload.style === 'hero' ? imageDataUrl(payload.bannerUrl) : undefined])
    const svg = createProfileShareSvg(payload, { avatarDataUrl, bannerDataUrl })
    const png = await renderSvgToPng(svg)
    const owner = BrowserWindow.fromWebContents(event.sender)
    const options = { title: 'Save profile card', defaultPath: join(app.getPath('pictures'), `AniPlay-${payload.username.replace(/[^a-z0-9_-]+/gi, '-')}-${payload.style}.png`), filters: [{ name: 'PNG image', extensions: ['png'] }] }
    const result = owner ? await dialog.showSaveDialog(owner, options) : await dialog.showSaveDialog(options)
    if (result.canceled || !result.filePath) return { saved: false }
    await fsp.writeFile(result.filePath, png)
    return { saved: true }
  })
  ipcMain.handle('anilist:media', async (event, id: unknown) => { assertTrustedSender(event); return aniListService.details(requirePositiveInteger(id, 'mediaId')) })
  ipcMain.handle('anilist:media-search', async (event, query: unknown) => { assertTrustedSender(event); return aniListService.searchMedia(requireString(query, 'query', 200)) })
  ipcMain.handle('viewing:summary', (event) => { assertTrustedSender(event); return viewingLogService.getSummary() })
  ipcMain.handle('viewing:append', async (event, value: unknown) => { assertTrustedSender(event); return viewingLogService.append(value) })
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
      catalogProvider: value.catalogProvider === 'desu' || value.catalogProvider === 'docchi' || value.catalogProvider === 'anidb' || value.catalogProvider === 'anikoto' || value.catalogProvider === 'anikoto2' ? value.catalogProvider : 'anikoto',
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
          : provider === 'anidb'
            ? getAniDbEpisodePageUrl(animeId)
            : provider === 'anikoto'
              ? await getAnikotoEpisodePageUrl(animeId, episode, mode)
              : provider === 'anikoto2'
                ? getAnikoto2EpisodePageUrl(animeId, episode)
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

  ipcMain.handle('torrent:search', async (event, query: unknown, episode: unknown) => {
    try {
      assertTrustedSender(event)
      return { success: true, data: await searchNyaa(requireString(query, 'torrent query', 180), requireString(episode, 'episode', 32)) }
    } catch (error: unknown) {
      return { success: false, error: errorMessage(error) }
    }
  })

  ipcMain.handle('torrent:get-state', (event) => {
    assertTrustedSender(event)
    return torrentService.getState()
  })

  ipcMain.handle('torrent:start', async (event, value: unknown) => {
    try {
      assertTrustedSender(event)
      return { success: true, data: await torrentService.start(requireTorrentStart(value)) }
    } catch (error: unknown) {
      return { success: false, error: errorMessage(error) }
    }
  })

  ipcMain.handle('torrent:select-file', (event, index: unknown) => {
    try {
      assertTrustedSender(event)
      if (typeof index !== 'number' || !Number.isInteger(index) || index < 0) throw new Error('fileIndex must be a non-negative integer')
      return { success: true, data: torrentService.selectFile(index) }
    } catch (error: unknown) {
      return { success: false, error: errorMessage(error) }
    }
  })

  ipcMain.handle('torrent:play-external', (event, title: unknown) => {
    try {
      assertTrustedSender(event)
      torrentService.playExternal(requireString(title, 'media title', 500))
      return { success: true }
    } catch (error: unknown) {
      return { success: false, error: errorMessage(error) }
    }
  })

  ipcMain.handle('torrent:stop', async (event) => {
    assertTrustedSender(event)
    return torrentService.stop()
  })

  ipcMain.handle('torrent:get-settings', (event) => {
    assertTrustedSender(event)
    return torrentService.getSettings()
  })

  ipcMain.handle('torrent:set-settings', (event, value: unknown) => {
    assertTrustedSender(event)
    return torrentService.setSettings(requireTorrentSettings(value))
  })

  ipcMain.handle('torrent:choose-cache-directory', async (event) => {
    assertTrustedSender(event)
    const owner = BrowserWindow.fromWebContents(event.sender)
    const options = {
      title: 'Choose torrent cache folder',
      defaultPath: torrentService.getSettings().cacheDirectory,
      properties: ['openDirectory', 'createDirectory'] as Array<'openDirectory' | 'createDirectory'>,
    }
    const result = owner ? await dialog.showOpenDialog(owner, options) : await dialog.showOpenDialog(options)
    if (!result.canceled && result.filePaths[0]) torrentService.setSettings({ cacheDirectory: result.filePaths[0] })
    return torrentService.getSettings()
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

function extractWatchTogetherInvite(value: string): string | null {
  try {
    const parsed = new URL(value)
    if (parsed.protocol !== 'aniplay:') return null
    const path = parsed.hostname === 'watch' ? parsed.pathname : parsed.pathname.replace(/^\/watch(?=\/|$)/, '')
    const code = decodeURIComponent(path).replace(/[\s/-]+/g, '').toUpperCase()
    return WATCH_TOGETHER_CODE_PATTERN.test(code) ? code : null
  } catch {
    return null
  }
}

function deliverWatchTogetherInvite(value: string): void {
  const code = extractWatchTogetherInvite(value)
  if (!code) return
  pendingWatchTogetherInvite = code
  if (watchTogetherService) void watchTogetherService.consumeInvite(code)
  if (!win || win.isDestroyed() || win.webContents.isLoadingMainFrame()) return
  if (win.isMinimized()) win.restore()
  win.focus()
  win.webContents.send('watchTogether:invite', code)
  pendingWatchTogetherInvite = null
}

function handleOpenUrl(event: { preventDefault?: () => void }, url: string): void {
  event.preventDefault?.()
  deliverWatchTogetherInvite(url)
}

app.on('open-url', handleOpenUrl)

app.on('second-instance', (_event, argv) => {
  const invite = argv.find((item) => extractWatchTogetherInvite(item))
  if (invite) deliverWatchTogetherInvite(invite)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('before-quit', (event) => {
  if (shutdownComplete) return
  event.preventDefault()
  if (shutdownStarted) return
  shutdownStarted = true
  adBlockService?.shutdown()
  remoteNoticeService?.shutdown()
  updateService?.shutdown()
  downloadManager?.shutdown()
  aniListService?.shutdown()
  watchTogetherService?.shutdown()
  void Promise.allSettled([
    torrentService?.shutdown(),
    discordPresenceService?.shutdown(),
  ]).finally(() => {
    shutdownComplete = true
    app.quit()
  })
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

if (hasSingleInstanceLock) void app.whenReady().then(async () => {
  if (showcaseDemo) {
    createWindow()
    return
  }
  if (process.defaultApp && process.argv[1]) app.setAsDefaultProtocolClient('aniplay', process.execPath, [resolve(process.argv[1])])
  else app.setAsDefaultProtocolClient('aniplay')
  watchTogetherService = new WatchTogetherService(
    (state) => {
      if (win && !win.isDestroyed()) win.webContents.send('watchTogether:changed', state)
    },
    (code) => {
      if (win && !win.isDestroyed()) win.webContents.send('watchTogether:invite', code)
    },
  )
  remoteNoticeService = new RemoteNoticeService((state) => {
    if (win && !win.isDestroyed()) win.webContents.send('notices:changed', state)
  })
  remoteNoticeService.initialize()
  updateService = new UpdateService((state) => {
    if (win && !win.isDestroyed()) win.webContents.send('updater:changed', state)
  })
  updateService.initialize()
  aniListService = new AniListService()
  await aniListService.initialize()
  void aniListService.validateSession()
  viewingLogService = new ViewingLogService(app.getPath('userData'))
  viewingLogService.initialize()
  discordPresenceService = new DiscordPresenceService()
  discordPresenceService.initialize()
  downloadManager = new DownloadManager((state) => {
    if (win && !win.isDestroyed()) win.webContents.send('downloads:changed', state)
  })
  downloadManager.initialize()
  torrentService = new TorrentService((state) => {
    if (win && !win.isDestroyed()) win.webContents.send('torrent:changed', state)
  })
  await torrentService.initialize()
  adBlockService = new AdBlockService()
  adBlockService.initialize(session.defaultSession)
  configureMediaRequestHeaders()
  createWindow()
  const coldStartInvite = process.argv.find((item) => extractWatchTogetherInvite(item))
  if (coldStartInvite) deliverWatchTogetherInvite(coldStartInvite)
  else if (pendingWatchTogetherInvite) deliverWatchTogetherInvite(`aniplay://watch/${pendingWatchTogetherInvite}`)
})
