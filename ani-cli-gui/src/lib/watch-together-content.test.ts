import { describe, expect, it } from 'vitest'
import { buildWatchTogetherContent, hasControllableWatchTogetherSource, shouldWarnAboutUncontrollableAnikotoSource } from './watch-together-content'

describe('watch together content', () => {
  it('distinguishes controllable native streams from embed-only Anikoto playback', () => {
    expect(hasControllableWatchTogetherSource([{ embed: true }, { embed: false }])).toBe(true)
    expect(hasControllableWatchTogetherSource([{ embed: true }])).toBe(false)
    expect(shouldWarnAboutUncontrollableAnikotoSource('anikoto', [{ embed: true }])).toBe(true)
    expect(shouldWarnAboutUncontrollableAnikotoSource('allanime', [{ embed: true }])).toBe(false)
  })

  it('contains only stable content identifiers', () => {
    const content = buildWatchTogetherContent({
      id: 'anikoto:demo',
      name: 'Test Anime',
      episodes: 12,
      catalogProvider: 'anikoto',
    }, '3', 'sub')

    expect(content.provider).toBe('anikoto')
    expect(content).not.toHaveProperty('streamUrl')
    expect(content).not.toHaveProperty('headers')
  })

  it('keeps the payload unchanged for providers that do not expose a stream URL', () => {
    const content = buildWatchTogetherContent({
      id: 'allanime:demo',
      name: 'Other Anime',
      episodes: 24,
      catalogProvider: 'allanime',
    }, '1', 'dub')

    expect(content.provider).toBe('allanime')
    expect(Object.keys(content)).toEqual(['provider', 'showId', 'animeName', 'episode', 'translationType', 'aniListMediaId'])
  })
})
