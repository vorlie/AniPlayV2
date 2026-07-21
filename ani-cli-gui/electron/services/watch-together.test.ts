import { describe, expect, it } from 'vitest'
import {
  normalizeWatchTogetherCode,
  parseWatchTogetherServerMessage,
  resolveWatchTogetherEndpoint,
} from './watch-together'

const snapshot = {
  type: 'snapshot',
  snapshot: {
    code: '0123456789',
    content: {
      provider: 'allanime',
      showId: 'show-id',
      animeName: 'Example',
      episode: '1',
      translationType: 'sub',
      aniListMediaId: 1,
    },
    playback: { position: 12, paused: false, revision: 3, updatedAt: '2026-07-21T12:00:00.000Z' },
    participants: [{ id: 'connection', aniListId: 42, name: 'Alice', role: 'host', ready: true, connected: true, connectedAt: 1 }],
    chat: [],
    role: 'host',
    serverTime: '2026-07-21T12:00:01.000Z',
  },
}

describe('WatchTogetherService protocol helpers', () => {
  it('normalizes valid room codes and rejects ambiguous characters', () => {
    expect(normalizeWatchTogetherCode('01234-56789')).toBe('0123456789')
    expect(() => normalizeWatchTogetherCode('IIIIIIIIII')).toThrow(/Crockford/)
  })

  it('allows HTTPS and local development HTTP endpoints only', () => {
    expect(resolveWatchTogetherEndpoint('https://watch.example/')).toBe('https://watch.example')
    expect(resolveWatchTogetherEndpoint('http://localhost:8787')).toBe('http://localhost:8787')
    expect(() => resolveWatchTogetherEndpoint('http://watch.example')).toThrow(/HTTPS/)
    expect(() => resolveWatchTogetherEndpoint('https://user:pass@watch.example')).toThrow(/invalid/)
  })

  it('validates authoritative snapshots', () => {
    expect(parseWatchTogetherServerMessage(Buffer.from(JSON.stringify(snapshot)))).toMatchObject({
      type: 'snapshot', snapshot: { role: 'host', content: { showId: 'show-id' } },
    })
  })

  it('rejects media URLs and malformed participant identities', () => {
    const withMediaUrl = structuredClone(snapshot)
    Object.assign(withMediaUrl.snapshot.content, { streamUrl: 'https://media.example/video.m3u8' })
    expect(parseWatchTogetherServerMessage(Buffer.from(JSON.stringify(withMediaUrl)))).toBeNull()

    const withoutAniList = structuredClone(snapshot)
    delete (withoutAniList.snapshot.participants[0] as Partial<(typeof snapshot.snapshot.participants)[number]>).aniListId
    expect(parseWatchTogetherServerMessage(Buffer.from(JSON.stringify(withoutAniList)))).toBeNull()
  })
})
