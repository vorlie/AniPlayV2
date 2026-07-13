import * as crypto from 'crypto'
import fs from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { getDesuEpisodeLinks, getDesuEpisodes, searchDesu } from './providers/desu'
import { getDocchiEpisodeLinks, getDocchiEpisodes, searchDocchi } from './providers/docchi'
import { getMiruroEpisodeLinks, getMiruroEpisodes, searchMiruro } from './providers/miruro'
import { getAnikotoEpisodeLinks, getAnikotoEpisodes, searchAnikoto } from './providers/anikoto'
import type { CatalogProvider } from '../src/catalog-types'

const DEFAULT_TIMEOUT_MS = 10_000

type JsonObject = Record<string, unknown>

interface SourceEntry {
  sourceUrl?: string
  sourceName?: string
}

interface ProviderLink {
  link?: string
  hls?: boolean
  resolutionStr?: string
}

export interface StreamLink {
  url: string
  resolution: string
  hls: boolean
  provider: string
  downloadable: boolean
  subtitles?: { label: string; url: string }[]
  embed?: boolean
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error'
}

async function fetchChecked(input: string | URL, init: RequestInit = {}, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<Response> {
  const response = await fetch(input, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(timeoutMs),
  })
  if (!response.ok) {
    throw new Error(`Request failed (${response.status} ${response.statusText}) for ${new URL(input.toString()).origin}`)
  }
  return response
}

async function fetchJson(input: string | URL, init: RequestInit = {}, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<unknown> {
  const response = await fetchChecked(input, init, timeoutMs)
  const text = await response.text()
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new Error(`Invalid JSON response from ${new URL(input.toString()).origin}`)
  }
}

// ---- Dynamic cipher map (hot-reloadable via IPC) ----

const FALLBACK_CIPHER_MAP: Record<string, string> = {
  '79':'A','7a':'B','7b':'C','7c':'D','7d':'E','7e':'F','7f':'G','70':'H','71':'I','72':'J',
  '73':'K','74':'L','75':'M','76':'N','77':'O','68':'P','69':'Q','6a':'R','6b':'S','6c':'T',
  '6d':'U','6e':'V','6f':'W','60':'X','61':'Y','62':'Z','59':'a','5a':'b','5b':'c','5c':'d',
  '5d':'e','5e':'f','5f':'g','50':'h','51':'i','52':'j','53':'k','54':'l','55':'m','56':'n',
  '57':'o','48':'p','49':'q','4a':'r','4b':'s','4c':'t','4d':'u','4e':'v','4f':'w','40':'x',
  '41':'y','42':'z','08':'0','09':'1','0a':'2','0b':'3','0c':'4','0d':'5','0e':'6','0f':'7',
  '00':'8','01':'9','15':'-','16':'.','67':'_','46':'~','02':':','17':'/','07':'?','1b':'#',
  '63':'[','65':']','78':'@','19':'!','1c':'$','1e':'&','10':'(','11':')','12':'*','13':'+',
  '14':',','03':';','05':'=','1d':'%',
}

let _activeCipherMap: Record<string, string> = { ...FALLBACK_CIPHER_MAP }

/** Load persisted ciphermap from userData on first import, silently fallback if missing. */
function loadPersistedCipherMap(): void {
  try {
    const outPath = join(app.getPath('userData'), 'ciphermap.json')
    if (!fs.existsSync(outPath)) return
    const parsed = JSON.parse(fs.readFileSync(outPath, 'utf8'))
    if (parsed?.cipherMap && Object.keys(parsed.cipherMap).length >= 60) {
      _activeCipherMap = parsed.cipherMap
      console.log(`[scrape] Loaded ${Object.keys(_activeCipherMap).length}-entry ciphermap from ${outPath}`)
    }
  } catch (error: unknown) {
    console.warn('[scrape] Could not load persisted ciphermap, using fallback:', errorMessage(error))
  }
}

loadPersistedCipherMap()

export function getCipherMap(): Record<string, string> {
  return _activeCipherMap
}

export function reloadCipherMap(map: Record<string, string>): void {
  _activeCipherMap = map
  console.log(`[scrape] CipherMap hot-reloaded: ${Object.keys(map).length} entries`)
}

// ---- Scraper constants ----

const ALLANIME_BASE = 'allanime.day'
const ALLANIME_API = `https://api.${ALLANIME_BASE}`
const ALLANIME_REFR = 'https://youtu-chan.com'
const AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:150.0) Gecko/20100101 Firefox/150.0'
const DEBUG_ALLANIME = /^(1|true|yes|full)$/i.test(process.env.ANIPLAY_DEBUG_ALLANIME ?? '')
export type TranslationType = 'sub' | 'dub'

export interface SearchResult {
  id: string
  name: string
  episodes: number
  aniListMediaId?: number
  coverUrl?: string
  catalogProvider: CatalogProvider
}

export async function searchAnime(query: string, mode: TranslationType, catalogProvider: CatalogProvider = 'anikoto', aniListFirstSearch = false, includeAdultDocchi = false): Promise<SearchResult[]> {
  if (catalogProvider === 'desu') return searchDesu(query)
  if (catalogProvider === 'docchi') return searchDocchi(query, includeAdultDocchi)
  if (catalogProvider === 'miruro') return searchMiruro(query)
  if (catalogProvider === 'anikoto') return searchAnikoto(query, aniListFirstSearch)
  const searchGql = `query( $search: SearchInput $limit: Int $page: Int $translationType: VaildTranslationTypeEnumType $countryOrigin: VaildCountryOriginEnumType ) { shows( search: $search limit: $limit page: $page translationType: $translationType countryOrigin: $countryOrigin ) { edges { _id name availableEpisodes __typename } }}`

  const variables = {
    search: { allowAdult: false, allowUnknown: false, query },
    limit: 40,
    page: 1,
    translationType: mode,
    countryOrigin: 'ALL',
  }

  const json = await fetchJson(`${ALLANIME_API}/api`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': AGENT,
      'Referer': ALLANIME_REFR,
    },
    body: JSON.stringify({
      variables,
      query: searchGql,
    }),
  })

  const data = isObject(json) && isObject(json.data) ? json.data : null
  const shows = data && isObject(data.shows) ? data.shows : null
  const edges = shows && Array.isArray(shows.edges) ? shows.edges : null
  if (!edges) throw new Error('Search response did not contain a shows list')

  return edges.flatMap((value): SearchResult[] => {
    if (!isObject(value) || typeof value._id !== 'string' || typeof value.name !== 'string') return []
    const availableEpisodes = isObject(value.availableEpisodes) ? value.availableEpisodes : null
    const episodeValue = availableEpisodes?.[mode]
    // The bash script does: mode === 'sub' ? edge.availableEpisodes.sub : ...
    const episodes = typeof episodeValue === 'number' && Number.isFinite(episodeValue) ? episodeValue : 0
    return [{ id: value._id, name: value.name, episodes, catalogProvider: 'allanime' }]
  })
}

export async function getEpisodes(showId: string, mode: TranslationType, catalogProvider: CatalogProvider = 'anikoto'): Promise<string[]> {
  if (catalogProvider === 'desu') return getDesuEpisodes(showId)
  if (catalogProvider === 'docchi') return getDocchiEpisodes(showId)
  if (catalogProvider === 'miruro') return getMiruroEpisodes(showId)
  if (catalogProvider === 'anikoto') return getAnikotoEpisodes(showId)
  const episodesListGql = `query ($showId: String!) { show( _id: $showId ) { _id availableEpisodesDetail }}`
  const json = await fetchJson(`${ALLANIME_API}/api`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': AGENT,
      'Referer': ALLANIME_REFR,
    },
    body: JSON.stringify({
      variables: { showId },
      query: episodesListGql,
    }),
  })

  const data = isObject(json) && isObject(json.data) ? json.data : null
  const show = data && isObject(data.show) ? data.show : null
  const detail = show && isObject(show.availableEpisodesDetail) ? show.availableEpisodesDetail : null
  const modeData = detail?.[mode]
  if (!Array.isArray(modeData)) throw new Error('Episode response did not contain an episode list')
  return modeData
    .filter((value): value is string | number => typeof value === 'string' || typeof value === 'number')
    .map(String)
    .sort((a, b) => parseFloat(a) - parseFloat(b))
}

const ALLANIME_EPOCH = 4128
const ALLANIME_BUILD_ID = '12'
const ALLANIME_LEGACY_BUILD_ID = '9'
const ALLANIME_QUERY_HASH = 'd405d0edd690624b66baba3068e0edc3ac90f1597d898a1ec8db4e5c43c00fec'
const ALLANIME_STATIC_KEY = Buffer.from(Buffer.from('b1a9a4d051988f1b1b12dbb747439d9bd64b09ea17835600a7eaa4de87c1ad87', 'hex')
  .map((byte, index) => byte ^ Buffer.from('k7DLdv5SGiuEyGUtcncl5wQOR7r4aenLfDV3AOBKlAU=', 'base64')[index]))
const ALLANIME_RESPONSE_FALLBACK_SECRET = [88, 111, 116, 51, 54, 105, 51, 108, 75, 51].map((code) => String.fromCharCode(code)).join('')

interface AllAnimeCryptoMaterial {
  epoch: number
  buildId: string
  key: Buffer
  legacyCtr?: boolean
}

let allAnimeCryptoMaterial: { value: AllAnimeCryptoMaterial; expiresAt: number } | null = null

function xorAllAnimeKey(maskHex: string, partB: string): Buffer {
  const mask = Buffer.from(maskHex, 'hex')
  const part = Buffer.from(partB, 'base64')
  if (mask.length !== 32 || part.length !== 32) throw new Error('AllAnime crypto material had an invalid key length')
  return Buffer.from(mask.map((byte, index) => byte ^ part[index]))
}

async function fetchText(input: string | URL, init: RequestInit = {}, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<string> {
  const response = await fetchChecked(input, init, timeoutMs)
  return await response.text()
}

async function getAllAnimeCryptoMaterial(): Promise<AllAnimeCryptoMaterial> {
  if (allAnimeCryptoMaterial && allAnimeCryptoMaterial.expiresAt > Date.now()) return allAnimeCryptoMaterial.value
  const fallback: AllAnimeCryptoMaterial = { epoch: ALLANIME_EPOCH, buildId: ALLANIME_BUILD_ID, key: ALLANIME_STATIC_KEY, legacyCtr: true }

  try {
    const page = await fetchText('https://mkissa.to', {
      headers: { 'User-Agent': AGENT, 'Accept': 'text/html,application/xhtml+xml' },
    }, 8_000)
    const appJsUrl = page.match(/https:\/\/cdn\.(?:mkissa\.net|allanime\.day)\/all\/mk\/_app\/immutable\/entry\/app\.[^"']+\.js/)?.[0]
    const cryptoConfigText = page.match(/window\.__aaCrypto\s*=\s*(\{[^<;]+\})/)?.[1]
    const cryptoConfig = cryptoConfigText ? JSON.parse(cryptoConfigText) as unknown : null
    const cryptoObject = isObject(cryptoConfig) ? cryptoConfig : null
    const epoch = typeof cryptoObject?.epoch === 'number' ? cryptoObject.epoch : Number(page.match(/"epoch":(\d+)/)?.[1])
    const partB = typeof cryptoObject?.partB === 'string' ? cryptoObject.partB : page.match(/"partB":"([^"]+)"/)?.[1]
    if (!appJsUrl || !Number.isFinite(epoch) || !partB) throw new Error('AllAnime page did not expose crypto bootstrap data')

    const appJs = await fetchText(appJsUrl, { headers: { 'User-Agent': AGENT } }, 8_000)
    const chunkPaths = [...new Set([...appJs.matchAll(/\.\.\/chunks\/[^"',\]]+\.js/g)].map((match) => match[0]))]
    let mask: string | undefined
    let buildId: string | undefined

    for (const chunkPath of chunkPaths) {
      try {
        const encJs = await fetchText(new URL(chunkPath, appJsUrl), {
          headers: { 'User-Agent': AGENT, 'Accept': 'text/javascript,*/*;q=0.8' },
        }, 8_000)
        mask = encJs.match(/([0-9a-f]{64})/i)?.[1]
        buildId = encJs.match(/[0-9a-f]{64}.[^;]*"(\d+)"/i)?.[1]
        if (mask && buildId) break
      } catch {
        // Some lazy chunks are optional; keep scanning until the crypto chunk is found.
      }
    }
    if (!mask || !buildId) throw new Error('AllAnime encryption chunk did not expose key material')

    const value: AllAnimeCryptoMaterial = { epoch, buildId, key: xorAllAnimeKey(mask, partB) }
    allAnimeCryptoMaterial = { value, expiresAt: Date.now() + 30 * 60_000 }
    return value
  } catch (error: unknown) {
    console.warn('[scrape] Dynamic AllAnime crypto material unavailable, using bundled fallback:', errorMessage(error))
    allAnimeCryptoMaterial = { value: fallback, expiresAt: Date.now() + 5 * 60_000 }
    return fallback
  }
}

function createAllAnimeRequestToken(queryHash: string, material: AllAnimeCryptoMaterial): string {
  const ts = Math.floor(Date.now() / 300_000) * 300_000
  const payload = {
    v: 1,
    ts,
    epoch: material.epoch,
    buildId: material.buildId,
    qh: queryHash,
  }
  const iv = crypto.createHash('sha256')
    .update(`${material.epoch}:${material.buildId}:${queryHash}:${ts}`)
    .digest()
    .subarray(0, 12)
  const cipher = crypto.createCipheriv('aes-256-gcm', material.key, iv)
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload)), cipher.final()])
  return Buffer.concat([Buffer.from([1]), iv, encrypted, cipher.getAuthTag()]).toString('base64')
}

function classifyAllAnimeEpisodeResponse(body: string): string {
  const lower = body.toLowerCase()
  if (body.includes('AA_CRYPTO_MISSING')) return 'AA_CRYPTO_MISSING'
  if (lower.includes('stale')) return 'stale'
  if (body.includes('"tobeparsed"')) return 'tobeparsed'
  if (body.includes('"sourceUrls"')) return 'sourceUrls'
  if (body.includes('"errors"')) return 'graphql-errors'
  if (!body.trim()) return 'empty'
  return 'unknown'
}

function debugAllAnimeEpisodeResponse(label: string, body: string): void {
  if (!DEBUG_ALLANIME) return
  const full = /^full$/i.test(process.env.ANIPLAY_DEBUG_ALLANIME ?? '')
  const preview = full || body.length <= 4000 ? body : `${body.slice(0, 4000)}... [truncated ${body.length - 4000} chars]`
  console.log(`[scrape:allanime] ${label}: ${classifyAllAnimeEpisodeResponse(body)} (${body.length} bytes)`)
  console.log(preview)
}

function processResponse(responseRaw: string, material: AllAnimeCryptoMaterial): unknown {
  let parsed: unknown = responseRaw
  try {
    parsed = JSON.parse(responseRaw) as unknown
  } catch {
    // If it's already an object, leave it
  }

  const root = isObject(parsed) ? parsed : null
  const data = root && isObject(root.data) ? root.data : null
  const episode = data && isObject(data.episode) ? data.episode : null
  if (!episode?.sourceUrls) {
      const tobeparsed = episode?.tobeparsed ?? data?.tobeparsed ?? root?.tobeparsed
      if (typeof tobeparsed !== 'string' || !tobeparsed) return parsed

      const buffer = Buffer.from(tobeparsed, 'base64')
      const ivRaw = buffer.subarray(1, 13)
      const ctLen = buffer.length - 13 - 16
      if (ctLen <= 0) throw new Error('Encrypted episode payload is too short')
      const ciphertext = buffer.subarray(13, 13 + ctLen)
      const tag = buffer.subarray(buffer.length - 16)
      const decryptGcm = (key: Buffer): unknown => {
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, ivRaw)
        decipher.setAuthTag(tag)
        const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()])
        return JSON.parse(decrypted.toString('utf-8')) as unknown
      }

      try {
        return decryptGcm(material.key)
      } catch (error: unknown) {
        const fallbackKey = crypto.createHash('sha256')
          .update(`${ALLANIME_RESPONSE_FALLBACK_SECRET}:v${buffer[0]}`)
          .digest()
        try {
          return decryptGcm(fallbackKey)
        } catch {
          if (!material.legacyCtr) throw error
          if (DEBUG_ALLANIME) console.warn('[scrape] AES-GCM episode decrypt failed, trying legacy CTR:', errorMessage(error))
        }
      }

      const ctrBuffer = Buffer.from(`${ivRaw.toString('hex')}00000002`, 'hex')
      const decipher = crypto.createDecipheriv('aes-256-ctr', material.key, ctrBuffer)
      const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()])

      return JSON.parse(decrypted.toString('utf-8')) as unknown
  }
  return parsed
}

function getEpisodeSourceValues(result: unknown): unknown | undefined {
    const resultObject = isObject(result) ? result : null
    const resultData = resultObject && isObject(resultObject.data) ? resultObject.data : null
    const resultEpisode = resultObject && isObject(resultObject.episode)
      ? resultObject.episode
      : resultData && isObject(resultData.episode)
        ? resultData.episode
        : null

    if (Array.isArray(result)) return result
    if (resultObject?.sourceUrls !== undefined) return resultObject.sourceUrls
    if (resultEpisode?.sourceUrls !== undefined) return resultEpisode.sourceUrls
    return undefined
}

export async function getEpisodeLinks(showId: string, epNo: string, mode: TranslationType, catalogProvider: CatalogProvider = 'anikoto'): Promise<StreamLink[]> {
    if (catalogProvider === 'desu') return getDesuEpisodeLinks(showId, epNo)
    if (catalogProvider === 'docchi') return getDocchiEpisodeLinks(showId, epNo)
    if (catalogProvider === 'miruro') return getMiruroEpisodeLinks(showId, epNo)
    if (catalogProvider === 'anikoto') return getAnikotoEpisodeLinks(showId, epNo, mode)
    const queryHash = ALLANIME_QUERY_HASH
    const queryVars = { showId, translationType: mode, episodeString: epNo }
    const dynamicMaterial = await getAllAnimeCryptoMaterial()
    const materials: AllAnimeCryptoMaterial[] = [
      dynamicMaterial,
      { epoch: ALLANIME_EPOCH, buildId: ALLANIME_BUILD_ID, key: ALLANIME_STATIC_KEY, legacyCtr: true },
      { epoch: ALLANIME_EPOCH, buildId: ALLANIME_LEGACY_BUILD_ID, key: ALLANIME_STATIC_KEY, legacyCtr: true },
    ].filter((material, index, items) => items.findIndex((item) => item.epoch === material.epoch && item.buildId === material.buildId && item.key.equals(material.key)) === index)
    let result: unknown = null
    let rawText = ''
    let lastEpisodeError: unknown

    for (const material of materials) {
      const extensions = { persistedQuery: { version: 1, sha256Hash: queryHash }, aaReq: createAllAnimeRequestToken(queryHash, material) }
      const url = new URL(`${ALLANIME_API}/api`)
      url.searchParams.append('variables', JSON.stringify(queryVars))
      url.searchParams.append('extensions', JSON.stringify(extensions))

      try {
        const response = await fetchChecked(url, {
          method: 'GET',
          headers: {
            'User-Agent': AGENT,
            'Referer': ALLANIME_REFR,
            'Origin': ALLANIME_REFR,
            'x-build-id': material.buildId,
          }
        })
        rawText = await response.text()
        debugAllAnimeEpisodeResponse(`persisted episode query raw response (build ${material.buildId})`, rawText)
        result = processResponse(rawText, material)
        const candidateSources = getEpisodeSourceValues(result)
        if (Array.isArray(candidateSources) || typeof candidateSources === 'string') break
        result = null
        lastEpisodeError = new Error('Episode response contained no source list')
      } catch (error: unknown) {
        lastEpisodeError = error
        console.warn(`[scrape] Persisted episode query failed for build ${material.buildId}:`, errorMessage(error))
        result = null
      }
    }

    if (result === null) {
        const episodeEmbedGql = `query ($showId: String!, $translationType: VaildTranslationTypeEnumType!, $episodeString: String!) { episode( showId: $showId translationType: $translationType episodeString: $episodeString ) { episodeString sourceUrls }}`
        for (const material of materials) {
          try {
            const response = await fetchChecked(`${ALLANIME_API}/api`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'User-Agent': AGENT,
                'Referer': ALLANIME_REFR,
                'x-build-id': material.buildId,
              },
              body: JSON.stringify({
                variables: queryVars,
                query: episodeEmbedGql,
                extensions: { aaReq: createAllAnimeRequestToken(queryHash, material) },
              }),
            })
            rawText = await response.text()
            debugAllAnimeEpisodeResponse(`fallback episode query raw response (build ${material.buildId})`, rawText)
            result = processResponse(rawText, material)
            const candidateSources = getEpisodeSourceValues(result)
            if (Array.isArray(candidateSources) || typeof candidateSources === 'string') break
            result = null
            lastEpisodeError = new Error('Episode response contained no source list')
          } catch (error: unknown) {
            lastEpisodeError = error
            console.warn(`[scrape] Fallback episode query failed for build ${material.buildId}:`, errorMessage(error))
          }
        }
    }

    if (result === null) throw new Error(`Episode response could not be decoded: ${errorMessage(lastEpisodeError)}`)
  
    debugAllAnimeEpisodeResponse('episode response before processing', rawText)
    let sourceValues = getEpisodeSourceValues(result)

    if (typeof sourceValues === 'string') {
        sourceValues = JSON.parse(sourceValues) as unknown
    }
    if (sourceValues === undefined) throw new Error('Episode response contained no source list')
    if (!Array.isArray(sourceValues)) throw new Error('Episode response contained an invalid source list')
    const sources: SourceEntry[] = sourceValues.flatMap((value): SourceEntry[] => {
      if (!isObject(value)) return []
      return [{
        sourceUrl: typeof value.sourceUrl === 'string' ? value.sourceUrl : undefined,
        sourceName: typeof value.sourceName === 'string' ? value.sourceName : undefined,
      }]
    })
    console.log('Extracted sources count:', sources.length)

    const cipherMap = getCipherMap()

    const resolvedLinks: StreamLink[] = []
    const seen = new Set<string>()

    const toAbsoluteUrl = (link: string): string => {
        if (!link) return ''
        if (link.startsWith('//')) return `https:${link}`
        if (link.startsWith('/')) return `https://${ALLANIME_BASE}${link}`
        return link
    }

    const resolutionWeight = (value: string): number => {
        const match = value?.match(/(\d{3,4})p/i)
        if (match) return Number(match[1])
        if ((value || '').toLowerCase() === 'auto') return -1
        return 0
    }

    const providerWeight = (provider: string): number => {
        const p = (provider || '').toLowerCase()
        if (p.includes('s-mp4')) return 3000
        if (p.includes('mp4')) return 2000
        if (p.includes('default')) return 1000
        return 0
    }

    const isDirectMediaUrl = (url: string): boolean => {
        const u = url.toLowerCase()
        return u.includes('tools.fast4speed.rsvp')
            || u.includes('.m3u8')
            || u.includes('.mp4')
            || u.includes('/videoplayback')
            || u.includes('video.wixstatic.com/video/')
    }

    const pushLink = (entry: { url: string; resolution: string; hls: boolean; provider: string }) => {
        const url = toAbsoluteUrl(entry.url.trim())
        if (!url || !/^https?:\/\//i.test(url)) return
        const key = `${url}|${entry.provider}|${entry.resolution}`
        if (seen.has(key)) return
        seen.add(key)
        resolvedLinks.push({ ...entry, url, downloadable: true })
    }

    const isReachableDirectMedia = async (url: string): Promise<boolean> => {
        try {
            const res = await fetch(url, {
                method: 'GET',
                headers: {
                    'User-Agent': AGENT,
                    'Referer': ALLANIME_REFR,
                    'Origin': ALLANIME_REFR,
                    'Range': 'bytes=0-0',
                    'Accept': '*/*'
                },
                signal: AbortSignal.timeout(5000)
            })
            return res.ok || res.status === 206
        } catch {
            return false
        }
    }

    const resolveMp4Upload = async (embedUrl: string): Promise<string | null> => {
        try {
            const response = await fetchChecked(embedUrl, {
                headers: {
                    'User-Agent': AGENT,
                    'Referer': ALLANIME_REFR,
                    'Accept': 'text/html,application/xhtml+xml',
                },
                redirect: 'follow',
            }, 10_000)
            const html = await response.text()
            const match = html.match(/\bsrc\s*:\s*["']([^"']+)["']/i)
            if (!match) return null

            const mediaUrl = match[1]
                .replace(/\\\//g, '/')
                .replace(/\\u0026/gi, '&')
                .trim()
            return /^https?:\/\//i.test(mediaUrl) ? mediaUrl : null
        } catch (error: unknown) {
            console.warn('Skipped provider Mp4Upload:', errorMessage(error))
            return null
        }
    }

    for (const source of sources) {
        let providerUrl = (source.sourceUrl as string) || ''
        if (providerUrl.startsWith('--')) {
            const hexPairs = providerUrl.substring(2).match(/.{1,2}/g) || [];
            let decipheredUrl = ''
            for (const pair of hexPairs) {
                decipheredUrl += cipherMap[pair] || ''
            }
            providerUrl = decipheredUrl
        }
        providerUrl = providerUrl.trim()

        // MP4Upload exposes its media URL in the embed page's player config.
        if (/^https?:\/\/(?:www\.)?mp4upload\.com\//i.test(providerUrl)) {
            const mediaUrl = await resolveMp4Upload(providerUrl)
            if (mediaUrl) {
                pushLink({
                    url: mediaUrl,
                    resolution: 'Auto',
                    hls: mediaUrl.includes('.m3u8'),
                    provider: 'Mp4Upload',
                })
            }
            continue
        }

        // Case 1: direct stream URL, no secondary fetch needed
        if (/^https?:\/\//i.test(providerUrl) && isDirectMediaUrl(providerUrl)) {
            // fast4speed links are tokenized and can already be expired (404) by playback time
            if (providerUrl.includes('tools.fast4speed.rsvp')) {
                const alive = await isReachableDirectMedia(providerUrl)
                if (!alive) continue
            }
            pushLink({
                url: providerUrl,
                resolution: 'Auto',
                hls: providerUrl.includes('.m3u8'),
                provider: source.sourceName || 'Default'
            })
            continue
        }

        // Case 2: allanime.day internal proxy (/apivtwo/ or /apiv2/) - returns { links: [...] } JSON
        // Skip external HTML providers (gogo, streamsb, mp4upload, ok.ru, etc.) they require different scraping
        const isAllanimeInternal = providerUrl.startsWith('/apivtwo/') || providerUrl.startsWith('/apiv2/')
        if (!isAllanimeInternal) continue

        const clockUrl = providerUrl.replace('/clock', '/clock.json')
        const fullProviderUrl = `https://${ALLANIME_BASE}${clockUrl}`
        
        try {
            const providerRes = await fetchChecked(fullProviderUrl, {
                headers: {
                    'User-Agent': AGENT,
                    'Referer': ALLANIME_REFR,
                    'Origin': ALLANIME_REFR,
                    'Accept': 'application/json, text/plain, */*'
                },
            }, 8000)
            const providerText = await providerRes.text()
            const provJson = JSON.parse(providerText) as unknown
            
            if (isObject(provJson) && Array.isArray(provJson.links)) {
                for (const value of provJson.links) {
                    if (!isObject(value)) continue
                    const linkObj: ProviderLink = {
                      link: typeof value.link === 'string' ? value.link : undefined,
                      hls: typeof value.hls === 'boolean' ? value.hls : undefined,
                      resolutionStr: typeof value.resolutionStr === 'string' ? value.resolutionStr : undefined,
                    }
                    const link: string = linkObj.link || ''
                    // wixmp repackager - parse multi-quality from URL
                    if (link.includes('repackager.wixmp.com')) {
                        const base = link.replace(/repackager\.wixmp\.com\//g, '').replace(/\.urlset.*/, '')
                        const qualitiesMatch = link.match(/,([^/]*),\/mp4/);
                        if (qualitiesMatch) {
                            for (const q of qualitiesMatch[1].split(',')) {
                                const qualityUrl = base.replace(/,[^/]*/g, `,${q}`)
                                pushLink({ url: qualityUrl, resolution: q, hls: false, provider: source.sourceName || 'Default' })
                            }
                        } else {
                            pushLink({ url: link, resolution: 'Auto', hls: false, provider: source.sourceName || 'Default' })
                        }
                    } else if (link.includes('.m3u8') || link.includes('master.m3u8') || linkObj.hls) {
                        pushLink({ url: link, resolution: linkObj.resolutionStr || 'Auto', hls: true, provider: source.sourceName || 'Default' })
                    } else {
                        pushLink({ url: link, resolution: linkObj.resolutionStr || 'Auto', hls: false, provider: source.sourceName || 'Default' })
                    }
                }
            }
        } catch(error: unknown) {
            // Silently skip failed providers
            console.warn(`Skipped provider ${source.sourceName}:`, errorMessage(error))
        }
    }

    return resolvedLinks.sort((a, b) => {
        const p = providerWeight(b.provider) - providerWeight(a.provider)
        if (p !== 0) return p
        const d = resolutionWeight(b.resolution) - resolutionWeight(a.resolution)
        if (d !== 0) return d
        if (a.hls !== b.hls) return a.hls ? -1 : 1
        return a.provider.localeCompare(b.provider)
    })
}
