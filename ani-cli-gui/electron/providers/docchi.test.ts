import { describe, expect, it } from 'vitest'
import { parseDocchiEpisodeList, parseDocchiPlayerEmbeds, parseDocchiSeriesList } from './docchi'

describe('Docchi catalog parsing', () => {
  it('matches searchable title fields and filters adult entries', () => {
    const payload = [
      {
        slug: 'oshi-no-ko',
        title: '"Oshi no Ko"',
        title_en: 'My Star',
        cover: 'https://cdn.example/oshi.jpg',
        episodes: 11,
        adult_content: 'false',
      },
      {
        slug: 'adult-title',
        title: 'Private Adult Title',
        episodes: 1,
        adult_content: 'true',
      },
      {
        slug: 'unrelated',
        title: 'Unrelated',
        episodes: 12,
        adult_content: false,
      },
    ]
    const results = parseDocchiSeriesList(payload, 'My Star')

    expect(results).toEqual([{
      id: 'oshi-no-ko',
      name: '"Oshi no Ko" / My Star',
      episodes: 11,
      coverUrl: 'https://cdn.example/oshi.jpg',
      catalogProvider: 'docchi',
    }])

    expect(parseDocchiSeriesList(payload, 'Private Adult Title')).toEqual([])
    expect(parseDocchiSeriesList(payload, 'Private Adult Title', true)).toEqual([{
      id: 'adult-title',
      name: 'Private Adult Title',
      episodes: 1,
      coverUrl: undefined,
      catalogProvider: 'docchi',
    }])
  })

  it('returns sorted numeric episode strings', () => {
    expect(parseDocchiEpisodeList([
      { anime_episode_number: 10 },
      { anime_episode_number: 2 },
      { anime_episode_number: 1 },
      { anime_episode_number: null },
    ])).toEqual(['1', '2', '10'])
  })

  it('maps known player embeds to non-downloadable stream links', () => {
    const links = parseDocchiPlayerEmbeds([
      {
        player: 'https://geo.dailymotion.com/player/x/embed/video/x9abcde',
        player_hosting: 'dailymotion',
        translator_title: 'FrixySubs',
      },
      {
        player: 'https://mega.nz/embed/example',
        player_hosting: 'mega',
      },
      {
        player: 'not a url',
        player_hosting: 'broken',
      },
    ])

    expect(links).toEqual([
      {
        url: 'https://geo.dailymotion.com/player/x/embed/video/x9abcde',
        resolution: 'Embed',
        hls: false,
        provider: 'Docchi · FrixySubs',
        downloadable: false,
        embed: true,
      },
      {
        url: 'https://mega.nz/embed/example',
        resolution: 'Embed',
        hls: false,
        provider: 'Docchi · mega',
        downloadable: false,
        embed: true,
      },
    ])
  })

})
