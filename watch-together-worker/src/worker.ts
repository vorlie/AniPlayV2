export interface Env {
  WATCH_TOGETHER_ROOMS: DurableObjectNamespace
}

const ROOM_CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const ROOM_CODE_LENGTH = 8
const MAX_CHAT_MESSAGES = 50
const MAX_PARTICIPANTS = 12

type Role = 'host' | 'guest'

interface RoomContent {
  provider: string
  showId: string
  animeName: string
  episode: string
  translationType: 'sub' | 'dub'
  aniListMediaId?: number
}

interface RoomPlayback {
  position: number
  paused: boolean
  revision: number
  duration?: number
}

interface ParticipantProfile {
  name: string
  avatar?: string | null
}

interface RoomState {
  code: string
  content: RoomContent | null
  playback: RoomPlayback | null
  participants: Array<{
    id: string
    name: string
    avatar?: string | null
    role: Role
    ready: boolean
    connected: boolean
  }>
  chat: Array<{
    id: string
    authorId: string
    authorName: string
    body: string
    createdAt: string
  }>
  hostTokenHash: string | null
  hostConnectionId: string | null
}

interface HelloMessage {
  type: 'hello'
  version: number
  participant: ParticipantProfile
  role?: Role
  hostToken?: string
}

interface ChatMessage {
  type: 'chat'
  body: string
}

interface PlaybackCommandMessage {
  type: 'playback-command'
  payload: RoomPlayback
}

interface ContentChangeMessage {
  type: 'content-change'
  content: RoomContent
}

interface ReadyMessage {
  type: 'ready'
  ready: boolean
}

interface LeaveMessage {
  type: 'leave'
}

type ClientMessage = HelloMessage | ChatMessage | PlaybackCommandMessage | ContentChangeMessage | ReadyMessage | LeaveMessage

function createCode(): string {
  let value = ''
  for (let index = 0; index < ROOM_CODE_LENGTH; index += 1) {
    value += ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)]
  }
  return value
}

async function hashToken(token: string): Promise<string> {
  const bytes = new TextEncoder().encode(token)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function sanitizeText(value: string, max = 500): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, max)
}

async function createRoom(env: Env, payload: { content: RoomContent; playback: RoomPlayback; participant: ParticipantProfile; hostToken?: string }): Promise<{ code: string; hostToken: string }> {
  const code = createCode()
  const hostToken = payload.hostToken ?? crypto.randomUUID()
  const id = env.WATCH_TOGETHER_ROOMS.idFromName(code)
  const stub = env.WATCH_TOGETHER_ROOMS.get(id)
  const roomPayload: RoomState = {
    code,
    content: payload.content,
    playback: payload.playback,
    participants: [],
    chat: [],
    hostTokenHash: await hashToken(hostToken),
    hostConnectionId: null,
  }
  await stub.fetch('https://room.internal/init', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(roomPayload),
  })
  return { code, hostToken }
}

export class WatchTogetherRoom implements DurableObject {
  private state: RoomState | null = null
  private sockets = new Map<string, WebSocket>()
  private readonly ctx: DurableObjectState

  constructor(state: DurableObjectState, env: Env) {
    this.ctx = state
    this.state = null
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname.endsWith('/ws') && request.headers.get('Upgrade') === 'websocket') {
      const pair = new WebSocketPair()
      const [client, server] = Object.values(pair) as [WebSocket, WebSocket]
      this.ctx.acceptWebSocket(server)
      server.addEventListener('message', (event) => {
        void this.handleSocketMessage(server, event.data)
      })
      server.addEventListener('close', () => {
        this.handleSocketClose(server)
      })
      return new Response(null, { status: 101, webSocket: client })
    }

    if (request.method === 'POST' && url.pathname === '/init') {
      const payload = await request.json() as RoomState
      this.state = payload
      return new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json' } })
    }

    if (request.method === 'GET' && url.pathname === '/health') {
      return Response.json({ status: 'ok', connectionCount: this.sockets.size })
    }

    return new Response('Not found', { status: 404 })
  }

  private async handleSocketMessage(socket: WebSocket, data: string | ArrayBuffer): Promise<void> {
    let message: ClientMessage
    try {
      const raw = typeof data === 'string' ? data : new TextDecoder().decode(data)
      message = JSON.parse(raw) as ClientMessage
    } catch {
      this.sendSnapshot(socket, { error: 'The message payload was invalid' })
      return
    }

    if (!this.state) {
      this.state = {
        code: '',
        content: null,
        playback: null,
        participants: [],
        chat: [],
        hostTokenHash: null,
        hostConnectionId: null,
      }
    }

    if (message.type === 'hello') {
      const participant = message.participant
      const role = message.role ?? 'guest'
      const connectionId = `conn-${crypto.randomUUID()}`
      const profile = {
        id: connectionId,
        name: sanitizeText(participant.name, 80),
        avatar: participant.avatar ?? null,
        role,
        ready: false,
        connected: true,
      }
      this.sockets.set(connectionId, socket)
      if (this.state.participants.length >= MAX_PARTICIPANTS && role === 'guest') {
        this.sendSnapshot(socket, { error: 'The room is full' })
        socket.close(1008, 'room full')
        return
      }
      this.state.participants = [...this.state.participants.filter((item) => item.id !== connectionId), profile]
      this.state.hostConnectionId = this.state.hostConnectionId ?? (role === 'host' ? connectionId : this.state.hostConnectionId)
      if (message.hostToken) {
        const hash = await hashToken(message.hostToken)
        this.state.hostTokenHash = hash
      }
      this.broadcastSnapshot()
      return
    }

    if (message.type === 'chat') {
      const participant = this.state.participants.find((item) => this.sockets.get(item.id) === socket) ?? this.state.participants[0]
      if (!participant) return
      const nextMessage = {
        id: crypto.randomUUID(),
        authorId: participant.id,
        authorName: participant.name,
        body: sanitizeText(message.body, 500),
        createdAt: new Date().toISOString(),
      }
      this.state.chat = [...this.state.chat, nextMessage].slice(-MAX_CHAT_MESSAGES)
      this.broadcastSnapshot()
      return
    }

    if (message.type === 'playback-command') {
      this.state.playback = { ...message.payload, revision: message.payload.revision + 1 }
      this.broadcastSnapshot()
      return
    }

    if (message.type === 'content-change') {
      this.state.content = message.content
      this.broadcastSnapshot()
      return
    }

    if (message.type === 'ready') {
      const participant = this.state.participants.find((item) => this.sockets.get(item.id) === socket)
      if (participant) {
        participant.ready = message.ready
        this.broadcastSnapshot()
      }
      return
    }

    if (message.type === 'leave') {
      const participant = this.state.participants.find((item) => this.sockets.get(item.id) === socket)
      if (participant) {
        this.state.participants = this.state.participants.filter((item) => item.id !== participant.id)
        this.sockets.delete(participant.id)
        this.broadcastSnapshot()
      }
      return
    }
  }

  private handleSocketClose(socket: WebSocket): void {
    const participant = this.state?.participants.find((item) => this.sockets.get(item.id) === socket)
    if (participant) {
      this.state = {
        ...this.state,
        participants: this.state.participants.filter((item) => item.id !== participant.id),
      }
      this.sockets.delete(participant.id)
      this.broadcastSnapshot()
    }
  }

  private sendSnapshot(socket: WebSocket, details?: { error?: string }): void {
    const snapshot = {
      type: 'snapshot',
      snapshot: {
        code: this.state?.code ?? '',
        content: this.state?.content ?? null,
        playback: this.state?.playback ?? null,
        participants: this.state?.participants ?? [],
        chat: this.state?.chat ?? [],
        role: this.state?.participants.find((item) => item.role === 'host') ? 'host' : 'guest',
      },
      error: details?.error,
    }
    socket.send(JSON.stringify(snapshot))
  }

  private broadcastSnapshot(): void {
    if (!this.state) return
    const payload = JSON.stringify({
      type: 'snapshot',
      snapshot: {
        code: this.state.code,
        content: this.state.content,
        playback: this.state.playback,
        participants: this.state.participants,
        chat: this.state.chat,
        role: this.state.participants.find((item) => item.role === 'host') ? 'host' : 'guest',
      },
    })
    for (const socket of this.sockets.values()) {
      socket.send(payload)
    }
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname === '/health') {
      return Response.json({ status: 'ok' })
    }

    if (request.method === 'POST' && url.pathname === '/v1/rooms') {
      try {
        const payload = await request.json() as { content: RoomContent; playback: RoomPlayback; participant?: ParticipantProfile; hostToken?: string }
        const room = await createRoom(env, {
          content: payload.content,
          playback: payload.playback,
          participant: payload.participant ?? { name: 'Host' },
          hostToken: payload.hostToken,
        })
        return Response.json(room)
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 400 })
      }
    }

    const roomMatch = url.pathname.match(/^\/v1\/rooms\/([^/]+)\/ws$/)
    if (roomMatch) {
      const roomId = roomMatch[1]
      const id = env.WATCH_TOGETHER_ROOMS.idFromName(roomId)
      const stub = env.WATCH_TOGETHER_ROOMS.get(id)
      return stub.fetch(request.url, request)
    }

    return new Response('Not found', { status: 404 })
  },
}
