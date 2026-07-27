import { describe, expect, it } from 'vitest'
import {
  decodeAnikoto2Id,
  getAnikoto2EpisodePageUrl,
  parseAnikoto2EpisodesHtml,
  parseAnikoto2MapperPayload,
  parseAnikoto2SearchHtml,
  parseAnikoto2ServerResponse,
  parseAnikoto2ServersHtml,
  parseAnikoto2ShowPage,
} from './anikoto2'

describe('Anikoto 2 catalog parsing', () => {
  it('parses canonical search results and encodes stable provider IDs', () => {
    const results = parseAnikoto2SearchHtml(`
      <div class="scaff items">
        <a class="item" href="https://anikoto.cz/watch/black-torch-1d364">
          <img src="https://cdn.anipixcdn.co/thumbnail/black-torch.jpg">
          <div class="name d-title">Black Torch</div>
        </a>
      </div>
    `)

    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({
      name: 'Black Torch',
      episodes: 0,
      coverUrl: 'https://cdn.anipixcdn.co/thumbnail/black-torch.jpg',
      catalogProvider: 'anikoto2',
    })
    expect(decodeAnikoto2Id(results[0].id)).toEqual({
      slug: 'black-torch-1d364',
      title: 'Black Torch',
      coverUrl: 'https://cdn.anipixcdn.co/thumbnail/black-torch.jpg',
    })
  })

  it('extracts the numeric show identity and canonical URL', () => {
    expect(parseAnikoto2ShowPage(`
      <div id="watch-main" data-id="8913" data-url="https://anikoto.cz/watch/black-torch-1d364"></div>
    `)).toEqual({
      showId: '8913',
      canonicalUrl: 'https://anikoto.cz/watch/black-torch-1d364',
    })
  })

  it('preserves episode mode availability and encrypted server-list tokens', () => {
    const episodes = parseAnikoto2EpisodesHtml(`
      <a data-id="134023" data-num="1" data-slug="1" data-mal="61169"
         data-timestamp="1784388918" data-sub="1" data-dub="1" data-ids="episode-token"></a>
      <a data-id="134116" data-num="2" data-slug="2" data-mal="61169"
         data-timestamp="1784388918" data-sub="1" data-dub="0" data-ids="next-token"></a>
    `)

    expect(episodes).toEqual([
      {
        number: '1',
        slug: '1',
        token: 'episode-token',
        episodeId: '134023',
        malId: '61169',
        timestamp: '1784388918',
        sub: true,
        dub: true,
      },
      {
        number: '2',
        slug: '2',
        token: 'next-token',
        episodeId: '134116',
        malId: '61169',
        timestamp: '1784388918',
        sub: true,
        dub: false,
      },
    ])
  })
})

describe('Anikoto 2 server parsing', () => {
  const servers = `
    <div class="servers">
      <div class="type" data-type="sub"><label>SUB</label><ul>
        <li data-sv-id="8e4" data-link-id="soft-token">VidPlay-1</li>
      </ul></div>
      <div class="type" data-type="sub"><label>H-SUB</label><ul>
        <li data-sv-id="323" data-link-id="hard-token">HD-1</li>
      </ul></div>
      <div class="type" data-type="dub"><label>DUB</label><ul>
        <li data-sv-id="e54" data-link-id="dub-token">Vidstream-2</li>
      </ul></div>
    </div>
  `

  it('uses group labels to distinguish soft and hard subs', () => {
    expect(parseAnikoto2ServersHtml(servers, 'sub')).toEqual([
      { label: 'SUB · VidPlay-1', kind: 'sub', token: 'soft-token', serverId: '8e4' },
      { label: 'H-SUB · HD-1', kind: 'hsub', token: 'hard-token', serverId: '323' },
    ])
    expect(parseAnikoto2ServersHtml(servers, 'dub')).toEqual([
      { label: 'DUB · Vidstream-2', kind: 'dub', token: 'dub-token', serverId: 'e54' },
    ])
  })

  it('normalizes supplemental mapper providers', () => {
    expect(parseAnikoto2MapperPayload({
      status: 200,
      gogoanime: { sub: { url: 'gogo-token' } },
      animepahe: { sub: { url: 'pahe-token', download: 'https://example.test/download' } },
    }, 'sub')).toEqual([
      { label: 'H-SUB · Vidstream', kind: 'hsub', token: 'gogo-token' },
      { label: 'H-SUB · Kiwi-Stream', kind: 'hsub', token: 'pahe-token' },
    ])
  })

  it('accepts only safe HTTPS embed results', () => {
    const server = { label: 'SUB · VidPlay-1', kind: 'sub' as const, token: 'token' }
    expect(parseAnikoto2ServerResponse({
      status: 200,
      result: { url: 'https://vidtube.site/stream/example/sub' },
    }, server)).toMatchObject({
      url: 'https://vidtube.site/stream/example/sub',
      provider: 'Anikoto 2 · SUB · VidPlay-1',
      downloadable: false,
      embed: true,
    })
    expect(parseAnikoto2ServerResponse({
      status: 200,
      result: { url: 'https://127.0.0.1/private' },
    }, server)).toBeNull()
  })

  it('builds canonical browser fallback URLs from prefixed IDs', () => {
    const id = parseAnikoto2SearchHtml(`
      <a class="item" href="/watch/black-torch-1d364"><span class="name">Black Torch</span></a>
    `)[0].id
    expect(getAnikoto2EpisodePageUrl(id, '1')).toBe('https://anikoto.cz/watch/black-torch-1d364/ep-1')
  })
})
