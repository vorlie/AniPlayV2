import { DurableObject } from 'cloudflare:workers'
import {
  HOST_GRACE_MS,
  MAX_CHAT_MESSAGES,
  MAX_FRAME_BYTES,
  MAX_PARTICIPANTS,
  PROTOCOL_VERSION,
  ROOM_CREATOR_TTL_MS,
  ROOM_EMPTY_TTL_MS,
  ROOM_HARD_TTL_MS,
  constantTimeEqualHex,
  createCapabilityToken,
  createRoomCode,
  frameByteLength,
  hashToken,
  normalizeRoomCode,
  parseClientMessage,
  parseContent,
  parsePlayback,
  type ConnectionAttachment,
  type Participant,
  type RoomContent,
  type RoomPlayback,
  type RoomState,
} from './protocol'

const ROOM_STORAGE_KEY = 'room'
const CHAT_RATE_WINDOW_MS = 10_000
const CHAT_RATE_LIMIT = 5
const COMMAND_RATE_WINDOW_MS = 1_000
const COMMAND_RATE_LIMIT = 4

interface RoomCreatePayload {
  content: RoomContent
  playback: Omit<RoomPlayback, 'updatedAt'>
}

function jsonError(status: number, code: string, message: string): Response {
  return Response.json({ error: message, code }, { status })
}

function clientIp(request: Request): string {
  return request.headers.get('CF-Connecting-IP') ?? 'unknown'
}

function initialAttachment(): ConnectionAttachment {
  return {
    connectionId: crypto.randomUUID(),
    authenticated: false,
    profile: null,
    role: 'guest',
    ready: false,
    connectedAt: Date.now(),
    chatTimestamps: [],
    commandTimestamps: [],
  }
}

function attachment(socket: WebSocket): ConnectionAttachment | null {
  const value = socket.deserializeAttachment()
  if (!value || typeof value !== 'object') return null
  return value as ConnectionAttachment
}

function participantsFromSockets(sockets: WebSocket[]): Participant[] {
  return sockets.flatMap((socket) => {
    const session = attachment(socket)
    if (!session?.authenticated || !session.profile) return []
    return [{
      id: session.connectionId,
      aniListId: session.profile.aniListId,
      name: session.profile.name,
      avatar: session.profile.avatar,
      role: session.role,
      ready: session.ready,
      connected: true,
      connectedAt: session.connectedAt,
    }]
  }).sort((left, right) => left.connectedAt - right.connectedAt)
}

function parseCreatePayload(value: unknown): RoomCreatePayload | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  if (Object.keys(record).some((key) => key !== 'content' && key !== 'playback')) return null
  const content = parseContent(record.content)
  const playback = parsePlayback(record.playback, true)
  return content && playback ? { content, playback } : null
}

async function readSmallJson(request: Request): Promise<unknown> {
  const declaredLength = Number(request.headers.get('content-length') ?? '0')
  if (declaredLength > MAX_FRAME_BYTES) throw new Error('PAYLOAD_TOO_LARGE')
  const body = await request.text()
  if (new TextEncoder().encode(body).byteLength > MAX_FRAME_BYTES) throw new Error('PAYLOAD_TOO_LARGE')
  return JSON.parse(body) as unknown
}

async function createRoom(env: Env, payload: RoomCreatePayload): Promise<{ code: string; hostToken: string }> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const code = createRoomCode()
    const hostToken = createCapabilityToken()
    const now = Date.now()
    const state: RoomState = {
      code,
      content: payload.content,
      playback: { ...payload.playback, updatedAt: new Date(now).toISOString() },
      chat: [],
      hostTokenHash: await hashToken(hostToken),
      hostConnectionId: null,
      hostGraceUntil: null,
      createdAt: now,
      hardExpiresAt: now + ROOM_HARD_TTL_MS,
      emptySince: now,
      creatorExpiresAt: now + ROOM_CREATOR_TTL_MS,
      everConnected: false,
    }
    const id = env.WATCH_TOGETHER_ROOMS.idFromName(code)
    const response = await env.WATCH_TOGETHER_ROOMS.get(id).fetch('https://room.internal/init', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(state),
    })
    if (response.ok) return { code, hostToken }
    if (response.status !== 409) throw new Error(`Room initialization failed (${response.status})`)
  }
  throw new Error('Could not allocate a unique room code')
}

export class WatchTogetherRoom extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)

    if (request.method === 'POST' && url.pathname === '/init') {
      if (await this.ctx.storage.get<RoomState>(ROOM_STORAGE_KEY)) return new Response(null, { status: 409 })
      const value = await request.json() as RoomState
      await this.ctx.storage.put(ROOM_STORAGE_KEY, value)
      await this.scheduleAlarm(value)
      return Response.json({ ok: true })
    }

    if (request.method === 'GET' && url.pathname.endsWith('/ws')) {
      if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return jsonError(426, 'UPGRADE_REQUIRED', 'A WebSocket upgrade is required')
      const room = await this.ctx.storage.get<RoomState>(ROOM_STORAGE_KEY)
      if (!room) return jsonError(404, 'ROOM_NOT_FOUND', 'The room does not exist or has expired')
      if (Date.now() >= room.hardExpiresAt) {
        await this.expireRoom('room expired')
        return jsonError(410, 'ROOM_EXPIRED', 'The room has expired')
      }
      if (this.ctx.getWebSockets().length >= MAX_PARTICIPANTS) return jsonError(429, 'ROOM_FULL', 'The room is full')

      const pair = new WebSocketPair()
      const [client, server] = Object.values(pair) as [WebSocket, WebSocket]
      this.ctx.acceptWebSocket(server)
      server.serializeAttachment(initialAttachment())
      return new Response(null, { status: 101, webSocket: client })
    }

    if (request.method === 'GET' && url.pathname === '/health') {
      return Response.json({ status: 'ok', connections: participantsFromSockets(this.ctx.getWebSockets()).length })
    }

    return jsonError(404, 'NOT_FOUND', 'Not found')
  }

  async webSocketMessage(socket: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    if (frameByteLength(raw) > MAX_FRAME_BYTES) {
      this.sendError(socket, 'FRAME_TOO_LARGE', 'Messages may not exceed 8 KiB')
      socket.close(1009, 'message too large')
      return
    }

    let decoded: unknown
    try {
      decoded = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw)) as unknown
    } catch {
      this.sendError(socket, 'INVALID_MESSAGE', 'The message payload is not valid JSON')
      return
    }
    const message = parseClientMessage(decoded)
    if (!message) {
      this.sendError(socket, 'INVALID_MESSAGE', 'The message payload is invalid')
      return
    }

    const room = await this.ctx.storage.get<RoomState>(ROOM_STORAGE_KEY)
    if (!room) {
      this.sendError(socket, 'ROOM_NOT_FOUND', 'The room does not exist or has expired')
      socket.close(4004, 'room expired')
      return
    }
    const session = attachment(socket)
    if (!session) {
      socket.close(1011, 'connection state missing')
      return
    }

    if (!session.authenticated) {
      if (message.type !== 'hello') {
        this.sendError(socket, 'HELLO_REQUIRED', 'The first message must be hello')
        socket.close(4001, 'hello required')
        return
      }
      await this.handleHello(socket, session, room, message)
      return
    }

    if (message.type === 'hello') {
      this.sendError(socket, 'ALREADY_JOINED', 'This connection has already joined')
      return
    }
    if (message.type === 'ping') {
      socket.send(JSON.stringify({ type: 'pong', serverTime: new Date().toISOString() }))
      return
    }
    if (message.type === 'leave') {
      socket.close(1000, 'left room')
      return
    }
    if (message.type === 'ready') {
      session.ready = message.ready
      socket.serializeAttachment(session)
      this.broadcast(room)
      return
    }
    if (message.type === 'chat') {
      if (!this.consumeRate(session, 'chatTimestamps', CHAT_RATE_LIMIT, CHAT_RATE_WINDOW_MS)) {
        this.sendError(socket, 'CHAT_RATE_LIMITED', 'Please wait before sending another message')
        return
      }
      socket.serializeAttachment(session)
      room.chat = [...room.chat, {
        id: crypto.randomUUID(),
        authorId: session.connectionId,
        authorName: session.profile?.name ?? 'Unknown',
        body: message.body,
        createdAt: new Date().toISOString(),
      }].slice(-MAX_CHAT_MESSAGES)
      await this.persist(room)
      this.broadcast(room)
      return
    }

    if (session.role !== 'host' || room.hostConnectionId !== session.connectionId) {
      this.sendError(socket, 'HOST_ONLY', 'Only the room host can control playback or content')
      return
    }
    if (!this.consumeRate(session, 'commandTimestamps', COMMAND_RATE_LIMIT, COMMAND_RATE_WINDOW_MS)) {
      this.sendError(socket, 'COMMAND_RATE_LIMITED', 'Playback commands are arriving too quickly')
      return
    }
    socket.serializeAttachment(session)

    if (message.type === 'playback-command') {
      room.playback = {
        ...message.payload,
        revision: room.playback.revision + 1,
        updatedAt: new Date().toISOString(),
      }
      await this.persist(room)
      this.broadcast(room)
      return
    }
    if (message.type === 'content-change') {
      room.content = message.content
      room.playback = {
        position: 0,
        paused: true,
        revision: room.playback.revision + 1,
        updatedAt: new Date().toISOString(),
      }
      for (const peer of this.ctx.getWebSockets()) {
        const peerSession = attachment(peer)
        if (!peerSession?.authenticated) continue
        peerSession.ready = peerSession.role === 'host'
        peer.serializeAttachment(peerSession)
      }
      await this.persist(room)
      this.broadcast(room)
    }
  }

  async webSocketClose(socket: WebSocket, code: number, reason: string): Promise<void> {
    const session = attachment(socket)
    const room = await this.ctx.storage.get<RoomState>(ROOM_STORAGE_KEY)
    if (!session?.authenticated || !room) return
    const now = Date.now()
    if (room.hostConnectionId === session.connectionId) {
      room.hostConnectionId = null
      room.hostGraceUntil = now + HOST_GRACE_MS
    }
    const remaining = participantsFromSockets(this.ctx.getWebSockets()).filter((participant) => participant.id !== session.connectionId)
    room.emptySince = remaining.length === 0 ? now : null
    await this.persist(room)
    this.broadcast(room)
    console.log(JSON.stringify({ event: 'watch_together_disconnect', code: room.code, socketCode: code, reason: reason.slice(0, 80) }))
  }

  async webSocketError(socket: WebSocket): Promise<void> {
    await this.webSocketClose(socket, 1011, 'websocket error')
  }

  async alarm(): Promise<void> {
    const room = await this.ctx.storage.get<RoomState>(ROOM_STORAGE_KEY)
    if (!room) return
    const now = Date.now()
    const participants = participantsFromSockets(this.ctx.getWebSockets())
    const expired = now >= room.hardExpiresAt
      || (!room.everConnected && room.creatorExpiresAt !== null && now >= room.creatorExpiresAt)
      || (participants.length === 0 && room.emptySince !== null && now >= room.emptySince + ROOM_EMPTY_TTL_MS)
    if (expired) {
      await this.expireRoom('room expired')
      return
    }

    if (!room.hostConnectionId && room.hostGraceUntil !== null && now >= room.hostGraceUntil) {
      const nextHost = this.ctx.getWebSockets()
        .map((socket) => ({ socket, session: attachment(socket) }))
        .filter((item): item is { socket: WebSocket; session: ConnectionAttachment } => Boolean(item.session?.authenticated))
        .sort((left, right) => left.session.connectedAt - right.session.connectedAt)[0]
      if (nextHost) {
        nextHost.session.role = 'host'
        nextHost.socket.serializeAttachment(nextHost.session)
        room.hostConnectionId = nextHost.session.connectionId
        room.hostTokenHash = null
      }
      room.hostGraceUntil = null
      await this.persist(room)
      this.broadcast(room)
      return
    }

    await this.scheduleAlarm(room)
  }

  private async handleHello(
    socket: WebSocket,
    session: ConnectionAttachment,
    room: RoomState,
    message: Extract<ReturnType<typeof parseClientMessage>, { type: 'hello' }>,
  ): Promise<void> {
    if (!message || message.version !== PROTOCOL_VERSION) {
      this.sendError(socket, 'INCOMPATIBLE_VERSION', 'This AniPlay version is not compatible with the room')
      socket.close(4002, 'incompatible protocol')
      return
    }
    const active = participantsFromSockets(this.ctx.getWebSockets()).filter((participant) => participant.id !== session.connectionId)
    if (active.length >= MAX_PARTICIPANTS) {
      this.sendError(socket, 'ROOM_FULL', 'The room is full')
      socket.close(4003, 'room full')
      return
    }

    let isHost = false
    if (message.hostToken && room.hostTokenHash) {
      const candidateHash = await hashToken(message.hostToken)
      isHost = constantTimeEqualHex(candidateHash, room.hostTokenHash)
    }
    if (message.hostToken && !isHost) {
      this.sendError(socket, 'INVALID_HOST_TOKEN', 'The host capability is invalid or has expired')
      socket.close(4003, 'invalid host capability')
      return
    }

    if (isHost) {
      for (const peer of this.ctx.getWebSockets()) {
        const peerSession = attachment(peer)
        if (peerSession?.connectionId === room.hostConnectionId && peerSession.connectionId !== session.connectionId) peer.close(4000, 'host reconnected')
      }
      room.hostConnectionId = session.connectionId
      room.hostGraceUntil = null
    }
    session.authenticated = true
    session.profile = message.participant
    session.role = isHost ? 'host' : 'guest'
    session.connectedAt = Date.now()
    session.ready = isHost
    socket.serializeAttachment(session)
    room.everConnected = true
    room.creatorExpiresAt = null
    room.emptySince = null
    await this.persist(room)
    this.broadcast(room)
  }

  private consumeRate(
    session: ConnectionAttachment,
    key: 'chatTimestamps' | 'commandTimestamps',
    limit: number,
    windowMs: number,
  ): boolean {
    const threshold = Date.now() - windowMs
    session[key] = session[key].filter((timestamp) => timestamp > threshold)
    if (session[key].length >= limit) return false
    session[key].push(Date.now())
    return true
  }

  private snapshot(room: RoomState, socket: WebSocket): object {
    const session = attachment(socket)
    return {
      type: 'snapshot',
      snapshot: {
        code: room.code,
        content: room.content,
        playback: room.playback,
        participants: participantsFromSockets(this.ctx.getWebSockets()),
        chat: room.chat,
        role: session?.role ?? 'guest',
        serverTime: new Date().toISOString(),
      },
    }
  }

  private broadcast(room: RoomState): void {
    for (const socket of this.ctx.getWebSockets()) {
      if (!attachment(socket)?.authenticated) continue
      try {
        socket.send(JSON.stringify(this.snapshot(room, socket)))
      } catch {
        // The close/error callback cleans up dead connections.
      }
    }
  }

  private sendError(socket: WebSocket, code: string, message: string): void {
    try {
      socket.send(JSON.stringify({ type: 'error', code, error: message }))
    } catch {
      // The connection is already gone.
    }
  }

  private async persist(room: RoomState): Promise<void> {
    await this.ctx.storage.put(ROOM_STORAGE_KEY, room)
    await this.scheduleAlarm(room)
  }

  private async scheduleAlarm(room: RoomState): Promise<void> {
    const candidates = [room.hardExpiresAt]
    if (!room.everConnected && room.creatorExpiresAt !== null) candidates.push(room.creatorExpiresAt)
    if (room.emptySince !== null) candidates.push(room.emptySince + ROOM_EMPTY_TTL_MS)
    if (room.hostGraceUntil !== null) candidates.push(room.hostGraceUntil)
    await this.ctx.storage.setAlarm(Math.min(...candidates))
  }

  private async expireRoom(reason: string): Promise<void> {
    for (const socket of this.ctx.getWebSockets()) socket.close(4004, reason)
    await this.ctx.storage.deleteAll()
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (request.method === 'GET' && url.pathname === '/health') {
      return Response.json({ status: 'ok', protocolVersion: PROTOCOL_VERSION })
    }

    if (request.method === 'POST' && url.pathname === '/v1/rooms') {
      const rate = await env.ROOM_CREATION_RATE_LIMIT.limit({ key: clientIp(request) })
      if (!rate.success) return jsonError(429, 'RATE_LIMITED', 'Too many rooms were created from this network')
      try {
        const payload = parseCreatePayload(await readSmallJson(request))
        if (!payload) return jsonError(400, 'INVALID_ROOM', 'The room content or playback state is invalid')
        return Response.json(await createRoom(env, payload), { status: 201 })
      } catch (error) {
        if (error instanceof Error && error.message === 'PAYLOAD_TOO_LARGE') return jsonError(413, 'PAYLOAD_TOO_LARGE', 'The request may not exceed 8 KiB')
        if (error instanceof SyntaxError) return jsonError(400, 'INVALID_JSON', 'The request body is not valid JSON')
        console.error(JSON.stringify({ event: 'watch_together_create_failed', error: error instanceof Error ? error.message : 'unknown' }))
        return jsonError(500, 'CREATE_FAILED', 'The room could not be created')
      }
    }

    const roomMatch = url.pathname.match(/^\/v1\/rooms\/([^/]+)\/ws$/)
    if (request.method === 'GET' && roomMatch) {
      const rate = await env.ROOM_JOIN_RATE_LIMIT.limit({ key: clientIp(request) })
      if (!rate.success) return jsonError(429, 'RATE_LIMITED', 'Too many room connections were opened from this network')
      const code = normalizeRoomCode(decodeURIComponent(roomMatch[1] ?? ''))
      if (!code) return jsonError(400, 'INVALID_CODE', 'The room code is invalid')
      const id = env.WATCH_TOGETHER_ROOMS.idFromName(code)
      return env.WATCH_TOGETHER_ROOMS.get(id).fetch(request)
    }

    return jsonError(404, 'NOT_FOUND', 'Not found')
  },
} satisfies ExportedHandler<Env>
