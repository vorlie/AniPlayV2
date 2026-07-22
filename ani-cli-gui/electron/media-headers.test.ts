import { describe, expect, it } from 'vitest'
import { isMegaPlayMediaHost, MEGAPLAY_MEDIA_URL_PATTERNS } from './media-headers'

describe('MegaPlay media hosts', () => {
  it('recognizes player, subtitle, and native CDN hosts', () => {
    expect(isMegaPlayMediaHost('megaplay.buzz')).toBe(true)
    expect(isMegaPlayMediaHost('cdn.mewstream.buzz')).toBe(true)
    expect(isMegaPlayMediaHost('1oe.lostproject.club')).toBe(true)
    expect(isMegaPlayMediaHost('megap.kotocdn.site')).toBe(true)
  })

  it('does not accept lookalike hostnames', () => {
    expect(isMegaPlayMediaHost('megaplay.buzz.example.com')).toBe(false)
    expect(isMegaPlayMediaHost('notkotocdn.site.example')).toBe(false)
  })

  it('registers Electron URL patterns for KotoCDN', () => {
    expect(MEGAPLAY_MEDIA_URL_PATTERNS).toContain('*://kotocdn.site/*')
    expect(MEGAPLAY_MEDIA_URL_PATTERNS).toContain('*://*.kotocdn.site/*')
  })
})

