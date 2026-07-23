import { describe, expect, it } from 'vitest'
import { decodeAniDbId, encodeAniDbId, extractAniDbEmbed, parseAniDbEpisodes, parseAniDbSuggestions, parseHlsVariants } from './anidb'

describe('AniDB.app provider parsing', () => {
  it('round-trips self-identifying catalog IDs', () => {
    const encoded = encodeAniDbId({ version: 1, id: 457, slug: 'attack-on-titan', title: 'Attack on Titan', episodes: 25 })
    expect(encoded).toMatch(/^anidb:/)
    expect(decodeAniDbId(encoded)).toEqual({ version: 1, id: 457, slug: 'attack-on-titan', title: 'Attack on Titan', episodes: 25 })
  })

  it('parses all suggestions, deduplicates IDs, and filters marked adult entries', () => {
    const html = `
      <a href="/anime/attack-on-titan-457"><img src="https://img.example/a.jpg" alt="Attack on Titan">25 Episodes</a>
      <a href="/anime/attack-on-titan-457"><img alt="Duplicate"></a>
      <a class="adult" href="/anime/adult-title-999"><img alt="Adult Title">Hentai</a>`
    const safe = parseAniDbSuggestions(html, false)
    expect(safe).toHaveLength(1)
    expect(safe[0]).toMatchObject({ name: 'Attack on Titan', episodes: 25, catalogProvider: 'anidb' })
    expect(parseAniDbSuggestions(html, true)).toHaveLength(2)
  })

  it('preserves fractional episodes and sorts them numerically', () => {
    expect(parseAniDbEpisodes({ data: [
      { id: 3, number: 2 },
      { id: 1, number: 1 },
      { id: 2, number: 1.5 },
    ] })).toEqual([
      { id: 1, number: '1' },
      { id: 2, number: '1.5' },
      { id: 3, number: '2' },
    ])
  })

  it('extracts native media and subtitle tracks from embed markup', () => {
    const parsed = extractAniDbEmbed(`
      <script>const player = { file: 'https://cdn.example/master.m3u8' }</script>
      <track src="/subs/en.vtt" label="English">
    `, 'https://embed.example/player/1')
    expect(parsed.sources).toEqual(['https://cdn.example/master.m3u8'])
    expect(parsed.subtitles).toEqual([{ label: 'English', url: 'https://embed.example/subs/en.vtt' }])
  })

  it('expands relative HLS variants with resolution labels', () => {
    const variants = parseHlsVariants(`#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=1280x720
720/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=1600000,RESOLUTION=1920x1080
https://video.example/1080.m3u8`, 'https://video.example/master.m3u8')
    expect(variants).toEqual([
      { url: 'https://video.example/720/index.m3u8', resolution: '720p' },
      { url: 'https://video.example/1080.m3u8', resolution: '1080p' },
    ])
  })
})
