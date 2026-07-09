import type { SearchResult, StreamLink } from './scrape'
import type { TranslationType } from '../src/catalog-types'

const ANILIST_API = 'https://graphql.anilist.co'
const ANIKOTO_API = 'https://anikotoapi.site'
const MEGAPLAY_BASE = 'https://megaplay.buzz'
const TIMEOUT_MS = 12_000
const CACHE_TTL_MS = 5 * 60_000
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36'
const RESOLVE_NATIVE_SOURCES = /^(1|true|yes)$/i.test(process.env.ANIPLAY_ANIKOTO_NATIVE ?? '')

type JsonObject = Record<string, unknown>
interface CacheEntry<T> { expiresAt: number; value: Promise<T> }
interface AnikotoId { anilistId?: string; malId?: string; anikotoId?: string; title?: string; episodes?: number }
interface AnikotoEpisode { number: string; embedId?: string; embedUrl?: Partial<Record<TranslationType, string>> }
interface SubtitleTrack { label: string; url: string }

const cache = new Map<string, CacheEntry<unknown>>()

function cached<T>(key: string, loader: () => Promise<T>, ttl = CACHE_TTL_MS): Promise<T> {
  const existing = cache.get(key) as CacheEntry<T> | undefined
  if (existing && existing.expiresAt > Date.now()) return existing.value
  const value = loader().catch((error) => { cache.delete(key); throw error })
  cache.set(key, { expiresAt: Date.now() + ttl, value })
  if (cache.size > 100) cache.delete(cache.keys().next().value as string)
  return value
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asString(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return undefined
}

function titleFromMedia(value: JsonObject): string {
  const title = isObject(value.title) ? value.title : {}
  for (const key of ['english', 'romaji', 'native']) {
    const candidate = title[key]
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim()
  }
  return `AniList ${String(value.id ?? '')}`.trim()
}

function encodeId(input: AnikotoId): string {
  return `anikoto:${Buffer.from(JSON.stringify(input), 'utf8').toString('base64url')}`
}

function decodeId(value: string): AnikotoId {
  if (/^\d+$/.test(value)) return { anikotoId: value }
  if (!value.startsWith('anikoto:')) throw new Error('Invalid Anikoto anime ID')
  const parsed = JSON.parse(Buffer.from(value.slice('anikoto:'.length), 'base64url').toString('utf8')) as unknown
  if (!isObject(parsed)) throw new Error('Invalid Anikoto anime metadata')
  return {
    anilistId: asString(parsed.anilistId),
    malId: asString(parsed.malId),
    anikotoId: asString(parsed.anikotoId),
    title: asString(parsed.title),
    episodes: typeof parsed.episodes === 'number' && Number.isFinite(parsed.episodes) ? parsed.episodes : undefined,
  }
}

async function fetchText(input: string | URL, init: RequestInit = {}, timeoutMs = TIMEOUT_MS): Promise<string> {
  const response = await fetch(input, {
    ...init,
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/json,text/plain,*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      Referer: `${MEGAPLAY_BASE}/`,
      ...init.headers,
    },
    signal: init.signal ?? AbortSignal.timeout(timeoutMs),
  })
  if (!response.ok) throw new Error(`Anikoto request failed (${response.status})`)
  return response.text()
}

async function fetchJson(input: string | URL, init: RequestInit = {}, timeoutMs = TIMEOUT_MS): Promise<unknown> {
  const text = await fetchText(input, {
    ...init,
    headers: {
      Accept: 'application/json,text/plain,*/*',
      ...init.headers,
    },
  }, timeoutMs)
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new Error('Anikoto returned an invalid JSON response')
  }
}

async function anilist(query: string, variables: JsonObject): Promise<unknown> {
  return fetchJson(ANILIST_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Referer: 'https://anilist.co/' },
    body: JSON.stringify({ query, variables }),
  })
}

export async function searchAnikoto(query: string, aniListFirst = false): Promise<SearchResult[]> {
  return cached(`search:${aniListFirst ? 'anilist' : 'default'}:${query.toLowerCase()}`, async () => {
    const recentPromise = fetchJson(`${ANIKOTO_API}/recent-anime?page=1&per_page=40`)
      .then((value) => {
        const needle = query.toLowerCase()
        return parseAnikotoSearchPayload(value).filter((item) => item.name.toLowerCase().includes(needle))
      })
      .catch(() => [] as SearchResult[])

    const json = await anilist(`
      query ($search: String!) {
        Page(page: 1, perPage: 40) {
          media(type: ANIME, search: $search, sort: SEARCH_MATCH) {
            id
            idMal
            title { romaji english native }
            episodes
            isAdult
            coverImage { large medium }
          }
        }
      }
    `, { search: query })

    return mergeAnikotoSearchResults(await recentPromise, parseAnikotoSearchPayload(json), aniListFirst)
  })
}

export function mergeAnikotoSearchResults(recent: SearchResult[], aniList: SearchResult[], aniListFirst: boolean): SearchResult[] {
  const seen = new Set<string>()
  const ordered = aniListFirst ? [...aniList, ...recent] : [...recent, ...aniList]
  return ordered.filter((item) => {
    const key = item.aniListMediaId ? `ani:${item.aniListMediaId}` : item.name.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function parseAnikotoSearchPayload(value: unknown): SearchResult[] {
  const page = isObject(value) && isObject(value.data) && isObject(value.data.Page) ? value.data.Page : null
  const data = isObject(value) ? value.data : undefined
  const media = page && Array.isArray(page.media)
    ? page.media
    : Array.isArray(data)
      ? data
      : Array.isArray(value)
        ? value
        : []
  return media.flatMap((item): SearchResult[] => {
    if (!isObject(item) || item.isAdult === true) return []
    const anilistId = asString(item.ani_id ?? item.id)
    if (!anilistId) return []
    const name = isObject(item.title) ? titleFromMedia(item) : asString(item.title) ?? asString(item.name) ?? `AniList ${anilistId}`
    const episodes = Number(asString(item.episodes) ?? 0)
    const anikotoId = asString(item.anikotoId ?? (item.ani_id !== undefined && item.id !== item.ani_id ? item.id : undefined))
    return [{
      id: encodeId({
        anilistId,
        malId: asString(item.idMal ?? item.mal_id),
        anikotoId,
        title: name,
        episodes: Number.isFinite(episodes) ? episodes : 0,
      }),
      name,
      episodes: Number.isFinite(episodes) ? episodes : 0,
      aniListMediaId: Number.isFinite(Number(anilistId)) ? Number(anilistId) : undefined,
      coverUrl: isObject(item.coverImage) ? asString(item.coverImage.large) ?? asString(item.coverImage.medium) : asString(item.poster),
      catalogProvider: 'anikoto',
    }]
  })
}

export function parseAnikotoEpisodesPayload(value: unknown): AnikotoEpisode[] {
  const data = isObject(value) && isObject(value.data) ? value.data : value
  const episodes = isObject(data) && Array.isArray(data.episodes) ? data.episodes : []
  return episodes.flatMap((item): AnikotoEpisode[] => {
    if (!isObject(item)) return []
    const number = asString(item.number ?? item.episode ?? item.episode_number)
    if (!number) return []
    const embedUrl = isObject(item.embed_url)
      ? {
          sub: asString(item.embed_url.sub),
          dub: asString(item.embed_url.dub),
        }
      : undefined
    return [{
      number,
      embedId: asString(item.episode_embed_id),
      embedUrl,
    }]
  }).sort((a, b) => Number.parseFloat(a.number) - Number.parseFloat(b.number))
}

async function loadSeries(animeId: string): Promise<AnikotoEpisode[]> {
  const id = decodeId(animeId)
  if (!id.anikotoId) return []
  return cached(`series:${id.anikotoId}`, async () => parseAnikotoEpisodesPayload(await fetchJson(`${ANIKOTO_API}/series/${encodeURIComponent(id.anikotoId!)}`)))
}

export async function getAnikotoEpisodes(animeId: string): Promise<string[]> {
  const id = decodeId(animeId)
  const series = await loadSeries(animeId)
  if (series.length) return series.map((episode) => episode.number)
  const count = id.episodes && id.episodes > 0 ? id.episodes : 0
  if (!count) throw new Error('Anikoto could not determine the episode list for this title')
  return Array.from({ length: count }, (_value, index) => String(index + 1))
}

export function parseMegaPlayDataId(html: string): string | null {
  return html.match(/\bdata-id=["'](\d+)["']/i)?.[1] ?? null
}

export function parseMegaPlaySources(value: unknown): { links: StreamLink[]; subtitles: SubtitleTrack[] } {
  const links: StreamLink[] = []
  const subtitles: SubtitleTrack[] = []
  const seenLinks = new Set<string>()
  const seenSubtitles = new Set<string>()

  const pushLink = (url: unknown, provider = 'MegaPlay', resolution = 'Auto') => {
    const raw = asString(url)
    if (!raw || seenLinks.has(raw)) return
    seenLinks.add(raw)
    links.push({
      url: raw,
      resolution,
      hls: raw.includes('.m3u8'),
      provider,
      downloadable: true,
      subtitles,
    })
  }

  const collectSource = (candidate: unknown) => {
    if (typeof candidate === 'string') {
      pushLink(candidate)
      return
    }
    if (Array.isArray(candidate)) {
      for (const item of candidate) collectSource(item)
      return
    }
    if (!isObject(candidate)) return
    const file = candidate.file ?? candidate.url ?? candidate.src
    pushLink(file, 'MegaPlay', asString(candidate.label ?? candidate.quality) ?? 'Auto')
    for (const key of ['sources', 'source', 'links']) collectSource(candidate[key])
  }

  const collectTracks = (candidate: unknown) => {
    if (Array.isArray(candidate)) {
      for (const item of candidate) collectTracks(item)
      return
    }
    if (!isObject(candidate)) return
    const url = asString(candidate.file ?? candidate.url ?? candidate.src)
    if (!url || seenSubtitles.has(url)) return
    const kind = asString(candidate.kind ?? candidate.type)?.toLowerCase() ?? ''
    if (kind && !/caption|subtitle|sub/.test(kind)) return
    seenSubtitles.add(url)
    subtitles.push({ label: asString(candidate.label ?? candidate.title) ?? 'Subtitle', url })
  }

  if (isObject(value)) {
    collectTracks(value.tracks)
    collectTracks(value.captions)
    collectTracks(value.subtitles)
    collectSource(value.sources)
    collectSource(value.source)
  } else {
    collectSource(value)
  }

  for (const link of links) link.subtitles = subtitles
  return { links, subtitles }
}

async function resolveMegaPlay(embedUrl: string): Promise<StreamLink[]> {
  const html = await fetchText(embedUrl, { headers: { Referer: `${MEGAPLAY_BASE}/` } })
  const id = parseMegaPlayDataId(html)
  if (!id) throw new Error('MegaPlay did not expose a playable source id')
  const payload = await fetchJson(`${MEGAPLAY_BASE}/stream/getSources?id=${encodeURIComponent(id)}`, {
    headers: {
      Referer: embedUrl,
      Origin: MEGAPLAY_BASE,
    },
  })
  const { links } = parseMegaPlaySources(payload)
  if (!links.length) throw new Error('MegaPlay did not return any supported streams')
  return links
}

function embedLink(url: string): StreamLink {
  return {
    url,
    resolution: 'Embed',
    hls: false,
    provider: 'MegaPlay · Embed',
    downloadable: false,
    embed: true,
  }
}

function streamCandidates(id: AnikotoId, episode: string, mode: TranslationType, seriesEpisode?: AnikotoEpisode): string[] {
  const candidates: string[] = []
  const explicit = seriesEpisode?.embedUrl?.[mode]
  if (explicit) candidates.push(explicit)
  if (seriesEpisode?.embedId) candidates.push(`${MEGAPLAY_BASE}/stream/s-2/${encodeURIComponent(seriesEpisode.embedId)}/${mode}`)
  if (id.anilistId) candidates.push(`${MEGAPLAY_BASE}/stream/ani/${encodeURIComponent(id.anilistId)}/${encodeURIComponent(episode)}/${mode}`)
  if (id.malId) candidates.push(`${MEGAPLAY_BASE}/stream/mal/${encodeURIComponent(id.malId)}/${encodeURIComponent(episode)}/${mode}`)
  return Array.from(new Set(candidates))
}

export async function getAnikotoEpisodeLinks(animeId: string, episode: string, mode: TranslationType): Promise<StreamLink[]> {
  const id = decodeId(animeId)
  const seriesEpisode = (await loadSeries(animeId)).find((candidate) => candidate.number === episode)
  const errors: string[] = []
  const embedCandidates = streamCandidates(id, episode, mode, seriesEpisode)
  const primaryEmbed = embedCandidates[0]
  const results: StreamLink[] = primaryEmbed ? [embedLink(primaryEmbed)] : []
  if (!RESOLVE_NATIVE_SOURCES) {
    if (results.length) return results
    throw new Error('No supported Anikoto embed is currently available')
  }
  for (const url of embedCandidates) {
    try {
      results.push(...await resolveMegaPlay(url))
      break
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'Unknown MegaPlay error')
    }
  }
  if (results.length) return results
  throw new Error(errors[0] ?? 'No supported Anikoto streams are currently available')
}

export async function getAnikotoEpisodePageUrl(animeId: string, episode: string, mode: TranslationType): Promise<string> {
  const id = decodeId(animeId)
  const seriesEpisode = (await loadSeries(animeId)).find((candidate) => candidate.number === episode)
  return streamCandidates(id, episode, mode, seriesEpisode)[0] ?? `${MEGAPLAY_BASE}/stream/ani/${encodeURIComponent(id.anilistId ?? '')}/${encodeURIComponent(episode)}/${mode}`
}
