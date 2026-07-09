import { EventEmitter } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildDiscordActivity, DiscordPresenceService, validCoverUrl, validatePlayback } from './discord-presence'

const playback = {
  animeName: 'Frieren: Beyond Journey’s End',
  episode: '12',
  translationType: 'sub' as const,
  currentTime: 300,
  duration: 1500,
  playing: true,
  aniListMediaId: 154587,
  coverUrl: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/example.jpg',
}

describe('Discord presence payload', () => {
  it('builds a watching activity with remaining time and AniList metadata', () => {
    const activity = buildDiscordActivity(playback, 1_000_000)
    expect(activity).toMatchObject({
      name: playback.animeName,
      type: 3,
      details: playback.animeName,
      state: 'Episode 12 · Subbed',
      timestamps: { end: 2_200_000 },
      assets: { large_image: playback.coverUrl, small_image: 'aniplay' },
      buttons: [{ label: 'View on AniList', url: 'https://anilist.co/anime/154587' }],
    })
  })

  it('freezes paused playback in text without a running timestamp', () => {
    const activity = buildDiscordActivity({ ...playback, playing: false, translationType: 'dub' })
    expect(activity.state).toBe('Paused · Episode 12 · 20:00 remaining')
    expect(activity.timestamps).toBeUndefined()
  })

  it('uses fallback artwork for missing, unsafe, or rejected covers', () => {
    expect(buildDiscordActivity({ ...playback, coverUrl: 'http://example.com/cover.jpg' }).assets.large_image).toBe('aniplay')
    expect(buildDiscordActivity(playback, Date.now(), true).assets.large_image).toBe('aniplay')
    expect(validCoverUrl('not a URL')).toBeUndefined()
  })

  it('truncates Discord text fields and handles unknown durations', () => {
    const activity = buildDiscordActivity({ ...playback, animeName: 'A'.repeat(200), duration: undefined })
    expect(activity.details.length).toBe(128)
    expect(activity.timestamps).toBeUndefined()
  })
})

describe('Discord playback validation', () => {
  it('normalizes valid input and drops unsafe covers', () => {
    expect(validatePlayback({ ...playback, coverUrl: 'file:///secret.jpg' }).coverUrl).toBeUndefined()
  })

  it('rejects malformed playback input', () => {
    expect(() => validatePlayback({ ...playback, currentTime: -1 })).toThrow('Invalid playback position')
    expect(() => validatePlayback({ ...playback, aniListMediaId: 1.5 })).toThrow('Invalid AniList media ID')
  })
})

class MockRpcClient extends EventEmitter {
  requests: Array<{ command: string; args: unknown }> = []
  loginError = false
  async login() {
    if (this.loginError) throw new Error('Discord is closed')
    queueMicrotask(() => this.emit('ready'))
  }
  async request(command: string, args: unknown) { this.requests.push({ command, args }) }
  async clearActivity() { this.requests.push({ command: 'CLEAR', args: undefined }) }
  async destroy() {}
}

const tempDirs: string[] = []
afterEach(() => {
  vi.useRealTimers()
  for (const directory of tempDirs.splice(0)) rmSync(directory, { recursive: true, force: true })
})

function serviceWith(client: MockRpcClient) {
  const directory = mkdtempSync(join(tmpdir(), 'aniplay-presence-'))
  tempDirs.push(directory)
  return new DiscordPresenceService(() => client, join(directory, 'settings.json'))
}

describe('DiscordPresenceService', () => {
  it('publishes queued playback after connecting and clears on disable', async () => {
    const client = new MockRpcClient()
    const service = serviceWith(client)
    service.setEnabled(true)
    service.update(playback)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(client.requests[0]?.command).toBe('SET_ACTIVITY')
    service.setEnabled(false)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(client.requests.some((request) => request.command === 'CLEAR')).toBe(true)
    await service.shutdown()
  })

  it('silently schedules reconnection when Discord is unavailable', async () => {
    vi.useFakeTimers()
    const client = new MockRpcClient(); client.loginError = true
    const service = serviceWith(client)
    expect(() => service.setEnabled(true)).not.toThrow()
    await vi.advanceTimersByTimeAsync(2_000)
    expect(service.getSettings()).toMatchObject({ enabled: true, connected: false })
    await service.shutdown()
  })
})
