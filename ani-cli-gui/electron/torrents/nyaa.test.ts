import { describe, expect, it } from 'vitest'
import { buildNyaaSearchQueries, extractTorrentEpisode, parseNyaaRss, parseSize, rankNyaaReleases } from './nyaa'

const HASH_A = 'a'.repeat(40)
const HASH_B = 'b'.repeat(40)
const HASH_C = 'c'.repeat(40)

function item(title: string, hash: string, seeders: number, trusted = 'No') {
  return `<item>
    <title>${title}</title>
    <link>https://nyaa.si/view/1234567</link>
    <pubDate>Mon, 27 Jul 2026 12:00:00 +0000</pubDate>
    <nyaa:infoHash>${hash}</nyaa:infoHash>
    <nyaa:size>1.25 GiB</nyaa:size>
    <nyaa:seeders>${seeders}</nyaa:seeders>
    <nyaa:leechers>3</nyaa:leechers>
    <nyaa:trusted>${trusted}</nyaa:trusted>
    <nyaa:remake>No</nyaa:remake>
  </item>`
}

describe('Nyaa RSS parsing', () => {
  it('parses release metadata and valid byte sizes', () => {
    const releases = parseNyaaRss(`<rss xmlns:nyaa="https://nyaa.si/xmlns/nyaa"><channel>${item('[Group] Example - 06 [1080p][x264]', HASH_A, 12, 'Yes')}</channel></rss>`)
    expect(releases).toHaveLength(1)
    expect(releases[0]).toMatchObject({
      infoHash: HASH_A,
      seeders: 12,
      trusted: true,
      resolution: '1080p',
      codec: 'H.264',
      episode: '6',
      batch: false,
    })
    expect(releases[0].magnet).toContain(`xt=urn:btih:${HASH_A}`)
    expect(new URL(releases[0].magnet).searchParams.getAll('tr')).toHaveLength(5)
    expect(releases[0].sizeBytes).toBe(Math.round(1.25 * 1024 ** 3))
  })

  it('ignores malformed feeds and invalid hashes', () => {
    expect(parseNyaaRss('<html>blocked</html>')).toEqual([])
    expect(parseNyaaRss('<rss><channel><item><title>Example - 01</title><nyaa:infoHash>bad</nyaa:infoHash></item></channel></rss>')).toEqual([])
  })

  it('recognizes common episode naming forms and fractional specials', () => {
    expect(extractTorrentEpisode('Show S02E06 1080p')).toBe('6')
    expect(extractTorrentEpisode('Show 2x07 WEB')).toBe('7')
    expect(extractTorrentEpisode('Show Episode 12.5')).toBe('12.5')
    expect(extractTorrentEpisode('[Group] Show - 08v2 [1080p]')).toBe('8')
  })

  it('ranks exact trusted releases ahead of batches and excludes other episodes', () => {
    const releases = parseNyaaRss(`<rss xmlns:nyaa="https://nyaa.si/xmlns/nyaa"><channel>
      ${item('[Group] Example - 06 [1080p][x264]', HASH_A, 5, 'Yes')}
      ${item('[Group] Example [01-12] Batch [1080p]', HASH_B, 100)}
      ${item('[Group] Example - 07 [1080p]', HASH_C, 500)}
    </channel></rss>`)
    const ranked = rankNyaaReleases(releases, '6')
    expect(ranked.map((release) => release.infoHash)).toEqual([HASH_A, HASH_B])
  })

  it('parses binary and decimal-looking size labels consistently', () => {
    expect(parseSize('512 MiB')).toBe(512 * 1024 ** 2)
    expect(parseSize('2 GB')).toBe(2 * 1024 ** 3)
    expect(parseSize('unknown')).toBeNull()
  })

  it('adds SXXEXX searches alongside broad title searches', () => {
    expect(buildNyaaSearchQueries('Dan Da Dan Season 2', '6')).toEqual([
      'Dan Da Dan Season 2',
      'Dan Da Dan S02E06',
    ])
    expect(buildNyaaSearchQueries('Example S02', '12')).toEqual([
      'Example S02',
      'Example S02E12',
    ])
    expect(buildNyaaSearchQueries('Frieren', '3')).toEqual([
      'Frieren',
      'Frieren S01E03',
    ])
    expect(buildNyaaSearchQueries('Example S02E06', '6')).toEqual([
      'Example S02E06',
    ])
  })
})
