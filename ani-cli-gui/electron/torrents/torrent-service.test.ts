import { describe, expect, it } from 'vitest'
import type { TorrentFileInfo } from '../../src/torrent-types'
import { chooseEpisodeFile, selectCacheEvictions } from './torrent-service'

function file(index: number, name: string, episode: string | null, sizeBytes: number): TorrentFileInfo {
  return { index, name, path: name, episode, sizeBytes, playableInternally: name.endsWith('.mp4') }
}

describe('torrent episode file selection', () => {
  it('returns exact episode matches in descending size order', () => {
    const matches = chooseEpisodeFile([
      file(0, 'Show - 06.mkv', '6', 900),
      file(1, 'Show - 06 extras.mp4', '6', 200),
      file(2, 'Show - 07.mkv', '7', 1_000),
    ], '6')
    expect(matches.map((entry) => entry.index)).toEqual([0, 1])
  })

  it('automatically chooses the only video in a torrent', () => {
    expect(chooseEpisodeFile([
      file(0, 'cover.jpg', null, 10),
      file(1, 'movie.mkv', null, 1_000),
    ], '1').map((entry) => entry.index)).toEqual([1])
  })

  it('offers ambiguous batch files by size and excludes unsupported files', () => {
    expect(chooseEpisodeFile([
      file(0, 'readme.txt', null, 1),
      file(1, 'Episode B.mp4', null, 800),
      file(2, 'Episode A.mkv', null, 1_200),
    ], '9').map((entry) => entry.index)).toEqual([2, 1])
  })
})

describe('torrent cache eviction', () => {
  it('removes the oldest entries only until the cache fits', () => {
    const entries = [
      { name: 'new', size: 40, modified: 30 },
      { name: 'old', size: 40, modified: 10 },
      { name: 'middle', size: 40, modified: 20 },
    ]
    expect(selectCacheEvictions(entries, 80).map((entry) => entry.name)).toEqual(['old'])
    expect(selectCacheEvictions(entries, 20).map((entry) => entry.name)).toEqual(['old', 'middle', 'new'])
    expect(entries.map((entry) => entry.name)).toEqual(['new', 'old', 'middle'])
  })
})
