import type { TranslationType } from './catalog-types'

export interface DiscordPresenceSettings {
  enabled: boolean
  connected: boolean
}

export interface DiscordPlaybackPresence {
  animeName: string
  episode: string
  translationType: TranslationType
  currentTime: number
  duration?: number
  playing: boolean
  aniListMediaId?: number
  coverUrl?: string
}

export interface DiscordActivityPayload {
  name: string
  type: 3
  details: string
  state: string
  timestamps?: { end: number }
  assets: {
    large_image: string
    large_text: string
    small_image: string
    small_text: string
  }
  buttons?: Array<{ label: string; url: string }>
  instance: false
}
