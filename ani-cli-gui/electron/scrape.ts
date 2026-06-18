import * as crypto from 'crypto'
import fs from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'

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
  } catch (e: any) {
    console.warn('[scrape] Could not load persisted ciphermap, using fallback:', e.message)
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
const MODE = 'sub'

export interface SearchResult {
  id: string
  name: string
  episodes: number
}

export async function searchAnime(query: string): Promise<SearchResult[]> {
  const searchGql = `query( $search: SearchInput $limit: Int $page: Int $translationType: VaildTranslationTypeEnumType $countryOrigin: VaildCountryOriginEnumType ) { shows( search: $search limit: $limit page: $page translationType: $translationType countryOrigin: $countryOrigin ) { edges { _id name availableEpisodes __typename } }}`

  const variables = {
    search: { allowAdult: false, allowUnknown: false, query },
    limit: 40,
    page: 1,
    translationType: MODE,
    countryOrigin: 'ALL',
  }

  const response = await fetch(`${ALLANIME_API}/api`, {
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

  const json = await response.json()
  
  const edges = json?.data?.shows?.edges || []
  return edges.map((edge: any) => {
    // The bash script does: mode === 'sub' ? edge.availableEpisodes.sub : ...
    const episodes = edge.availableEpisodes && edge.availableEpisodes[MODE] ? edge.availableEpisodes[MODE] : 0
    return {
      id: edge._id,
      name: edge.name,
      episodes,
    }
  })
}

export async function getEpisodes(showId: string): Promise<string[]> {
  const episodesListGql = `query ($showId: String!) { show( _id: $showId ) { _id availableEpisodesDetail }}`
  const response = await fetch(`${ALLANIME_API}/api`, {
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

  const json = await response.json()
  const modeData = json?.data?.show?.availableEpisodesDetail?.[MODE] || []
  return modeData.map((e: any) => e.toString()).sort((a: any, b: any) => parseFloat(a) - parseFloat(b))
}

const ALLANIME_KEY = crypto.createHash('sha256').update('Xot36i3lK3:v1').digest('hex')

function processResponse(responseRaw: string): any {
  let parsed = responseRaw
  try {
    parsed = JSON.parse(responseRaw)
  } catch (e) {
    // If it's already an object, leave it
  }

  // @ts-expect-error brother
  if (!parsed?.data?.episode?.sourceUrls) {
      // @ts-expect-error brother
      const tobeparsed = parsed?.data?.episode?.tobeparsed || parsed?.data?.tobeparsed || parsed?.tobeparsed
      if (!tobeparsed) return parsed

      const buffer = Buffer.from(tobeparsed, 'base64')
      
      // The bash script format:
      // iv is 12 bytes at offset 1
      // ctr is iv + "00000002"
      // ciphertext starts at offset 13, length is filesize - 13 - 16
      const ivRaw = buffer.subarray(1, 13)
      const ivHex = ivRaw.toString('hex')
      const ctrHex = ivHex + "00000002"
      const ctrBuffer = Buffer.from(ctrHex, 'hex')
      
      const ctLen = buffer.length - 13 - 16
      const ciphertext = buffer.subarray(13, 13 + ctLen)
      
      const keyBuffer = Buffer.from(ALLANIME_KEY, 'hex')
      
      const decipher = crypto.createDecipheriv('aes-256-ctr', keyBuffer, ctrBuffer)
      const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()])
      
      return JSON.parse(decrypted.toString('utf-8'))
  }
  return parsed
}

export async function getEpisodeLinks(showId: string, epNo: string): Promise<any> {
    const queryHash = "d405d0edd690624b66baba3068e0edc3ac90f1597d898a1ec8db4e5c43c00fec"
    const queryVars = { showId, translationType: MODE, episodeString: epNo }
    const extensions = { persistedQuery: { version: 1, sha256Hash: queryHash } }

    const url = new URL(`${ALLANIME_API}/api`)
    url.searchParams.append('variables', JSON.stringify(queryVars))
    url.searchParams.append('extensions', JSON.stringify(extensions))

    let response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'User-Agent': AGENT,
        'Referer': ALLANIME_REFR,
        'Origin': ALLANIME_REFR,
      }
    })

    let rawText = await response.text()

    if (!rawText || !rawText.includes("tobeparsed")) {
        const episodeEmbedGql = `query ($showId: String!, $translationType: VaildTranslationTypeEnumType!, $episodeString: String!) { episode( showId: $showId translationType: $translationType episodeString: $episodeString ) { episodeString sourceUrls }}`
        response = await fetch(`${ALLANIME_API}/api`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': AGENT,
            'Referer': ALLANIME_REFR,
          },
          body: JSON.stringify({
            variables: queryVars,
            query: episodeEmbedGql,
          }),
        })
        rawText = await response.text()
    }
  
    const result = processResponse(rawText)
    
    let sources = []
    if (result instanceof Array) {
        sources = result
    } else if (result?.sourceUrls) {
        sources = result.sourceUrls
    } else if (result?.episode?.sourceUrls) {
        // Decrypted tobeparsed returns { episode: { sourceUrls: [...] } }
        sources = result.episode.sourceUrls
    } else if (result?.data?.episode?.sourceUrls) {
        sources = result.data.episode.sourceUrls
    }
    console.log("Extracted sources count:", sources.length)
    
    if (typeof sources === 'string') {
        sources = JSON.parse(sources)
    }

    const cipherMap = getCipherMap()

    const resolvedLinks: any[] = []
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
        resolvedLinks.push({ ...entry, url })
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

        // Case 2: allanime.day internal proxy (/apivtwo/ or /apiv2/) — returns { links: [...] } JSON
        // Skip external HTML providers (gogo, streamsb, mp4upload, ok.ru, etc.) they require different scraping
        const isAllanimeInternal = providerUrl.startsWith('/apivtwo/') || providerUrl.startsWith('/apiv2/')
        if (!isAllanimeInternal) continue

        const clockUrl = providerUrl.replace('/clock', '/clock.json')
        const fullProviderUrl = `https://${ALLANIME_BASE}${clockUrl}`
        
        try {
            const providerRes = await fetch(fullProviderUrl, {
                headers: {
                    'User-Agent': AGENT,
                    'Referer': ALLANIME_REFR,
                    'Origin': ALLANIME_REFR,
                    'Accept': 'application/json, text/plain, */*'
                },
                signal: AbortSignal.timeout(8000)
            })
            if (!providerRes.ok) continue
            const providerText = await providerRes.text()
            const provJson = JSON.parse(providerText)
            
            if (provJson?.links && Array.isArray(provJson.links)) {
                for (const linkObj of provJson.links) {
                    const link: string = linkObj.link || ''
                    // wixmp repackager — parse multi-quality from URL
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
        } catch(e: any) {
            // Silently skip failed providers
            console.warn(`Skipped provider ${source.sourceName}:`, e.message)
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
