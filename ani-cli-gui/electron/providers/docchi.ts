import type { SearchResult, StreamLink } from '../scrape'

const API_BASE = 'https://api.docchi.pl/v1'
const SITE_BASE = 'https://docchi.pl'
const TIMEOUT_MS = 12_000
const CACHE_TTL_MS = 5 * 60_000
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36'

type JsonObject = Record<string, unknown>

interface CacheEntry<T> { expiresAt: number; value: Promise<T> }
const cache = new Map<string, CacheEntry<unknown>>()

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function number(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function cached<T>(key: string, loader: () => Promise<T>, ttl = CACHE_TTL_MS): Promise<T> {
  const existing = cache.get(key) as CacheEntry<T> | undefined
  if (existing && existing.expiresAt > Date.now()) return existing.value
  const value = loader().catch((error) => { cache.delete(key); throw error })
  cache.set(key, { expiresAt: Date.now() + ttl, value })
  if (cache.size > 50) cache.delete(cache.keys().next().value as string)
  return value
}

async function fetchJson(input: string, timeoutMs = TIMEOUT_MS): Promise<unknown> {
  const response = await fetch(input, {
    headers: {
      Accept: 'application/json',
      'Accept-Language': 'pl-PL,pl;q=0.9,en;q=0.8',
      'User-Agent': USER_AGENT,
      Referer: SITE_BASE,
    },
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!response.ok) {
    if (response.status === 404) throw new Error('Docchi did not find this title or episode')
    throw new Error(`Docchi request failed (${response.status})`)
  }
  return await response.json() as unknown
}

function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

function isAdultEntry(value: JsonObject): boolean {
  const adult = value.adult_content
  return adult === true || adult === 'true' || adult === 1 || adult === '1'
}

function scoreSeries(query: string, value: JsonObject): number {
  const normalizedQuery = normalizeSearchText(query)
  if (!normalizedQuery) return 0
  const candidates = [
    text(value.title),
    text(value.title_en),
    text(value.slug),
    ...(Array.isArray(value.synonyms) ? value.synonyms.map(text) : []),
  ].filter((item): item is string => Boolean(item)).map(normalizeSearchText)

  let best = 0
  for (const candidate of candidates) {
    if (candidate === normalizedQuery) best = Math.max(best, 100)
    else if (candidate.startsWith(normalizedQuery)) best = Math.max(best, 82)
    else if (candidate.includes(normalizedQuery)) best = Math.max(best, 68)
    else {
      const queryWords = normalizedQuery.split(' ').filter(Boolean)
      const candidateWords = new Set(candidate.split(' ').filter(Boolean))
      const overlap = queryWords.filter((word) => candidateWords.has(word)).length
      if (overlap) best = Math.max(best, Math.round((overlap / queryWords.length) * 55))
    }
  }
  return best
}

export function parseDocchiSeriesList(value: unknown, query: string, includeAdult = false): SearchResult[] {
  if (!Array.isArray(value)) throw new Error('Docchi series list response was invalid')
  return value
    .flatMap((entry): Array<SearchResult & { score: number }> => {
      if (!isObject(entry) || (!includeAdult && isAdultEntry(entry))) return []
      const slug = text(entry.slug)
      const title = text(entry.title) ?? text(entry.title_en)
      if (!slug || !title) return []
      const score = scoreSeries(query, entry)
      if (score <= 0) return []
      return [{
        id: slug,
        name: text(entry.title_en) ? `${title} / ${text(entry.title_en)}` : title,
        episodes: number(entry.episodes) ?? 0,
        coverUrl: text(entry.cover),
        catalogProvider: 'docchi',
        score,
      }]
    })
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, 40)
    .map((item) => ({
      id: item.id,
      name: item.name,
      episodes: item.episodes,
      aniListMediaId: item.aniListMediaId,
      coverUrl: item.coverUrl,
      catalogProvider: item.catalogProvider,
    }))
}

export function parseDocchiEpisodeList(value: unknown): string[] {
  if (!Array.isArray(value)) throw new Error('Docchi episode list response was invalid')
  return value
    .flatMap((entry) => {
      if (!isObject(entry)) return []
      const episode = number(entry.anime_episode_number)
      return episode ? [String(episode)] : []
    })
    .sort((a, b) => Number.parseFloat(a) - Number.parseFloat(b))
}

function normalizeEmbedUrl(value: string): string | null {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    return url.toString()
  } catch {
    return null
  }
}

export function parseDocchiPlayerEmbeds(value: unknown): StreamLink[] {
  if (!Array.isArray(value)) throw new Error('Docchi player response was invalid')
  const results: StreamLink[] = []
  for (const entry of value) {
    if (!isObject(entry)) continue
    const player = text(entry.player)
    if (!player) continue
    const url = normalizeEmbedUrl(player)
    if (!url) continue
    const hosting = text(entry.player_hosting)?.toLowerCase()
    const translator = text(entry.translator_title)
    const label = translator ? `Docchi · ${translator}` : `Docchi · ${hosting ?? new URL(url).hostname}`
    if (hosting === 'dailymotion' || new URL(url).hostname.toLowerCase().includes('dailymotion.com')) {
      results.push({ url, resolution: 'Embed', hls: false, provider: label, downloadable: false, embed: true })
    } else if (hosting === 'mega' || new URL(url).hostname.toLowerCase().includes('mega.')) {
      results.push({ url, resolution: 'Embed', hls: false, provider: label, downloadable: false, embed: true })
    }
  }
  return [...new Map(results.map((result) => [result.url, result])).values()]
}

export async function searchDocchi(query: string, includeAdult = false): Promise<SearchResult[]> {
  return parseDocchiSeriesList(await cached('series:list', () => fetchJson(`${API_BASE}/series/list`), 15 * 60_000), query, includeAdult)
}

export async function getDocchiEpisodes(slug: string): Promise<string[]> {
  return cached(`episodes:${slug}`, async () => parseDocchiEpisodeList(await fetchJson(`${API_BASE}/episodes/count/${encodeURIComponent(slug)}`)))
}

export async function getDocchiEpisodeLinks(slug: string, episode: string): Promise<StreamLink[]> {
  const embeds = parseDocchiPlayerEmbeds(await fetchJson(`${API_BASE}/episodes/find/${encodeURIComponent(slug)}/${encodeURIComponent(episode)}`))
  const unique = [...new Map(embeds.map((link) => [`${link.url}:${link.provider}`, link])).values()]
  if (!unique.length) throw new Error('No supported Docchi players are currently available')
  return unique
}

export async function getDocchiEpisodePageUrl(slug: string, episode?: string): Promise<string> {
  return `${SITE_BASE}/anime/${encodeURIComponent(slug)}${episode ? `/${encodeURIComponent(episode)}` : ''}`
}
