import { exports } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'

interface CreatedRoom { code: string; hostToken: string }

interface SocketMessage {
  type: string
  code?: string
  error?: string
  snapshot?: { role: string; playback: { revision: number } }
}

function nextMessage(socket: WebSocket): Promise<SocketMessage> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timed out waiting for WebSocket message')), 2_000)
    socket.addEventListener('message', (event) => {
      clearTimeout(timeout)
      resolve(JSON.parse(String(event.data)) as SocketMessage)
    }, { once: true })
  })
}

async function connect(code: string, participant: { aniListId: number; name: string }, hostToken?: string): Promise<WebSocket> {
  const response = await exports.default.fetch(`https://watch.example/v1/rooms/${code}/ws`, { headers: { Upgrade: 'websocket' } })
  expect(response.status).toBe(101)
  const socket = response.webSocket
  expect(socket).not.toBeNull()
  socket!.accept()
  socket!.send(JSON.stringify({ type: 'hello', version: 1, participant, ...(hostToken ? { hostToken } : {}) }))
  return socket!
}

describe('Watch Together room', () => {
  it('creates a room and enforces host-only playback commands', async () => {
    const createResponse = await exports.default.fetch('https://watch.example/v1/rooms', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'CF-Connecting-IP': '192.0.2.1' },
      body: JSON.stringify({
        content: { provider: 'allanime', showId: 'show', animeName: 'Example', episode: '1', translationType: 'sub', aniListMediaId: 1 },
        playback: { position: 0, paused: true, revision: 0 },
      }),
    })
    expect(createResponse.status).toBe(201)
    const room = await createResponse.json() as CreatedRoom
    expect(room.code).toMatch(/^[0-9A-HJKMNP-TV-Z]{10}$/)
    expect(room.hostToken).toHaveLength(43)

    const host = await connect(room.code, { aniListId: 1, name: 'Host' }, room.hostToken)
    const hostInitial = await nextMessage(host)
    expect(hostInitial).toMatchObject({ type: 'snapshot', snapshot: { role: 'host' } })
    const guest = await connect(room.code, { aniListId: 2, name: 'Guest' })
    expect((await nextMessage(guest)).snapshot?.role).toBe('guest')

    const guestError = nextMessage(guest)
    guest.send(JSON.stringify({ type: 'playback-command', payload: { position: 20, paused: false } }))
    expect(await guestError).toMatchObject({ type: 'error', code: 'HOST_ONLY' })

    const hostUpdate = nextMessage(host)
    const guestUpdate = nextMessage(guest)
    host.send(JSON.stringify({ type: 'playback-command', payload: { position: 20, paused: false } }))
    expect((await hostUpdate).snapshot?.playback.revision).toBe(1)
    expect((await guestUpdate).snapshot?.playback.revision).toBe(1)
    host.close(1000, 'test complete')
    guest.close(1000, 'test complete')
  })

  it('rejects provider URLs in room state', async () => {
    const response = await exports.default.fetch('https://watch.example/v1/rooms', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'CF-Connecting-IP': '192.0.2.2' },
      body: JSON.stringify({
        content: { provider: 'allanime', showId: 'show', animeName: 'Example', episode: '1', translationType: 'sub', streamUrl: 'https://media.example/video.m3u8' },
        playback: { position: 0, paused: true, revision: 0 },
      }),
    })
    expect(response.status).toBe(400)
  })
})
