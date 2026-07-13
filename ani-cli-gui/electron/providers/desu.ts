import { load } from 'cheerio'
import type { SearchResult, StreamLink } from '../scrape'
import { cdaEmbedLink, isCdaEmbedUrl } from './cda'

const BASE = 'https://desu-online.pl'
const TIMEOUT_MS = 12_000
const CACHE_TTL_MS = 5 * 60_000
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36'

interface CacheEntry<T> { expiresAt: number; value: Promise<T> }
interface EpisodeEntry { number: string; title: string; url: string }
const cache = new Map<string, CacheEntry<unknown>>()

function cached<T>(key: string, loader: () => Promise<T>, ttl = CACHE_TTL_MS): Promise<T> {
  const existing = cache.get(key) as CacheEntry<T> | undefined
  if (existing && existing.expiresAt > Date.now()) return existing.value
  const value = loader().catch((error) => { cache.delete(key); throw error })
  cache.set(key, { expiresAt: Date.now() + ttl, value })
  if (cache.size > 50) cache.delete(cache.keys().next().value as string)
  return value
}

async function fetchHtml(url: string, referer = BASE): Promise<string> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'pl-PL,pl;q=0.9,en;q=0.8',
      Referer: referer,
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!response.ok) {
    if (response.status === 403) throw new Error('Desu Online rejected the request (Cloudflare)')
    throw new Error(`Desu Online request failed (${response.status})`)
  }
  const html = await response.text()
  if (isChallengePage(html)) throw new Error('Desu Online is protected by a Cloudflare challenge')
  return html
}

export function isChallengePage(html: string): boolean {
  return /Attention Required!|cf-chl-|Sorry, you have been blocked/i.test(html)
}

function normalizeUrl(value: string, base = BASE): string | null {
  try {
    const url = new URL(value.startsWith('//') ? `https:${value}` : value, base)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    return url.toString()
  } catch { return null }
}

export function validateDesuAnimeId(value: string): string {
  const url = normalizeUrl(value)
  if (!url) throw new Error('Invalid Desu Online anime URL')
  const parsed = new URL(url)
  if (parsed.origin !== BASE || !/^\/anime\/[a-z0-9-]+\/$/i.test(parsed.pathname)) throw new Error('Invalid Desu Online anime URL')
  return parsed.toString()
}

export function parseDesuSearch(html: string): SearchResult[] {
  const $ = load(html)
  const results: SearchResult[] = []
  $('.postbody .listupd article.bs a[itemprop="url"]').each((_index, element) => {
    const href = normalizeUrl($(element).attr('href') ?? '')
    const name = ($(element).attr('title') || $(element).find('[itemprop="headline"]').first().text()).replace(/\s+/g, ' ').trim()
    if (!href || !name) return
    try {
      results.push({ id: validateDesuAnimeId(href), name, episodes: 0, catalogProvider: 'desu' })
    } catch { /* ignore non-anime search cards */ }
  })
  return [...new Map(results.map((result) => [result.id, result])).values()]
}

export function parseDesuEpisodes(html: string): EpisodeEntry[] {
  const $ = load(html)
  const entries: EpisodeEntry[] = []
  $('.eplister li, .epcheck li').each((_index, element) => {
    const anchor = $(element).find('a[href]').first()
    const url = normalizeUrl(anchor.attr('href') ?? '')
    const number = $(element).find('.epl-num').first().text().replace(/\s+/g, ' ').trim()
    const title = $(element).find('.epl-title').first().text().replace(/\s+/g, ' ').trim()
    if (url && number && new URL(url).origin === BASE) entries.push({ number, title, url })
  })
  return [...new Map(entries.map((entry) => [entry.number, entry])).values()]
    .sort((a, b) => {
      const aNumber = Number.parseFloat(a.number)
      const bNumber = Number.parseFloat(b.number)
      return (Number.isFinite(aNumber) ? aNumber : Number.MAX_SAFE_INTEGER)
        - (Number.isFinite(bNumber) ? bNumber : Number.MAX_SAFE_INTEGER)
    })
}

export function parseDesuMirrors(html: string): Array<{ label: string; url: string }> {
  const $ = load(html)
  const mirrors: Array<{ label: string; url: string }> = []
  const addIframe = (markup: string, label: string) => {
    const frame = load(markup)('iframe[src]').first()
    const source = frame.attr('src')
    if (!source) return
    const url = normalizeUrl(source)
    if (url) mirrors.push({ label: label.replace(/\s+/g, ' ').trim() || new URL(url).hostname, url })
  }
  const initial = $('.video-content #pembed iframe[src], .video-content iframe[src]').first()
  if (initial.length) addIframe($.html(initial), 'Default')
  $('select.mirror option[value]').each((_index, element) => {
    try { addIframe(Buffer.from($(element).attr('value') ?? '', 'base64').toString('utf8'), $(element).text()) } catch { /* malformed mirror */ }
  })
  return [...new Map(mirrors.map((mirror) => [mirror.url, mirror])).values()]
}

function dailymotionId(value: string): string | null {
  try {
    const url = new URL(value)
    const pathMatch = url.pathname.match(/\/(?:embed\/video|video)\/([a-zA-Z0-9]+)/)
    return pathMatch?.[1] ?? url.searchParams.get('video')
  } catch { return null }
}

function allowedMediaUrl(value: string, kind: 'dailymotion' | 'rumble'): string | null {
  const normalized = normalizeUrl(value)
  if (!normalized) return null
  const host = new URL(normalized).hostname.toLowerCase()
  if (kind === 'dailymotion' && (host.endsWith('.dailymotion.com') || host === 'dailymotion.com' || host.endsWith('.dmcdn.net'))) return normalized
  if (kind === 'rumble' && (host === 'rumble.com' || host.endsWith('.rumble.com'))) return normalized
  return null
}

async function resolveDailymotion(embedUrl: string): Promise<StreamLink[]> {
  const id = dailymotionId(embedUrl)
  if (!id) return []
  const response = await fetch(`https://www.dailymotion.com/player/metadata/video/${encodeURIComponent(id)}`, {
    headers: { 'User-Agent': USER_AGENT, Referer: BASE }, signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!response.ok) return []
  const json = await response.json()
  return parseDailymotionMetadata(json)
}

export function parseDailymotionMetadata(value: unknown): StreamLink[] {
  const json = value as { error?: unknown; qualities?: Record<string, Array<{ type?: string; url?: string }>> }
  if (json.error || !json.qualities) return []
  const candidates = Object.entries(json.qualities).flatMap(([quality, formats]) => formats.map((format) => ({ quality, ...format })))
  const hls = candidates.find((format) => format.type?.toLowerCase().includes('mpegurl') && typeof format.url === 'string')
  const url = hls?.url ? allowedMediaUrl(hls.url, 'dailymotion') : null
  return url ? [{ url, resolution: hls?.quality === 'auto' ? 'Auto' : `${hls?.quality}p`, hls: true, provider: 'Desu · Dailymotion', downloadable: false }] : []
}

async function resolveIframeWrapper(url: string): Promise<StreamLink[]> {
  const html = await fetchHtml(url, BASE)
  const source = parseIframeWrapper(html)
  const normalized = source ? normalizeUrl(source, url) : null
  return normalized ? resolveDailymotion(normalized) : []
}

export function parseIframeWrapper(html: string): string | undefined {
  return load(html)('iframe[src*="dailymotion.com"]').first().attr('src')
}

async function resolveRumble(embedUrl: string): Promise<StreamLink[]> {
  const html = await fetchHtml(embedUrl, BASE)
  return parseRumbleEmbed(html)
}

export function parseRumbleEmbed(html: string): StreamLink[] {
  const decoded = html.replace(/\\\//g, '/')
  const match = decoded.match(/https:\/\/rumble\.com\/hls-vod\/[a-zA-Z0-9_-]+\/playlist\.m3u8[^"'\s<]*/)
  const url = match ? allowedMediaUrl(match[0].replace(/&amp;/g, '&'), 'rumble') : null
  return url ? [{ url, resolution: 'Auto', hls: true, provider: 'Desu · Rumble', downloadable: false }] : []
}

export async function resolveDesuMirror(mirror: { label: string; url: string }): Promise<StreamLink[]> {
  const host = new URL(mirror.url).hostname.toLowerCase()
  if (isCdaEmbedUrl(mirror.url)) return [cdaEmbedLink(mirror.url, `Desu · ${mirror.label || 'CDA'}`)]
  if (host === 'dailymotion.com' || host.endsWith('.dailymotion.com')) return resolveDailymotion(mirror.url)
  if (host === 'iframely.net' || host.endsWith('.iframely.net')) return resolveIframeWrapper(mirror.url)
  if (host === 'rumble.com' || host.endsWith('.rumble.com')) return resolveRumble(mirror.url)
  return []
}

export async function searchDesu(query: string): Promise<SearchResult[]> {
  return cached(`search:${query.toLowerCase()}`, async () => parseDesuSearch(await fetchHtml(`${BASE}/?s=${encodeURIComponent(query)}`)))
}

async function loadEpisodes(animeId: string): Promise<EpisodeEntry[]> {
  const url = validateDesuAnimeId(animeId)
  return cached(`episodes:${url}`, async () => parseDesuEpisodes(await fetchHtml(url)))
}

export async function getDesuEpisodes(animeId: string): Promise<string[]> {
  return (await loadEpisodes(animeId)).map((entry) => entry.number)
}

export async function getDesuEpisodePageUrl(animeId: string, episode: string): Promise<string> {
  const entry = (await loadEpisodes(animeId)).find((candidate) => candidate.number === episode)
  if (!entry) throw new Error(`Desu Online episode ${episode} was not found`)
  const url = new URL(entry.url)
  if (url.protocol !== 'https:' || url.origin !== BASE) throw new Error('Invalid Desu Online episode URL')
  return url.toString()
}

export async function getDesuEpisodeLinks(animeId: string, episode: string): Promise<StreamLink[]> {
  const entry = (await loadEpisodes(animeId)).find((candidate) => candidate.number === episode)
  if (!entry) throw new Error(`Desu Online episode ${episode} was not found`)
  const mirrors = parseDesuMirrors(await cached(`episode:${entry.url}`, () => fetchHtml(entry.url, animeId), 2 * 60_000))
  if (!mirrors.length) throw new Error('Desu Online did not return mirror information')
  const results = (await Promise.all(mirrors.map(async (mirror) => {
    try { return await resolveDesuMirror(mirror) } catch { return [] }
  }))).flat()
  const unique = [...new Map(results.map((result) => [result.url, result])).values()]
  if (!unique.length) throw new Error('No supported Desu Online mirrors are currently available')
  return unique
}
