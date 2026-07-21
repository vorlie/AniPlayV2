export type WatchTogetherRole = 'host' | 'guest'

export interface WatchTogetherContent {
  provider: string
  showId: string
  animeName: string
  episode: string
  translationType: 'sub' | 'dub'
  aniListMediaId?: number
}

export interface WatchTogetherPlaybackState {
  position: number
  paused: boolean
  duration?: number
  revision: number
  updatedAt?: string
}

export interface WatchTogetherParticipant {
  id: string
  aniListId: number
  name: string
  avatar?: string | null
  role: WatchTogetherRole
  ready: boolean
  connected: boolean
  connectedAt?: number
}

export interface WatchTogetherMessage {
  id: string
  authorId: string
  authorName: string
  body: string
  createdAt: string
}

export interface WatchTogetherState {
  code: string
  connected: boolean
  role: WatchTogetherRole
  content: WatchTogetherContent | null
  playback: WatchTogetherPlaybackState | null
  participants: WatchTogetherParticipant[]
  chat: WatchTogetherMessage[]
  status: 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error'
  endpoint: string
  serverTime?: string
  error?: string | null
  errorCode?: string | null
}

export interface WatchTogetherCreateInput {
  content: WatchTogetherContent
  playback?: WatchTogetherPlaybackState
}

export interface WatchTogetherJoinInput {
  code: string
}

export interface WatchTogetherIdentity {
  aniListId: number
  name: string
  avatar?: string | null
}

export interface WatchTogetherCreateContext {
  content: WatchTogetherContent
  playback: WatchTogetherPlaybackState
  controllable: boolean
}
