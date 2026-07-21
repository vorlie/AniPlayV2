import { describe, expect, it } from 'vitest'
import {
  ROOM_CODE_LENGTH,
  constantTimeEqualHex,
  createCapabilityToken,
  createRoomCode,
  hashToken,
  normalizeRoomCode,
  parseClientMessage,
  parseContent,
  parsePlayback,
} from './protocol'

const content = {
  provider: 'allanime',
  showId: 'show-1',
  animeName: 'Example',
  episode: '2',
  translationType: 'sub',
  aniListMediaId: 123,
} as const

describe('watch together protocol', () => {
  it('creates and normalizes Crockford room codes', () => {
    const code = createRoomCode(new Uint8Array(ROOM_CODE_LENGTH).fill(31))
    expect(code).toBe('ZZZZZZZZZZ')
    expect(normalizeRoomCode('zzzzz-zzzzz')).toBe(code)
    expect(normalizeRoomCode('contains-i')).toBeNull()
  })

  it('creates a 256-bit capability and compares only hashes', async () => {
    const token = createCapabilityToken()
    expect(token).toMatch(/^[\w-]{43}$/)
    const digest = await hashToken(token)
    expect(digest).toHaveLength(64)
    expect(constantTimeEqualHex(digest, await hashToken(token))).toBe(true)
    expect(constantTimeEqualHex(digest, await hashToken(`${token}x`))).toBe(false)
  })

  it('accepts only stable content identifiers', () => {
    expect(parseContent(content)).toEqual(content)
    expect(parseContent({ ...content, streamUrl: 'https://media.example/video.m3u8' })).toBeNull()
    expect(parseContent({ ...content, headers: { referer: 'secret' } })).toBeNull()
    expect(parseContent({ ...content, translationType: 'raw' })).toBeNull()
  })

  it('rejects malformed and unknown client fields', () => {
    expect(parseClientMessage({
      type: 'hello',
      version: 1,
      participant: { aniListId: 42, name: ' Alice ', avatar: 'https://img.example/a.png' },
    })).toMatchObject({ type: 'hello', participant: { aniListId: 42, name: 'Alice' } })
    expect(parseClientMessage({ type: 'ready', ready: true, admin: true })).toBeNull()
    expect(parseClientMessage({ type: 'chat', body: '   ' })).toBeNull()
  })

  it('bounds playback values and ignores client revisions for commands', () => {
    expect(parsePlayback({ position: 12.5, paused: false, duration: 24 })).toEqual({ position: 12.5, paused: false, duration: 24, revision: 0 })
    expect(parsePlayback({ position: -1, paused: false })).toBeNull()
    expect(parsePlayback({ position: 1, paused: false, revision: 999 })).toBeNull()
  })
})
