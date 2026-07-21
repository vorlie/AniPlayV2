export const PROTOCOL_VERSION = 1
export const ROOM_CODE_LENGTH = 10
export const MAX_FRAME_BYTES = 8 * 1024
export const MAX_PARTICIPANTS = 12
export const MAX_CHAT_MESSAGES = 50
export const ROOM_HARD_TTL_MS = 12 * 60 * 60_000
export const ROOM_EMPTY_TTL_MS = 30 * 60_000
export const ROOM_CREATOR_TTL_MS = 2 * 60_000
export const HOST_GRACE_MS = 10_000

const ROOM_CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const ROOM_CODE_PATTERN = /^[0-9A-HJKMNP-TV-Z]{10}$/
const PROVIDERS = new Set(['allanime', 'anikoto', 'miruro', 'desu', 'docchi'])

export type Role = 'host' | 'guest'

export interface RoomContent {
  provider: string
  showId: string
  animeName: string
  episode: string
  translationType: 'sub' | 'dub'
  aniListMediaId?: number
}

export interface RoomPlayback {
  position: number
  paused: boolean
  revision: number
  duration?: number
  updatedAt: string
}

export interface ParticipantProfile {
  aniListId: number
  name: string
  avatar?: string | null
}

export interface Participant extends ParticipantProfile {
  id: string
  role: Role
  ready: boolean
  connected: boolean
  connectedAt: number
}

export interface ChatMessage {
  id: string
  authorId: string
  authorName: string
  body: string
  createdAt: string
}

export interface RoomState {
  code: string
  content: RoomContent
  playback: RoomPlayback
  chat: ChatMessage[]
  hostTokenHash: string | null
  hostConnectionId: string | null
  hostGraceUntil: number | null
  createdAt: number
  hardExpiresAt: number
  emptySince: number | null
  creatorExpiresAt: number | null
  everConnected: boolean
}

export interface ConnectionAttachment {
  connectionId: string
  authenticated: boolean
  profile: ParticipantProfile | null
  role: Role
  ready: boolean
  connectedAt: number
  chatTimestamps: number[]
  commandTimestamps: number[]
}

export type ClientMessage =
  | { type: 'hello'; version: number; participant: ParticipantProfile; hostToken?: string }
  | { type: 'chat'; body: string }
  | { type: 'playback-command'; payload: { position: number; paused: boolean; duration?: number } }
  | { type: 'content-change'; content: RoomContent }
  | { type: 'ready'; ready: boolean }
  | { type: 'leave' }
  | { type: 'ping' }

type JsonRecord = Record<string, unknown>

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function exactKeys(value: JsonRecord, allowed: readonly string[]): boolean {
  const keys = Object.keys(value)
  return keys.every((key) => allowed.includes(key))
}

function finiteNumber(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
}

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.replace(/\s+/gu, ' ').trim()
  return normalized && normalized.length <= max ? normalized : null
}

function safeAvatar(value: unknown): string | null | undefined {
  if (value === null || value === undefined) return null
  if (typeof value !== 'string' || value.length > 500) return undefined
  try {
    const url = new URL(value)
    return url.protocol === 'https:' ? url.toString() : undefined
  } catch {
    return undefined
  }
}

export function normalizeRoomCode(value: string): string | null {
  const code = value.trim().toUpperCase().replace(/[\s-]+/g, '')
  return ROOM_CODE_PATTERN.test(code) ? code : null
}

export function createRoomCode(random = crypto.getRandomValues(new Uint8Array(ROOM_CODE_LENGTH))): string {
  let result = ''
  for (const byte of random) result += ROOM_CODE_ALPHABET[byte % ROOM_CODE_ALPHABET.length]
  return result
}

export function createCapabilityToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return base64Url(bytes)
}

export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function constantTimeEqualHex(left: string, right: string): boolean {
  if (left.length !== right.length || left.length % 2 !== 0) return false
  const leftBytes = new Uint8Array(left.length / 2)
  const rightBytes = new Uint8Array(right.length / 2)
  for (let index = 0; index < left.length; index += 2) {
    leftBytes[index / 2] = Number.parseInt(left.slice(index, index + 2), 16)
    rightBytes[index / 2] = Number.parseInt(right.slice(index, index + 2), 16)
  }
  return crypto.subtle.timingSafeEqual(leftBytes, rightBytes)
}

function base64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

export function parseProfile(value: unknown): ParticipantProfile | null {
  if (!isRecord(value) || !exactKeys(value, ['aniListId', 'name', 'avatar'])) return null
  const name = cleanText(value.name, 80)
  const avatar = safeAvatar(value.avatar)
  const aniListId = value.aniListId
  if (!Number.isInteger(aniListId) || !finiteNumber(aniListId, 1, Number.MAX_SAFE_INTEGER) || !name || avatar === undefined) return null
  return { aniListId, name, avatar }
}

export function parseContent(value: unknown): RoomContent | null {
  if (!isRecord(value) || !exactKeys(value, ['provider', 'showId', 'animeName', 'episode', 'translationType', 'aniListMediaId'])) return null
  const provider = cleanText(value.provider, 32)
  const showId = cleanText(value.showId, 200)
  const animeName = cleanText(value.animeName, 200)
  const episode = cleanText(value.episode, 32)
  const mediaId = value.aniListMediaId
  if (!provider || !PROVIDERS.has(provider) || !showId || !animeName || !episode) return null
  if (value.translationType !== 'sub' && value.translationType !== 'dub') return null
  if (mediaId !== undefined && (!Number.isInteger(mediaId) || !finiteNumber(mediaId, 1, Number.MAX_SAFE_INTEGER))) return null
  return { provider, showId, animeName, episode, translationType: value.translationType, ...(mediaId === undefined ? {} : { aniListMediaId: mediaId }) }
}

export function parsePlayback(value: unknown, includeRevision = false): Omit<RoomPlayback, 'updatedAt'> | null {
  const keys = includeRevision ? ['position', 'paused', 'duration', 'revision'] : ['position', 'paused', 'duration']
  if (!isRecord(value) || !exactKeys(value, keys)) return null
  if (!finiteNumber(value.position, 0, 7 * 24 * 60 * 60) || typeof value.paused !== 'boolean') return null
  if (value.duration !== undefined && !finiteNumber(value.duration, 0, 7 * 24 * 60 * 60)) return null
  const revision = includeRevision && Number.isInteger(value.revision) && finiteNumber(value.revision, 0, Number.MAX_SAFE_INTEGER) ? value.revision : 0
  return { position: value.position, paused: value.paused, revision, ...(value.duration === undefined ? {} : { duration: value.duration }) }
}

export function parseClientMessage(value: unknown): ClientMessage | null {
  if (!isRecord(value) || typeof value.type !== 'string') return null
  switch (value.type) {
    case 'hello': {
      if (!exactKeys(value, ['type', 'version', 'participant', 'hostToken'])) return null
      const participant = parseProfile(value.participant)
      const version = value.version
      if (!participant || typeof version !== 'number' || !Number.isInteger(version)) return null
      if (value.hostToken !== undefined && (typeof value.hostToken !== 'string' || value.hostToken.length < 32 || value.hostToken.length > 128)) return null
      return { type: 'hello', version, participant, ...(typeof value.hostToken === 'string' ? { hostToken: value.hostToken } : {}) }
    }
    case 'chat': {
      if (!exactKeys(value, ['type', 'body'])) return null
      const body = cleanText(value.body, 500)
      return body ? { type: 'chat', body } : null
    }
    case 'playback-command': {
      if (!exactKeys(value, ['type', 'payload'])) return null
      const payload = parsePlayback(value.payload)
      return payload ? { type: 'playback-command', payload } : null
    }
    case 'content-change': {
      if (!exactKeys(value, ['type', 'content'])) return null
      const content = parseContent(value.content)
      return content ? { type: 'content-change', content } : null
    }
    case 'ready':
      return exactKeys(value, ['type', 'ready']) && typeof value.ready === 'boolean' ? { type: 'ready', ready: value.ready } : null
    case 'leave':
    case 'ping':
      return exactKeys(value, ['type']) ? { type: value.type } : null
    default:
      return null
  }
}

export function frameByteLength(value: string | ArrayBuffer): number {
  return typeof value === 'string' ? new TextEncoder().encode(value).byteLength : value.byteLength
}
