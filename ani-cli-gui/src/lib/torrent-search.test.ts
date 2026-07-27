import { describe, expect, it } from 'vitest'
import { buildTorrentSearchQuery } from './torrent-search'

describe('torrent season search queries', () => {
  it('adds an explicit season when requested', () => {
    expect(buildTorrentSearchQuery('Dan Da Dan', '2')).toBe('Dan Da Dan Season 2')
  })

  it('does not duplicate an existing season marker', () => {
    expect(buildTorrentSearchQuery('Dan Da Dan Season 2', '2')).toBe('Dan Da Dan Season 2')
    expect(buildTorrentSearchQuery('Example S02', '2')).toBe('Example S02')
    expect(buildTorrentSearchQuery('Example 2nd Season', '2')).toBe('Example 2nd Season')
  })

  it('uses the original title when the season is empty or invalid', () => {
    expect(buildTorrentSearchQuery('Frieren', '')).toBe('Frieren')
    expect(buildTorrentSearchQuery('Frieren', '0')).toBe('Frieren')
  })
})
