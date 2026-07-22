import { describe, expect, it } from 'vitest'
import { correctedMegaPlayContentType, isMegaPlayMediaHost, isProviderOwnedFrameRequest, MEGAPLAY_MEDIA_URL_PATTERNS } from './media-headers'

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

  it('corrects mislabeled MegaPlay playlists and WebVTT tracks', () => {
    expect(correctedMegaPlayContentType('https://1oe.lostproject.club/anime/subtitles/eng.vtt', 'application/octet-stream')).toBe('text/vtt; charset=utf-8')
    expect(correctedMegaPlayContentType('https://megap.kotocdn.site/anime/master.m3u8', 'application/octet-stream')).toBe('application/vnd.apple.mpegurl')
    expect(correctedMegaPlayContentType('https://untrusted.example/subtitles/eng.vtt', 'application/octet-stream')).toBe('application/octet-stream')
  })

  it('preserves provider-owned iframe requests while allowing initial app embeds', () => {
    expect(isProviderOwnedFrameRequest('media', 'file:///opt/AniPlay/resources/app.asar/dist/index.html')).toBe(true)
    expect(isProviderOwnedFrameRequest('subFrame', 'file:///opt/AniPlay/resources/app.asar/dist/index.html')).toBe(false)
    expect(isProviderOwnedFrameRequest('subFrame', 'https://provider.example/player')).toBe(true)
    expect(isProviderOwnedFrameRequest('media')).toBe(false)
    expect(isProviderOwnedFrameRequest('subFrame', 'http://localhost:5173/', 'http://localhost:5173')).toBe(false)
  })
})
