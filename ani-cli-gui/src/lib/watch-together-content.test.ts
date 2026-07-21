import { describe, expect, it } from 'vitest'
import { buildWatchTogetherContent } from './watch-together-content'

describe('watch together content', () => {
  it('preserves an Anikoto embed URL in the room content payload', () => {
    const content = buildWatchTogetherContent({
      id: 'anikoto:demo',
      name: 'Test Anime',
      episodes: 12,
      catalogProvider: 'anikoto',
    }, '3', 'sub', 'https://mega.example/embed/123')

    expect(content.provider).toBe('anikoto')
    expect(content.streamUrl).toBe('https://mega.example/embed/123')
    expect(content.streamKind).toBe('embed')
  })

  it('keeps the payload unchanged for providers that do not expose a stream URL', () => {
    const content = buildWatchTogetherContent({
      id: 'allanime:demo',
      name: 'Other Anime',
      episodes: 24,
      catalogProvider: 'allanime',
    }, '1', 'dub')

    expect(content.provider).toBe('allanime')
    expect(content.streamUrl).toBeUndefined()
    expect(content.streamKind).toBeUndefined()
  })
})
