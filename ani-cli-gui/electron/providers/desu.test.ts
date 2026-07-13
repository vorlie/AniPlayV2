import fs from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isChallengePage, parseDailymotionMetadata, parseDesuEpisodes, parseDesuMirrors, parseDesuSearch, parseIframeWrapper, parseRumbleEmbed, validateDesuAnimeId } from './desu'

const fixture = (name: string) => fs.readFileSync(join(import.meta.dirname, '..', 'fixtures', name), 'utf8')

describe('Desu catalog parsing', () => {
  it('parses only canonical anime search cards', () => {
    expect(parseDesuSearch(fixture('desu-search.html'))).toEqual([{
      id: 'https://desu-online.pl/anime/oshi-no-ko/', name: '"Oshi no Ko"', episodes: 0, catalogProvider: 'desu',
    }])
  })

  it('parses and numerically sorts episode references', () => {
    expect(parseDesuEpisodes(fixture('desu-anime.html')).map((entry) => entry.number)).toEqual(['1', '2'])
  })

  it('decodes and deduplicates Base64 iframe mirrors', () => {
    const mirrors = parseDesuMirrors(fixture('desu-episode.html'))
    expect(mirrors.map((mirror) => new URL(mirror.url).hostname)).toEqual(['www.dailymotion.com', 'rumble.com'])
  })

  it('rejects foreign and non-anime provider IDs', () => {
    expect(() => validateDesuAnimeId('https://example.com/anime/test/')).toThrow()
    expect(() => validateDesuAnimeId('https://desu-online.pl/test/')).toThrow()
  })

  it('recognizes Cloudflare challenge pages', () => {
    expect(isChallengePage(fixture('challenge.html'))).toBe(true)
  })
})

describe('Desu mirror resolvers', () => {
  it('parses allowlisted Dailymotion HLS metadata', () => {
    const links = parseDailymotionMetadata(JSON.parse(fixture('dailymotion.json')))
    expect(links[0]).toMatchObject({ hls: true, downloadable: false, provider: 'Desu · Dailymotion' })
  })

  it('unwraps Iframely Dailymotion embeds', () => {
    expect(parseIframeWrapper(fixture('iframely.html'))).toContain('dailymotion.com/player.html')
  })

  it('extracts allowlisted Rumble master playlists', () => {
    expect(parseRumbleEmbed(fixture('rumble.html'))[0]).toMatchObject({
      url: 'https://rumble.com/hls-vod/abc123/playlist.m3u8', hls: true, downloadable: false,
    })
  })
})
