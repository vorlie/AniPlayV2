import { session, type Session } from 'electron'
import { load } from 'cheerio'
import { isIP } from 'node:net'
import type { TranslationType } from '../../src/catalog-types'
import type { SearchResult, StreamLink } from '../scrape'

const BASE = 'https://anikoto.cz'
const MAPPER_BASE = 'https://mapper.nekostream.site/api/mal'
const PARTITION = 'persist:aniplay-anikoto2'
const TIMEOUT_MS = 12_000
const CACHE_TTL_MS = 5 * 60_000
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36'

type JsonObject = Record<string, unknown>
interface CacheEntry<T> { expiresAt: number; value: Promise<T> }
interface Anikoto2Id { slug: string; title?: string; coverUrl?: string }
interface Anikoto2Episode {
  number: string
  slug: string
  token: string
  episodeId?: string
  malId?: string
  timestamp?: string
  sub: boolean
  dub: boolean
}
interface Anikoto2Series {
  showId: string
  canonicalUrl: string
  episodes: Anikoto2Episode[]
}
export interface Anikoto2Server {
  label: string
  kind: 'sub' | 'hsub' | 'dub'
  token: string
  serverId?: string
}

const cache = new Map<string, CacheEntry<unknown>>()

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

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asString(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return undefined
}

function providerSession(): Session {
  return session.fromPartition(PARTITION)
}

function encodeId(value: Anikoto2Id): string {
  return `anikoto2:${Buffer.from(JSON.stringify(value), 'utf8').toString('base64url')}`
}

export function decodeAnikoto2Id(value: string): Anikoto2Id {
  if (!value.startsWith('anikoto2:')) throw new Error('Invalid Anikoto 2 anime ID')
  let parsed: unknown
  try {
    parsed = JSON.parse(Buffer.from(value.slice('anikoto2:'.length), 'base64url').toString('utf8')) as unknown
  } catch {
    throw new Error('Invalid Anikoto 2 anime metadata')
  }
  if (!isObject(parsed)) throw new Error('Invalid Anikoto 2 anime metadata')
  const slug = asString(parsed.slug)
  if (!slug || !/^[a-z0-9][a-z0-9-]{0,199}$/i.test(slug)) throw new Error('Invalid Anikoto 2 anime slug')
  const coverUrl = asString(parsed.coverUrl)
  return {
    slug,
    title: asString(parsed.title),
    coverUrl: coverUrl && safeHttpsUrl(coverUrl) ? coverUrl : undefined,
  }
}

function safeHttpsUrl(value: string): string | null {
  if (value.length > 8_192) return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password) return null
    const host = url.hostname.toLowerCase()
    if (host === 'localhost' || host.endsWith('.localhost') || isIP(host)) return null
    return url.toString()
  } catch {
    return null
  }
}

async function fetchText(
  target: string,
  options: { ajax?: boolean; referer?: string; targetSession?: Session } = {},
): Promise<string> {
  const targetSession = options.targetSession ?? providerSession()
  const response = await targetSession.fetch(target, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: options.ajax ? 'application/json, text/javascript, */*; q=0.01' : 'text/html,application/xhtml+xml,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      Referer: options.referer ?? `${BASE}/`,
      ...(options.ajax ? { 'X-Requested-With': 'XMLHttpRequest' } : {}),
    },
    credentials: 'include',
    redirect: 'follow',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (response.status === 429) throw new Error('Anikoto 2 rate limited the request. Please try again later.')
  if (!response.ok) throw new Error(`Anikoto 2 request failed (${response.status})`)
  return response.text()
}

async function fetchJson(target: string, referer: string, targetSession = providerSession()): Promise<unknown> {
  const text = await fetchText(target, { ajax: true, referer, targetSession })
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new Error('Anikoto 2 returned an invalid JSON response')
  }
}

function responseResult(value: unknown, context: string): unknown {
  if (!isObject(value) || value.status !== 200 || value.result === undefined) {
    const message = isObject(value) ? asString(value.message) : undefined
    throw new Error(message || `Anikoto 2 returned an invalid ${context} response`)
  }
  return value.result
}

export function parseAnikoto2SearchHtml(html: string): SearchResult[] {
  const $ = load(html)
  const results: SearchResult[] = []
  const seen = new Set<string>()
  $('a.item[href]').each((_index, element) => {
    const href = $(element).attr('href')
    if (!href) return
    let url: URL
    try {
      url = new URL(href, BASE)
    } catch {
      return
    }
    if (url.origin !== BASE) return
    const match = /^\/watch\/([a-z0-9][a-z0-9-]{0,199})\/?$/i.exec(url.pathname)
    if (!match || seen.has(match[1])) return
    const name = $(element).find('.name').first().text().replace(/\s+/g, ' ').trim()
      || $(element).find('.d-title').first().text().replace(/\s+/g, ' ').trim()
    if (!name) return
    const rawCover = $(element).find('img').first().attr('src') ?? $(element).find('img').first().attr('data-src')
    const coverUrl = rawCover ? safeHttpsUrl(new URL(rawCover, BASE).toString()) ?? undefined : undefined
    seen.add(match[1])
    results.push({
      id: encodeId({ slug: match[1], title: name, coverUrl }),
      name,
      episodes: 0,
      coverUrl,
      catalogProvider: 'anikoto2',
    })
  })
  return results
}

export function parseAnikoto2ShowPage(html: string): { showId: string; canonicalUrl: string } {
  const $ = load(html)
  const root = $('#watch-main').first()
  const showId = root.attr('data-id')
  const canonical = root.attr('data-url')
  const canonicalUrl = canonical ? safeHttpsUrl(new URL(canonical, BASE).toString()) : null
  if (!showId || !/^\d+$/.test(showId) || !canonicalUrl || new URL(canonicalUrl).origin !== BASE) {
    throw new Error('Anikoto 2 show page did not expose its catalog identity')
  }
  return { showId, canonicalUrl }
}

export function parseAnikoto2EpisodesHtml(html: string): Anikoto2Episode[] {
  const $ = load(html)
  const episodes: Anikoto2Episode[] = []
  const seen = new Set<string>()
  $('a[data-num][data-ids]').each((_index, element) => {
    const item = $(element)
    const number = item.attr('data-num')?.trim()
    const slug = item.attr('data-slug')?.trim() || number
    const token = item.attr('data-ids')?.trim()
    if (!number || !slug || !token || seen.has(number) || !/^\d+(?:\.\d+)?$/.test(number)) return
    seen.add(number)
    episodes.push({
      number: String(Number(number)),
      slug,
      token,
      episodeId: item.attr('data-id')?.trim() || undefined,
      malId: item.attr('data-mal')?.trim() || undefined,
      timestamp: item.attr('data-timestamp')?.trim() || undefined,
      sub: item.attr('data-sub') === '1',
      dub: item.attr('data-dub') === '1',
    })
  })
  return episodes.sort((left, right) => Number(left.number) - Number(right.number))
}

function serverKind(type: string, label: string): Anikoto2Server['kind'] {
  if (type === 'dub' || /\b(?:dub|a-dub|h-dub)\b/i.test(label)) return 'dub'
  if (type === 'hsub' || /\bh[\s-]*sub\b/i.test(label)) return 'hsub'
  return 'sub'
}

export function parseAnikoto2ServersHtml(html: string, mode: TranslationType): Anikoto2Server[] {
  const $ = load(html)
  const servers: Anikoto2Server[] = []
  const seen = new Set<string>()
  $('.servers .type, .type').each((_index, group) => {
    const container = $(group)
    const type = container.attr('data-type')?.trim().toLowerCase() ?? ''
    const groupLabel = container.find('label').first().text().replace(/\s+/g, ' ').trim()
    const kind = serverKind(type, groupLabel)
    if ((mode === 'dub' && kind !== 'dub') || (mode === 'sub' && kind === 'dub')) return
    container.find('li[data-link-id]').each((_serverIndex, element) => {
      const item = $(element)
      const token = item.attr('data-link-id')?.trim()
      if (!token || seen.has(token)) return
      const name = item.text().replace(/\s+/g, ' ').trim() || 'Server'
      seen.add(token)
      servers.push({
        label: `${kind === 'hsub' ? 'H-SUB' : kind.toUpperCase()} · ${name}`,
        kind,
        token,
        serverId: item.attr('data-sv-id')?.trim() || undefined,
      })
    })
  })
  return servers
}

export function parseAnikoto2MapperPayload(value: unknown, mode: TranslationType): Anikoto2Server[] {
  if (!isObject(value)) return []
  const servers: Anikoto2Server[] = []
  for (const [provider, entry] of Object.entries(value)) {
    if (provider === 'status' || !isObject(entry)) continue
    const source = entry[mode]
    if (!isObject(source)) continue
    const token = asString(source.url)
    if (!token) continue
    const label = provider === 'gogoanime'
      ? 'Vidstream'
      : provider === 'animepahe'
        ? 'Kiwi-Stream'
        : provider === 'anivibe'
          ? 'Vibe-Stream'
          : provider
    servers.push({
      label: `${mode === 'dub' ? 'A-DUB' : 'H-SUB'} · ${label}`,
      kind: mode === 'dub' ? 'dub' : 'hsub',
      token,
    })
  }
  return servers
}

export function parseAnikoto2ServerResponse(value: unknown, server: Anikoto2Server): StreamLink | null {
  const result = responseResult(value, 'server')
  const rawUrl = isObject(result) ? asString(result.url) : asString(result)
  const url = rawUrl ? safeHttpsUrl(rawUrl) : null
  if (!url) return null
  return {
    url,
    resolution: 'Embed',
    hls: false,
    provider: `Anikoto 2 · ${server.label}`,
    downloadable: false,
    embed: true,
  }
}

export async function searchAnikoto2(query: string): Promise<SearchResult[]> {
  const normalized = query.trim()
  if (!normalized) return []
  return cached(`search:${normalized.toLowerCase()}`, async () => {
    const payload = await fetchJson(
      `${BASE}/ajax/anime/search?keyword=${encodeURIComponent(normalized)}`,
      `${BASE}/`,
    )
    const result = responseResult(payload, 'search')
    const html = isObject(result) && typeof result.html === 'string' ? result.html : undefined
    if (html === undefined) throw new Error('Anikoto 2 search returned no result markup')
    return parseAnikoto2SearchHtml(html)
  })
}

async function loadSeries(animeId: string): Promise<Anikoto2Series> {
  const id = decodeAnikoto2Id(animeId)
  return cached(`series:${id.slug}`, async () => {
    const targetSession = providerSession()
    const requestedUrl = `${BASE}/watch/${encodeURIComponent(id.slug)}`
    const page = await fetchText(requestedUrl, { targetSession })
    const identity = parseAnikoto2ShowPage(page)
    const payload = await fetchJson(
      `${BASE}/ajax/episode/list/${identity.showId}?style=grid&vrf=`,
      identity.canonicalUrl,
      targetSession,
    )
    const result = responseResult(payload, 'episode list')
    if (typeof result !== 'string') throw new Error('Anikoto 2 episode list returned no markup')
    const episodes = parseAnikoto2EpisodesHtml(result)
    if (!episodes.length) throw new Error('Anikoto 2 returned no episodes for this title')
    return { ...identity, episodes }
  })
}

export async function getAnikoto2Episodes(animeId: string, mode: TranslationType): Promise<string[]> {
  const series = await loadSeries(animeId)
  const episodes = series.episodes.filter((episode) => mode === 'dub' ? episode.dub : episode.sub)
  if (!episodes.length) throw new Error(`Anikoto 2 has no ${mode.toUpperCase()} episodes for this title`)
  return episodes.map((episode) => episode.number)
}

async function supplementalServers(episode: Anikoto2Episode, mode: TranslationType): Promise<Anikoto2Server[]> {
  if (!episode.malId || !episode.timestamp) return []
  try {
    const payload = await fetchJson(
      `${MAPPER_BASE}/${encodeURIComponent(episode.malId)}/${encodeURIComponent(episode.slug)}/${encodeURIComponent(episode.timestamp)}`,
      `${BASE}/`,
    )
    return parseAnikoto2MapperPayload(payload, mode)
  } catch {
    return []
  }
}

export async function getAnikoto2EpisodeLinks(
  animeId: string,
  episodeNumber: string,
  mode: TranslationType,
): Promise<StreamLink[]> {
  const series = await loadSeries(animeId)
  const episode = series.episodes.find((candidate) => candidate.number === String(Number(episodeNumber)))
  if (!episode) throw new Error(`Anikoto 2 episode ${episodeNumber} is unavailable`)
  if (mode === 'dub' && !episode.dub) throw new Error(`Anikoto 2 episode ${episodeNumber} has no DUB servers`)
  if (mode === 'sub' && !episode.sub) throw new Error(`Anikoto 2 episode ${episodeNumber} has no SUB servers`)

  const targetSession = providerSession()
  const episodeUrl = `${series.canonicalUrl}/ep-${encodeURIComponent(episode.slug)}`
  await fetchText(episodeUrl, { targetSession })
  const listPayload = await fetchJson(
    `${BASE}/ajax/server/list?servers=${encodeURIComponent(episode.token)}`,
    episodeUrl,
    targetSession,
  )
  const listResult = responseResult(listPayload, 'server list')
  if (typeof listResult !== 'string') throw new Error('Anikoto 2 server list returned no markup')
  const baseServers = parseAnikoto2ServersHtml(listResult, mode)
  const extraServers = await supplementalServers(episode, mode)
  const servers = [...baseServers, ...extraServers].filter(
    (server, index, items) => items.findIndex((candidate) => candidate.token === server.token) === index,
  )
  if (!servers.length) throw new Error(`Anikoto 2 episode ${episodeNumber} has no ${mode.toUpperCase()} servers`)

  const links: StreamLink[] = []
  const errors: string[] = []
  for (const server of servers) {
    try {
      const payload = await fetchJson(
        `${BASE}/ajax/server?get=${encodeURIComponent(server.token)}`,
        episodeUrl,
        targetSession,
      )
      const link = parseAnikoto2ServerResponse(payload, server)
      if (link && !links.some((candidate) => candidate.url === link.url)) links.push(link)
    } catch (error) {
      errors.push(`${server.label}: ${error instanceof Error ? error.message : 'resolution failed'}`)
    }
  }
  if (!links.length) throw new Error(errors[0] ?? 'Anikoto 2 did not resolve any playable embeds')
  return links
}

export function getAnikoto2EpisodePageUrl(animeId: string, episode: string): string {
  const id = decodeAnikoto2Id(animeId)
  const normalizedEpisode = encodeURIComponent(String(Number(episode)))
  return `${BASE}/watch/${encodeURIComponent(id.slug)}/ep-${normalizedEpisode}`
}
