import { gunzipSync, inflateSync } from 'node:zlib'
import type { SearchResult, StreamLink } from '../scrape'

const BASE = 'https://www.miruro.to'
const ANILIST_API = 'https://graphql.anilist.co'
const TIMEOUT_MS = 12_000
const CACHE_TTL_MS = 5 * 60_000
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36'
const PROVIDERS = ['bonk', 'bee', 'ally', 'pewe', 'kiwi', 'moo', 'hop'] as const
const CATEGORIES = ['sub', 'ssub', 'dub'] as const

interface CacheEntry<T> { expiresAt: number; value: Promise<T> }
interface MiruroEpisode { number: string; id?: string; title?: string }
type JsonObject = Record<string, unknown>

const cache = new Map<string, CacheEntry<unknown>>()

function cached<T>(key: string, loader: () => Promise<T>, ttl = CACHE_TTL_MS): Promise<T> {
  const existing = cache.get(key) as CacheEntry<T> | undefined
  if (existing && existing.expiresAt > Date.now()) return existing.value
  const value = loader().catch((error) => { cache.delete(key); throw error })
  cache.set(key, { expiresAt: Date.now() + ttl, value })
  if (cache.size > 80) cache.delete(cache.keys().next().value as string)
  return value
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error'
}

function normalizeAniListId(value: string): string {
  const direct = value.trim().match(/^\d+$/)?.[0]
  if (direct) return direct
  try {
    const url = new URL(value, BASE)
    const id = url.pathname.match(/^\/(?:info|watch)\/(\d+)(?:\/|$)/)?.[1]
    if (id) return id
  } catch { /* invalid URL */ }
  throw new Error('Invalid Miruro anime ID')
}

function slug(value: string): string {
  return value.toLowerCase().normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120) || 'anime'
}

function titleFromMedia(value: JsonObject): string {
  const title = isObject(value.title) ? value.title : {}
  for (const key of ['english', 'romaji', 'native']) {
    const candidate = title[key]
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim()
  }
  return typeof value.name === 'string' ? value.name : `AniList ${String(value.id ?? '')}`.trim()
}

async function fetchJson(input: string | URL, init: RequestInit = {}, timeoutMs = TIMEOUT_MS): Promise<unknown> {
  const response = await fetch(input, {
    ...init,
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      Referer: BASE,
      ...init.headers,
    },
    signal: init.signal ?? AbortSignal.timeout(timeoutMs),
  })
  if (!response.ok) {
    if (response.status === 403) throw new Error('Miruro rejected the request (Cloudflare)')
    throw new Error(`Miruro request failed (${response.status})`)
  }
  const text = await response.text()
  if (/Attention Required!|cf-chl-|Sorry, you have been blocked/i.test(text)) {
    throw new Error('Miruro is protected by a Cloudflare challenge')
  }
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new Error('Miruro returned an invalid JSON response')
  }
}

async function anilist(query: string, variables: JsonObject): Promise<unknown> {
  return fetchJson(ANILIST_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  })
}

export async function searchMiruro(query: string): Promise<SearchResult[]> {
  return cached(`search:${query.toLowerCase()}`, async () => {
    const json = await anilist(`
      query ($search: String!) {
        Page(page: 1, perPage: 40) {
          media(type: ANIME, search: $search, sort: SEARCH_MATCH) {
            id
            title { romaji english native }
            episodes
            isAdult
            coverImage { large medium }
          }
        }
      }
    `, { search: query })
    const page = isObject(json) && isObject(json.data) && isObject(json.data.Page) ? json.data.Page : null
    const media = page && Array.isArray(page.media) ? page.media : []
    return media.flatMap((value): SearchResult[] => {
      if (!isObject(value) || typeof value.id !== 'number' || value.isAdult === true) return []
      const name = titleFromMedia(value)
      return [{
        id: String(value.id),
        name,
        episodes: typeof value.episodes === 'number' ? value.episodes : 0,
        catalogProvider: 'miruro',
      }]
    })
  })
}

function decodePipeText(text: string, obfuscated: string | null): unknown {
  if (!obfuscated) return JSON.parse(text) as unknown
  const padded = text.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(text.length / 4) * 4, '=')
  const bytes = Buffer.from(padded, 'base64')
  if (obfuscated === '2') throw new Error('Miruro returned an unsupported obfuscated response')
  const inflated = bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes) : inflateSync(bytes)
  return JSON.parse(inflated.toString('utf8')) as unknown
}

async function miruroPipe(path: string, query: JsonObject): Promise<unknown> {
  const envelope = { path, method: 'GET', query, body: null }
  const encoded = Buffer.from(JSON.stringify(envelope), 'utf8').toString('base64url')
  const response = await fetch(`${BASE}/api/secure/pipe?e=${encoded}`, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      Referer: `${BASE}/`,
      Origin: BASE,
      'Sec-Fetch-Site': 'same-origin',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Dest': 'empty',
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  const text = await response.text()
  if (!response.ok) {
    if (response.status === 403) throw new Error('Miruro rejected the request (Cloudflare)')
    throw new Error(`Miruro secure request failed (${response.status})`)
  }
  if (/Attention Required!|cf-chl-|Sorry, you have been blocked/i.test(text)) {
    throw new Error('Miruro is protected by a Cloudflare challenge')
  }
  return decodePipeText(text, response.headers.get('x-obfuscated'))
}

function parseEpisodesPayload(value: unknown): MiruroEpisode[] {
  const arrays: unknown[] = []
  const collect = (candidate: unknown) => {
    if (Array.isArray(candidate)) arrays.push(candidate)
    if (!isObject(candidate)) return
    for (const key of ['episodes', 'data', 'items', 'results']) collect(candidate[key])
  }
  collect(value)
  const source: unknown[] = arrays.find((array): array is unknown[] => Array.isArray(array) && array.some((item) => isObject(item) && (item.id !== undefined || item.episodeId !== undefined))) ?? (Array.isArray(arrays[0]) ? arrays[0] : [])
  return source.flatMap((item): MiruroEpisode[] => {
    if (!isObject(item)) return []
    const number = item.number ?? item.episode ?? item.episodeNumber ?? item.ep ?? item.sort
    const id = item.id ?? item.episodeId
    if (number === undefined && id === undefined) return []
    return [{
      number: String(number ?? id).replace(/^episode-/i, '').trim(),
      id: id === undefined ? undefined : String(id),
      title: typeof item.title === 'string' ? item.title : undefined,
    }]
  }).filter((episode) => episode.number)
    .sort((a, b) => Number.parseFloat(a.number) - Number.parseFloat(b.number))
}

async function anilistEpisodes(animeId: string): Promise<MiruroEpisode[]> {
  const json = await anilist('query ($id: Int!) { Media(id: $id, type: ANIME) { episodes title { romaji english native } }}', { id: Number(animeId) })
  const media = isObject(json) && isObject(json.data) && isObject(json.data.Media) ? json.data.Media : null
  const count = typeof media?.episodes === 'number' && media.episodes > 0 ? media.episodes : 0
  return Array.from({ length: count }, (_value, index) => ({ number: String(index + 1) }))
}

async function loadEpisodes(animeId: string): Promise<MiruroEpisode[]> {
  const id = normalizeAniListId(animeId)
  return cached(`episodes:${id}`, async () => {
    try {
      const payload = await miruroPipe('episodes', { anilistId: id })
      const parsed = parseEpisodesPayload(payload)
      if (parsed.length) return parsed
    } catch (error) {
      console.warn('[miruro] Episode API failed, falling back to AniList episode count:', errorMessage(error))
    }
    return anilistEpisodes(id)
  })
}

export async function getMiruroEpisodes(animeId: string): Promise<string[]> {
  return (await loadEpisodes(animeId)).map((episode) => episode.number)
}

function allowedMediaUrl(value: string): string | null {
  try {
    const url = new URL(value.startsWith('//') ? `https:${value}` : value)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    const host = url.hostname.toLowerCase()
    if (host.endsWith('ultracloud.cc') || host.endsWith('anihost.org') || host.endsWith('vid-cdn.xyz') || url.pathname.includes('.m3u8') || url.pathname.includes('.mp4')) return url.toString()
    return null
  } catch { return null }
}

function collectLinks(value: unknown, provider: string, category: string, results: StreamLink[], seen: Set<string>): void {
  if (typeof value === 'string') {
    const url = allowedMediaUrl(value)
    if (!url || seen.has(url)) return
    seen.add(url)
    results.push({
      url,
      resolution: /(\d{3,4}p)/i.exec(url)?.[1] ?? 'Auto',
      hls: url.includes('.m3u8'),
      provider: `Miruro · ${provider}${category ? ` · ${category}` : ''}`,
      downloadable: !url.includes('.m3u8'),
    })
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) collectLinks(item, provider, category, results, seen)
    return
  }
  if (!isObject(value)) return
  const direct = value.url ?? value.file ?? value.src ?? value.link
  if (typeof direct === 'string') {
    const before = results.length
    collectLinks(direct, provider, category, results, seen)
    if (results.length > before) {
      const last = results[results.length - 1]
      const quality = value.quality ?? value.resolution ?? value.label
      if (typeof quality === 'string' && quality.trim()) last.resolution = quality.trim()
      if (typeof value.type === 'string' && value.type.toLowerCase().includes('hls')) last.hls = true
    }
  }
  for (const key of ['sources', 'source', 'streams', 'links', 'data']) collectLinks(value[key], provider, category, results, seen)
}

export async function getMiruroEpisodeLinks(animeId: string, episode: string): Promise<StreamLink[]> {
  const id = normalizeAniListId(animeId)
  const entry = (await loadEpisodes(id)).find((candidate) => candidate.number === episode)
  if (!entry?.id) throw new Error('Miruro episode source lookup needs provider episode metadata. Use the browser fallback for this episode.')

  const results: StreamLink[] = []
  const seen = new Set<string>()
  for (const provider of PROVIDERS) {
    for (const category of CATEGORIES) {
      try {
        const payload = await miruroPipe('sources', { episodeId: entry.id, provider, category, anilistId: id })
        collectLinks(payload, provider, category, results, seen)
      } catch (error) {
        console.warn(`[miruro] Skipped ${provider}/${category}:`, errorMessage(error))
      }
    }
  }
  if (!results.length) throw new Error('No supported Miruro streams are currently available')
  return results
}

export async function getMiruroEpisodePageUrl(animeId: string, episode: string, animeName?: string): Promise<string> {
  const id = normalizeAniListId(animeId)
  const name = animeName?.trim() || `anime-${id}`
  return `${BASE}/watch/${id}/${slug(name)}?ep=${encodeURIComponent(episode)}`
}
