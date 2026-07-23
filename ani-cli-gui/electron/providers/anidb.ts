import { BrowserWindow, session } from 'electron'
import { load } from 'cheerio'
import type { SearchResult, StreamLink, TranslationType } from '../scrape'

const BASE = 'https://anidb.app'
const PARTITION = 'persist:aniplay-anidb'
const CACHE_TTL_MS = 5 * 60_000
const TIMEOUT_MS = 15_000
const CHROMIUM_MAJOR = process.versions.chrome?.split('.')[0] || '138'
const CHROMIUM_VERSION = process.versions.chrome || `${CHROMIUM_MAJOR}.0.0.0`
const PLATFORM_TOKEN = process.platform === 'darwin' ? 'Macintosh; Intel Mac OS X 10_15_7' : process.platform === 'linux' ? 'X11; Linux x86_64' : 'Windows NT 10.0; Win64; x64'
const CLIENT_HINT_PLATFORM = process.platform === 'darwin' ? 'macOS' : process.platform === 'linux' ? 'Linux' : 'Windows'
const USER_AGENT = `Mozilla/5.0 (${PLATFORM_TOKEN}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROMIUM_VERSION} Safari/537.36`
const CHALLENGE_PATTERN = /Just a moment|cf-chl-|challenge-platform|Attention Required|Enable JavaScript and cookies/i

type JsonObject = Record<string, unknown>

interface AniDbIdentity {
  version: 1
  id: number
  slug: string
  title: string
  episodes: number
}

interface AniDbEpisode {
  id: number
  number: string
}

interface CacheEntry<T> {
  expiresAt: number
  value: Promise<T>
}

export class AniDbVerificationRequiredError extends Error {
  constructor() {
    super('AniDB.app requires browser verification')
    this.name = 'AniDbVerificationRequiredError'
  }
}

const cache = new Map<string, CacheEntry<unknown>>()
const mediaPolicies = new Map<string, { expiresAt: number; headers: Record<string, string> }>()
let bootstrappedUntil = 0
let verificationPromise: Promise<void> | null = null
let browserClientWindow: BrowserWindow | null = null

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function cached<T>(key: string, loader: () => Promise<T>): Promise<T> {
  const existing = cache.get(key) as CacheEntry<T> | undefined
  if (existing && existing.expiresAt > Date.now()) return existing.value
  const value = loader().catch((error) => {
    cache.delete(key)
    throw error
  })
  cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, value })
  if (cache.size > 100) cache.delete(cache.keys().next().value as string)
  return value
}

function providerSession() {
  const value = session.fromPartition(PARTITION, { cache: true })
  value.setUserAgent(USER_AGENT, 'en-US,en;q=0.9')
  value.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false))
  return value
}

function requestHeaders(accept = 'application/json, text/plain, */*'): Record<string, string> {
  return {
    Accept: accept,
    'Accept-Language': 'en-US,en;q=0.9',
    'User-Agent': USER_AGENT,
    Referer: `${BASE}/`,
    Origin: BASE,
    'Sec-CH-UA': `"Chromium";v="${CHROMIUM_MAJOR}", "Not=A?Brand";v="24"`,
    'Sec-CH-UA-Mobile': '?0',
    'Sec-CH-UA-Platform': `"${CLIENT_HINT_PLATFORM}"`,
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
  }
}

async function fetchText(url: string, accept?: string, extraHeaders?: Record<string, string>): Promise<string> {
  const target = new URL(url)
  const isAniDbHost = target.hostname === 'anidb.app' || target.hostname.endsWith('.anidb.app')
  let status: number
  let ok: boolean
  let text: string
  if (isAniDbHost && browserClientWindow && !browserClientWindow.isDestroyed()) {
    const result = await fetchInBrowserWindow(browserClientWindow, url, accept)
    status = result.status
    ok = result.ok
    text = result.text
  } else {
    const response = await providerSession().fetch(url, {
      headers: { ...requestHeaders(accept), ...extraHeaders },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: 'follow',
    })
    status = response.status
    ok = response.ok
    text = await response.text()
  }
  if (status === 429) throw new Error('AniDB.app rate limited the request. Please try again later.')
  if (isAniDbHost && (status === 403 || CHALLENGE_PATTERN.test(text))) throw new AniDbVerificationRequiredError()
  if (!ok) throw new Error(`AniDB.app request failed (${status})`)
  return text
}

interface BrowserFetchResult {
  status: number
  ok: boolean
  text: string
}

async function fetchInBrowserWindow(win: BrowserWindow, url: string, accept = 'application/json, text/plain, */*'): Promise<BrowserFetchResult> {
  const target = new URL(url)
  if (target.protocol !== 'https:' || (target.hostname !== 'anidb.app' && !target.hostname.endsWith('.anidb.app'))) {
    throw new Error('AniDB.app browser client rejected a cross-origin request')
  }
  const script = `(async () => {
    const response = await fetch(${JSON.stringify(target.toString())}, {
      credentials: 'include',
      headers: { Accept: ${JSON.stringify(accept)} }
    });
    return { status: response.status, ok: response.ok, text: await response.text() };
  })()`
  const result = await win.webContents.executeJavaScript(script, true) as unknown
  if (!isObject(result) || typeof result.status !== 'number' || typeof result.ok !== 'boolean' || typeof result.text !== 'string') {
    throw new Error('AniDB.app browser client returned an invalid response')
  }
  return { status: result.status, ok: result.ok, text: result.text }
}

async function bootstrap(): Promise<void> {
  if (bootstrappedUntil > Date.now()) return
  await fetchText(`${BASE}/`, 'text/html,application/xhtml+xml')
  bootstrappedUntil = Date.now() + CACHE_TTL_MS
}

async function providerRequest(url: string, accept?: string): Promise<string> {
  await bootstrap()
  return fetchText(url, accept)
}

async function withVerification<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    if (!(error instanceof AniDbVerificationRequiredError)) throw error
    await verifyAniDbAccess()
    bootstrappedUntil = 0
    return operation()
  }
}

export function encodeAniDbId(identity: AniDbIdentity): string {
  return `anidb:${Buffer.from(JSON.stringify(identity), 'utf8').toString('base64url')}`
}

export function decodeAniDbId(value: string): AniDbIdentity {
  if (!value.startsWith('anidb:')) throw new Error('Invalid AniDB.app anime ID')
  try {
    const parsed = JSON.parse(Buffer.from(value.slice(6), 'base64url').toString('utf8')) as unknown
    if (!isObject(parsed) || parsed.version !== 1 || typeof parsed.id !== 'number' || !Number.isInteger(parsed.id) || parsed.id <= 0
      || typeof parsed.slug !== 'string' || typeof parsed.title !== 'string') throw new Error()
    return {
      version: 1,
      id: parsed.id,
      slug: parsed.slug,
      title: parsed.title,
      episodes: typeof parsed.episodes === 'number' && Number.isFinite(parsed.episodes) ? parsed.episodes : 0,
    }
  } catch {
    throw new Error('Invalid AniDB.app anime ID')
  }
}

export function parseAniDbSuggestions(html: string, includeAdult: boolean): SearchResult[] {
  const $ = load(html)
  const results: SearchResult[] = []
  const seen = new Set<number>()
  $('a[href*="/anime/"]').each((_index, element) => {
    const href = $(element).attr('href') ?? ''
    const match = /^\/anime\/(.+)-(\d+)(?:[/?#]|$)/.exec(new URL(href, BASE).pathname)
    if (!match) return
    const id = Number(match[2])
    if (!Number.isInteger(id) || seen.has(id)) return
    const cardText = $(element).text().replace(/\s+/g, ' ').trim()
    const title = $(element).find('img[alt]').attr('alt')?.trim()
      || $(element).find('[data-title]').attr('data-title')?.trim()
      || cardText
    if (!title) return
    const adult = /\b(hentai|erotica|18\+|adult)\b/i.test(`${cardText} ${$(element).attr('class') ?? ''}`)
    if (adult && !includeAdult) return
    const episodeMatch = /(\d+(?:\.\d+)?)\s*(?:episodes?|eps?)\b/i.exec(cardText)
    const episodes = episodeMatch ? Number(episodeMatch[1]) : 0
    seen.add(id)
    results.push({
      id: encodeAniDbId({ version: 1, id, slug: match[1], title, episodes }),
      name: title,
      episodes,
      coverUrl: normalizeHttpsUrl($(element).find('img').attr('src')),
      catalogProvider: 'anidb',
    })
  })
  return results
}

function findArrays(value: unknown, keys: string[]): unknown[][] {
  const arrays: unknown[][] = []
  const visit = (candidate: unknown): void => {
    if (Array.isArray(candidate)) {
      arrays.push(candidate)
      return
    }
    if (!isObject(candidate)) return
    for (const key of keys) if (candidate[key] !== undefined) visit(candidate[key])
  }
  visit(value)
  return arrays
}

export function parseAniDbEpisodes(value: unknown): AniDbEpisode[] {
  const arrays = findArrays(value, ['data', 'episodes', 'items', 'results'])
  const source = arrays.find((items) => items.some((item) => isObject(item) && item.id !== undefined && item.number !== undefined)) ?? []
  const seen = new Set<string>()
  return source.flatMap((item): AniDbEpisode[] => {
    if (!isObject(item)) return []
    const id = Number(item.id)
    const number = String(item.number ?? '').trim()
    if (!Number.isInteger(id) || id <= 0 || !number || seen.has(number)) return []
    seen.add(number)
    return [{ id, number }]
  }).sort((a, b) => Number.parseFloat(a.number) - Number.parseFloat(b.number) || a.number.localeCompare(b.number))
}

function parseJson(text: string, label: string): unknown {
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new Error(`AniDB.app returned malformed ${label} data`)
  }
}

async function loadEpisodes(showId: string): Promise<AniDbEpisode[]> {
  const anime = decodeAniDbId(showId)
  return cached(`episodes:${anime.id}`, () => withVerification(async () => {
    const text = await providerRequest(`${BASE}/api/frontend/anime/${anime.id}/episodes`)
    const episodes = parseAniDbEpisodes(parseJson(text, 'episode'))
    if (!episodes.length) throw new Error('AniDB.app returned no episodes for this title')
    return episodes
  }))
}

function collectLanguageEntries(value: unknown): JsonObject[] {
  return findArrays(value, ['data', 'languages', 'items', 'results'])
    .flat()
    .filter(isObject)
}

function languageEmbedUrl(value: unknown, mode: TranslationType): string {
  const expected = mode === 'dub' ? 'eng' : 'jpn'
  const entry = collectLanguageEntries(value).find((item) => String(item.code ?? item.language ?? '').toLowerCase() === expected)
  const raw = entry?.embed_url ?? entry?.embedUrl ?? entry?.url
  const url = typeof raw === 'string' ? normalizeHttpsUrl(raw) : undefined
  if (!url) throw new Error(`AniDB.app does not provide ${mode === 'dub' ? 'English dubbed' : 'Japanese subbed'} audio for this episode`)
  return url
}

function normalizeHttpsUrl(value: unknown, base = BASE): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined
  try {
    const url = new URL(value.replace(/\\\//g, '/'), base)
    return url.protocol === 'https:' ? url.toString() : undefined
  } catch {
    return undefined
  }
}

export function extractAniDbEmbed(html: string, embedUrl: string): { sources: string[]; subtitles: Array<{ label: string; url: string }> } {
  const sources: string[] = []
  const subtitles: Array<{ label: string; url: string }> = []
  const seen = new Set<string>()
  const addSource = (value: string) => {
    const url = normalizeHttpsUrl(value, embedUrl)
    if (url && !seen.has(url) && /\.(?:m3u8|mp4)(?:[?#]|$)/i.test(url)) {
      seen.add(url)
      sources.push(url)
    }
  }
  for (const match of html.matchAll(/(?:file|src|url)\s*[:=]\s*["']([^"']+)["']/gi)) addSource(match[1])
  for (const match of html.matchAll(/https?:\\?\/\\?\/[^"'\\\s]+?\.(?:m3u8|mp4)(?:\?[^"'\\\s]*)?/gi)) addSource(match[0])
  const $ = load(html)
  $('track[src]').each((_index, element) => {
    const url = normalizeHttpsUrl($(element).attr('src'), embedUrl)
    if (url) subtitles.push({ label: $(element).attr('label')?.trim() || $(element).attr('srclang')?.trim() || 'Subtitles', url })
  })
  for (const match of html.matchAll(/(?:file|src)\s*[:=]\s*["']([^"']+\.vtt[^"']*)["'][^}\]]*?(?:label|kind)\s*[:=]\s*["']([^"']+)["']/gi)) {
    const url = normalizeHttpsUrl(match[1], embedUrl)
    if (url) subtitles.push({ label: match[2], url })
  }
  for (const match of html.matchAll(/https?:\\?\/\\?\/[^"'\\\s]+?\.vtt(?:\?[^"'\\\s]*)?/gi)) {
    const url = normalizeHttpsUrl(match[0], embedUrl)
    if (url) subtitles.push({ label: 'Subtitles', url })
  }
  return { sources, subtitles: subtitles.filter((track, index, all) => all.findIndex((item) => item.url === track.url) === index) }
}

function mediaHeaders(embedUrl: string): Record<string, string> {
  return {
    Referer: embedUrl,
    Origin: new URL(embedUrl).origin,
    'User-Agent': USER_AGENT,
  }
}

function loadEmbedDocument(embedUrl: string): Promise<string> {
  const target = new URL(embedUrl)
  return new Promise<string>((resolve, reject) => {
    let settled = false
    const win = new BrowserWindow({
      show: false,
      width: 960,
      height: 640,
      webPreferences: {
        partition: PARTITION,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
      },
    })
    const timer = setTimeout(() => finish(new Error('AniDB.app embed timed out while loading')), TIMEOUT_MS)
    const finish = (error?: Error, html?: string) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (!win.isDestroyed()) win.close()
      if (error) reject(error)
      else resolve(html ?? '')
    }
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    win.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false))
    win.webContents.session.on('will-download', (event) => event.preventDefault())
    win.webContents.on('will-navigate', (event, url) => {
      try {
        const destination = new URL(url)
        if (destination.origin !== target.origin) event.preventDefault()
      } catch {
        event.preventDefault()
      }
    })
    win.webContents.on('did-fail-load', (_event, code, description, validatedUrl, isMainFrame) => {
      if (isMainFrame) finish(new Error(`AniDB.app embed failed to load (${code}: ${description}) for ${validatedUrl}`))
    })
    win.webContents.on('did-finish-load', () => {
      try {
        if (new URL(win.webContents.getURL()).origin !== target.origin) return
      } catch {
        return
      }
      setTimeout(() => {
        if (settled || win.isDestroyed()) return
        void win.webContents.executeJavaScript('document.documentElement.outerHTML', true)
          .then((html: unknown) => {
            if (typeof html !== 'string' || !html.trim()) finish(new Error('AniDB.app embed returned an empty page'))
            else finish(undefined, html)
          })
          .catch((error: unknown) => finish(error instanceof Error ? error : new Error('AniDB.app embed could not be read')))
      }, 500)
    })
    void win.loadURL(embedUrl, { httpReferrer: `${BASE}/`, userAgent: USER_AGENT })
      .catch((error: unknown) => finish(error instanceof Error ? error : new Error('AniDB.app embed failed to open')))
  })
}

function registerMediaPolicy(url: string, headers: Record<string, string>): void {
  const host = new URL(url).hostname.toLowerCase()
  mediaPolicies.set(host, { expiresAt: Date.now() + 30 * 60_000, headers })
}

export function getAniDbMediaHeaders(url: string): Record<string, string> | null {
  try {
    const policy = mediaPolicies.get(new URL(url).hostname.toLowerCase())
    if (!policy) return null
    if (policy.expiresAt <= Date.now()) {
      mediaPolicies.delete(new URL(url).hostname.toLowerCase())
      return null
    }
    return { ...policy.headers }
  } catch {
    return null
  }
}

export function parseHlsVariants(text: string, masterUrl: string): Array<{ url: string; resolution: string }> {
  const lines = text.split(/\r?\n/)
  const variants: Array<{ url: string; resolution: string }> = []
  for (let index = 0; index < lines.length; index += 1) {
    if (!lines[index].startsWith('#EXT-X-STREAM-INF:')) continue
    const next = lines.slice(index + 1).find((line) => line.trim() && !line.startsWith('#'))?.trim()
    if (!next) continue
    const url = normalizeHttpsUrl(next, masterUrl)
    if (!url) continue
    const height = /RESOLUTION=\d+x(\d+)/i.exec(lines[index])?.[1]
    const label = /NAME="([^"]+)"/i.exec(lines[index])?.[1]
    variants.push({ url, resolution: height ? `${height}p` : label || 'Auto' })
  }
  return variants
}

async function expandSource(source: string, embedUrl: string, subtitles: Array<{ label: string; url: string }>): Promise<StreamLink[]> {
  const headers = mediaHeaders(embedUrl)
  registerMediaPolicy(source, headers)
  if (!source.includes('.m3u8')) {
    return [{ url: source, resolution: 'Auto', hls: false, provider: 'AniDB.app', downloadable: true, subtitles, requestHeaders: headers }]
  }
  let variants: Array<{ url: string; resolution: string }> = []
  try {
    const text = await fetchText(source, 'application/vnd.apple.mpegurl,application/x-mpegURL,*/*', headers)
    variants = text.startsWith('#EXTM3U') ? parseHlsVariants(text, source) : []
  } catch (error) {
    console.warn('[anidb] Could not inspect HLS master; using its Auto source:', error instanceof Error ? error.message : error)
  }
  const links = variants.length ? variants : [{ url: source, resolution: 'Auto' }]
  for (const variant of links) registerMediaPolicy(variant.url, headers)
  for (const subtitle of subtitles) registerMediaPolicy(subtitle.url, headers)
  return links.map((variant) => ({
    url: variant.url,
    resolution: variant.resolution,
    hls: true,
    provider: 'AniDB.app',
    downloadable: true,
    subtitles,
    requestHeaders: headers,
  }))
}

export async function searchAniDb(query: string, includeAdult = false): Promise<SearchResult[]> {
  const normalized = query.trim()
  if (!normalized) return []
  return cached(`search:${normalized.toLowerCase()}:${includeAdult}`, () => withVerification(async () => {
    const html = await providerRequest(`${BASE}/search/suggestions?q=${encodeURIComponent(normalized)}`, 'text/html,*/*')
    const results = parseAniDbSuggestions(html, includeAdult)
    if (!results.length) throw new Error('AniDB.app returned no matching titles')
    return results
  }))
}

export async function getAniDbEpisodes(showId: string): Promise<string[]> {
  return (await loadEpisodes(showId)).map((episode) => episode.number)
}

export async function getAniDbEpisodeLinks(showId: string, episode: string, mode: TranslationType): Promise<StreamLink[]> {
  const item = (await loadEpisodes(showId)).find((candidate) => candidate.number === episode)
  if (!item) throw new Error(`AniDB.app episode ${episode} is unavailable`)
  const languages = await cached(`languages:${item.id}`, () => withVerification(async () => {
    const text = await providerRequest(`${BASE}/api/frontend/episode/${item.id}/languages`)
    return parseJson(text, 'language')
  }))
  const embedUrl = languageEmbedUrl(languages, mode)
  const html = await loadEmbedDocument(embedUrl)
  const extracted = extractAniDbEmbed(html, embedUrl)
  const resolved = (await Promise.all(extracted.sources.map((source) => expandSource(source, embedUrl, extracted.subtitles)))).flat()
  if (!resolved.length) throw new Error('AniDB.app returned no supported native streams for this episode')
  return resolved.filter((link, index, all) => all.findIndex((itemLink) => itemLink.url === link.url) === index)
}

export function getAniDbEpisodePageUrl(showId: string): string {
  const anime = decodeAniDbId(showId)
  return `${BASE}/anime/${anime.slug}-${anime.id}`
}

export function verifyAniDbAccess(): Promise<void> {
  if (browserClientWindow && !browserClientWindow.isDestroyed()) return Promise.resolve()
  if (verificationPromise) return verificationPromise
  verificationPromise = new Promise<void>((resolve, reject) => {
    let settled = false
    let verificationCheck: NodeJS.Timeout | null = null
    const win = new BrowserWindow({
      width: 1080,
      height: 760,
      title: 'Verify AniDB.app access',
      webPreferences: {
        partition: PARTITION,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
      },
    })
    const finish = (error?: Error) => {
      if (settled) return
      settled = true
      if (verificationCheck) clearTimeout(verificationCheck)
      if (error) {
        if (!win.isDestroyed()) win.close()
        reject(error)
      } else {
        browserClientWindow = win
        win.hide()
        resolve()
      }
    }
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    win.webContents.on('will-navigate', (event, url) => {
      try {
        const target = new URL(url)
        if (target.protocol !== 'https:' || (target.hostname !== 'anidb.app' && !target.hostname.endsWith('.anidb.app'))) event.preventDefault()
      } catch {
        event.preventDefault()
      }
    })
    win.webContents.session.on('will-download', (event) => event.preventDefault())
    win.on('closed', () => {
      if (browserClientWindow === win) browserClientWindow = null
      finish(new Error('AniDB.app verification was cancelled'))
    })
    const checkClearance = () => {
      if (settled || win.isDestroyed() || verificationCheck) return
      verificationCheck = setTimeout(() => {
        verificationCheck = null
        void fetchInBrowserWindow(win, `${BASE}/search/suggestions?q=naruto`, 'text/html,*/*').then((response) => {
          const { text } = response
          if (response.ok && !CHALLENGE_PATTERN.test(text)) {
            finish()
            return
          }
          checkClearance()
        }).catch(() => checkClearance())
      }, 750)
    }
    win.webContents.on('did-finish-load', () => {
      try {
        const current = new URL(win.webContents.getURL())
        if (current.protocol !== 'https:' || (current.hostname !== 'anidb.app' && !current.hostname.endsWith('.anidb.app'))) return
        checkClearance()
      } catch {
        // Ignore the initial about:blank navigation.
      }
    })
    void win.loadURL(`${BASE}/`).catch((error: unknown) => finish(error instanceof Error ? error : new Error('Could not open AniDB.app verification')))
  }).finally(() => {
    verificationPromise = null
  })
  return verificationPromise
}
