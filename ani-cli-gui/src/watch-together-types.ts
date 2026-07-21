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
  name: string
  avatar?: string | null
  role: WatchTogetherRole
  ready: boolean
  connected: boolean
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
  status: 'idle' | 'connecting' | 'connected' | 'error'
  endpoint: string
  error?: string | null
}

export interface WatchTogetherCreateInput {
  content: WatchTogetherContent
  playback?: WatchTogetherPlaybackState
  participantName: string
  participantAvatar?: string | null
  hostToken?: string
}

export interface WatchTogetherJoinInput {
  code: string
  participantName: string
  participantAvatar?: string | null
}
