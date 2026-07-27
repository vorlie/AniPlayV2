import { load, type Cheerio } from 'cheerio'
import type { AnyNode } from 'domhandler'
import type { TorrentRelease } from '../../src/torrent-types'

const BASE = 'https://nyaa.si'
const RSS = `${BASE}/?page=rss&c=1_2&f=0`
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36'
const TIMEOUT_MS = 12_000
const MAX_RESULTS = 100

function text(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function namespacedText($item: Cheerio<AnyNode>, name: string): string {
  return text($item.find(`[name="${name}"]`).first().text() || $item.find(name.replace(':', '\\:')).first().text())
}

export function parseSize(value: string): number | null {
  const match = /^\s*([\d.]+)\s*(KiB|MiB|GiB|TiB|KB|MB|GB|TB|B)\s*$/i.exec(value)
  if (!match) return null
  const amount = Number(match[1])
  if (!Number.isFinite(amount)) return null
  const unit = match[2].toLowerCase()
  const powers: Record<string, number> = {
    b: 0, kib: 1, kb: 1, mib: 2, mb: 2, gib: 3, gb: 3, tib: 4, tb: 4,
  }
  return Math.round(amount * 1024 ** powers[unit])
}

export function extractTorrentEpisode(title: string): string | null {
  const patterns = [
    /\bS\d{1,2}E(\d{1,4}(?:\.\d+)?)\b/i,
    /\b\d{1,2}x(\d{1,4}(?:\.\d+)?)\b/i,
    /\bEpisode\s+(\d{1,4}(?:\.\d+)?)\b/i,
    /\s-\s(\d{1,4}(?:\.\d+)?)(?:v\d+)?(?:\s|[[(])/i,
    /\[(\d{1,4}(?:\.\d+)?)(?:v\d+)?\]/i,
  ]
  for (const pattern of patterns) {
    const value = pattern.exec(title)?.[1]
    if (value) return String(Number(value))
  }
  return null
}

function releaseResolution(title: string): string | null {
  return /\b(2160p|1440p|1080p|720p|480p)\b/i.exec(title)?.[1]?.toLowerCase() ?? null
}

function releaseCodec(title: string): string | null {
  if (/\b(?:x265|h\.?265|hevc)\b/i.test(title)) return 'HEVC'
  if (/\b(?:x264|h\.?264|avc)\b/i.test(title)) return 'H.264'
  if (/\bav1\b/i.test(title)) return 'AV1'
  return null
}

export function parseNyaaRss(xml: string): TorrentRelease[] {
  const $ = load(xml, { xmlMode: true })
  const results: TorrentRelease[] = []
  $('item').slice(0, MAX_RESULTS).each((_index, item) => {
    const $item = $(item)
    const title = text($item.find('title').first().text())
    const infoHash = namespacedText($item, 'nyaa:infoHash').toLowerCase()
    if (!title || !/^[a-f0-9]{40}$/i.test(infoHash)) return
    const size = namespacedText($item, 'nyaa:size') || 'Unknown'
    const seeders = Number(namespacedText($item, 'nyaa:seeders')) || 0
    const leechers = Number(namespacedText($item, 'nyaa:leechers')) || 0
    const trusted = namespacedText($item, 'nyaa:trusted').toLowerCase() === 'yes'
    const remake = namespacedText($item, 'nyaa:remake').toLowerCase() === 'yes'
    const published = text($item.find('pubDate').first().text())
    const batch = /\b(batch|complete|全集)\b/i.test(title) || /\b\d{1,4}\s*[-~]\s*\d{1,4}\b/.test(title)
    results.push({
      id: infoHash,
      title,
      infoHash,
      magnet: `magnet:?xt=urn:btih:${infoHash}`,
      size,
      sizeBytes: parseSize(size),
      seeders,
      leechers,
      publishedAt: published && Number.isFinite(Date.parse(published)) ? new Date(published).toISOString() : null,
      trusted,
      remake,
      resolution: releaseResolution(title),
      codec: releaseCodec(title),
      episode: batch ? null : extractTorrentEpisode(title),
      batch,
    })
  })
  return results
}

function scoreRelease(release: TorrentRelease, episode: string): number {
  let score = release.episode === episode ? 1_000 : release.batch ? 450 : 0
  if (release.trusted) score += 180
  if (release.remake) score -= 250
  if (release.resolution === '1080p') score += 100
  if (release.codec === 'H.264') score += 50
  score += Math.min(200, Math.log2(release.seeders + 1) * 25)
  return score
}

export function rankNyaaReleases(releases: TorrentRelease[], episode: string): TorrentRelease[] {
  return releases
    .filter((release) => release.episode === episode || release.batch)
    .sort((a, b) => scoreRelease(b, episode) - scoreRelease(a, episode) || b.seeders - a.seeders)
}

export async function searchNyaa(query: string, episode: string): Promise<TorrentRelease[]> {
  const normalized = query.trim().slice(0, 180)
  if (!normalized) return []
  const url = `${RSS}&q=${encodeURIComponent(normalized)}`
  const response = await fetch(url, {
    headers: { Accept: 'application/rss+xml, application/xml, text/xml;q=0.9', 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    redirect: 'follow',
  })
  if (response.status === 429) throw new Error('Nyaa rate limited the search. Please try again later.')
  if (!response.ok) throw new Error(`Nyaa search failed (${response.status})`)
  const xml = await response.text()
  if (!/<rss[\s>]/i.test(xml)) throw new Error('Nyaa returned an invalid RSS response')
  return rankNyaaReleases(parseNyaaRss(xml), episode)
}
