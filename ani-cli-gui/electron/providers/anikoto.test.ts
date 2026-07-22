import { describe, expect, it } from 'vitest'
import { getAnikotoEpisodePageUrl, mergeAnikotoSearchResults, parseAnikotoEpisodesPayload, parseAnikotoSearchPayload, parseMegaPlayDataId, parseMegaPlaySources, shouldResolveAnikotoNativeSources } from './anikoto'

describe('Anikoto provider parsing', () => {
  it('normalizes AniList search results for the Anikoto provider', () => {
    const results = parseAnikotoSearchPayload({
      data: {
        Page: {
          media: [{
            id: 21,
            idMal: 21,
            title: { english: 'One Piece', romaji: 'ONE PIECE' },
            episodes: 1169,
            coverImage: { large: 'https://img.example/one-piece.jpg' },
          }],
        },
      },
    })

    expect(results[0]).toMatchObject({
      name: 'One Piece',
      episodes: 1169,
      aniListMediaId: 21,
      coverUrl: 'https://img.example/one-piece.jpg',
      catalogProvider: 'anikoto',
    })
    expect(results[0].id).toMatch(/^anikoto:/)
  })

  it('normalizes Anikoto recent rows and keeps the series id', () => {
    const results = parseAnikotoSearchPayload({
      ok: true,
      data: [{
        id: 8948,
        title: 'Tomb Raider King',
        episodes: '12',
        ani_id: '184356',
        mal_id: '63316',
        poster: 'https://cdn.example/poster.jpg',
      }],
    })

    expect(results[0]).toMatchObject({
      name: 'Tomb Raider King',
      episodes: 12,
      aniListMediaId: 184356,
      catalogProvider: 'anikoto',
    })
  })

  it('can rank AniList metadata before provider recent rows', () => {
    const recent = [{ id: 'recent', name: 'Recent Title', episodes: 12, aniListMediaId: 1, catalogProvider: 'anikoto' as const }]
    const aniList = [{ id: 'anilist', name: 'AniList Title', episodes: 12, aniListMediaId: 1, catalogProvider: 'anikoto' as const }]

    expect(mergeAnikotoSearchResults(recent, aniList, true)[0].name).toBe('AniList Title')
    expect(mergeAnikotoSearchResults(recent, aniList, false)[0].name).toBe('Recent Title')
  })

  it('extracts episodes and embed metadata from Anikoto series responses', () => {
    const episodes = parseAnikotoEpisodesPayload({
      ok: true,
      data: {
        episodes: [{
          number: 1,
          episode_embed_id: '835403',
          embed_url: { sub: 'https://megaplay.buzz/stream/s-2/835403/sub' },
        }],
      },
    })

    expect(episodes).toEqual([{
      number: '1',
      embedId: '835403',
      embedUrl: { sub: 'https://megaplay.buzz/stream/s-2/835403/sub', dub: undefined },
    }])
  })
})

describe('MegaPlay parsing', () => {
  it('resolves native sources by default with an explicit opt-out', () => {
    expect(shouldResolveAnikotoNativeSources(undefined)).toBe(true)
    expect(shouldResolveAnikotoNativeSources('1')).toBe(true)
    expect(shouldResolveAnikotoNativeSources('false')).toBe(false)
    expect(shouldResolveAnikotoNativeSources('no')).toBe(false)
  })

  it('extracts the internal source id from the embed HTML', () => {
    expect(parseMegaPlayDataId('<div id="megaplay-player" data-id="36396"></div>')).toBe('36396')
  })

  it('parses object sources and caption tracks', () => {
    const parsed = parseMegaPlaySources({
      sources: { file: 'https://megap.kotocdn.site/anime/master.m3u8' },
      tracks: [{ file: 'https://subs.example/eng.vtt', label: 'English', kind: 'captions' }],
    })

    expect(parsed.links[0]).toMatchObject({
      url: 'https://megap.kotocdn.site/anime/master.m3u8',
      hls: true,
      provider: 'MegaPlay',
      subtitles: [{ label: 'English', url: 'https://subs.example/eng.vtt' }],
    })
  })

  it('parses array sources', () => {
    const parsed = parseMegaPlaySources({
      sources: [{ file: 'https://cdn.example/video.mp4', label: '1080p' }],
    })

    expect(parsed.links[0]).toMatchObject({
      url: 'https://cdn.example/video.mp4',
      resolution: '1080p',
      hls: false,
    })
  })
})

describe('Anikoto embed fallback behavior', () => {
  it('builds MegaPlay embed URLs from AniList ids without native extraction', async () => {
    await expect(getAnikotoEpisodePageUrl('anikoto:eyJhbmlsaXN0SWQiOiIyMSIsIm1hbElkIjoiMjEiLCJlcGlzb2RlcyI6MX0', '1', 'sub'))
      .resolves.toBe('https://megaplay.buzz/stream/ani/21/1/sub')
  })
})
