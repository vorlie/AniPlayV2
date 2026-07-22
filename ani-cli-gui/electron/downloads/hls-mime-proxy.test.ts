import { describe, expect, it } from 'vitest'
import { correctedHlsContentType, findWrappedMpegTsOffset, rewriteHlsPlaylist } from './hls-mime-proxy'

describe('HLS MIME relay helpers', () => {
  it('rewrites variant, segment, key, and subtitle URLs through the relay', () => {
    const registered: { url: string; kind: string }[] = []
    const rewritten = rewriteHlsPlaylist([
      '#EXTM3U',
      '#EXT-X-MEDIA:TYPE=SUBTITLES,URI="subs/en.m3u8"',
      '#EXT-X-KEY:METHOD=AES-128,URI="key.bin"',
      '#EXT-X-STREAM-INF:BANDWIDTH=1000',
      'video/index.m3u8',
      '#EXTINF:5,',
      'segment/1',
    ].join('\n'), 'https://media.example/root/master.m3u8', (url, kind) => {
      registered.push({ url, kind })
      return `http://127.0.0.1/item/${registered.length}`
    })

    expect(rewritten).toContain('URI="http://127.0.0.1/item/1"')
    expect(rewritten).toContain('URI="http://127.0.0.1/item/2"')
    expect(rewritten).toContain('http://127.0.0.1/item/3')
    expect(rewritten).toContain('http://127.0.0.1/item/4')
    expect(registered).toEqual([
      { url: 'https://media.example/root/subs/en.m3u8', kind: 'playlist' },
      { url: 'https://media.example/root/key.bin', kind: 'resource' },
      { url: 'https://media.example/root/video/index.m3u8', kind: 'playlist' },
      { url: 'https://media.example/root/segment/1', kind: 'segment' },
    ])
  })

  it('corrects disguised transport stream MIME types without changing known fMP4 resources', () => {
    expect(correctedHlsContentType('segment', 'image/png', 'https://cdn.example/segment/token')).toBe('video/mp2t')
    expect(correctedHlsContentType('segment', 'application/octet-stream', 'https://cdn.example/video/part.m4s')).toBe('video/mp4')
    expect(correctedHlsContentType('resource', 'application/octet-stream', 'https://cdn.example/key')).toBe('application/octet-stream')
  })

  it('finds a transport stream appended to a PNG wrapper', () => {
    const wrapper = Buffer.from('89504e470d0a1a0a0000000d494844520000000100000001', 'hex')
    const transportStream = Buffer.alloc(188 * 3)
    transportStream[0] = 0x47
    transportStream[188] = 0x47
    transportStream[376] = 0x47

    expect(findWrappedMpegTsOffset(Buffer.concat([wrapper, transportStream]))).toBe(wrapper.length)
    expect(findWrappedMpegTsOffset(transportStream)).toBeNull()
  })

  it('rejects non-HTTPS playlist resources', () => {
    expect(() => rewriteHlsPlaylist('#EXTM3U\nhttp://media.example/segment', 'https://media.example/master.m3u8', () => 'unused'))
      .toThrow(/unsupported resource URL/)
  })
})
