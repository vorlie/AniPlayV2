import type { CatalogProvider } from './catalog-types'

export interface WatchSegmentInput {
  startedAt: number
  endedAt: number
  activeSeconds: number
  timezoneOffsetMinutes: number
  animeId: string
  animeName: string
  episode: string
  catalogProvider: CatalogProvider
  aniListMediaId?: number
  fromSeconds: number
  toSeconds: number
  durationSeconds?: number
  completed: boolean
}

export interface WatchSegment extends WatchSegmentInput {
  v: 1
  id: string
  kind: 'watch_segment'
  recordedAt: number
}

export interface ViewingSummary {
  segmentCount: number
  totalActiveSeconds: number
  maxSevenDaySeconds: number
  maxWeekendSeconds: number
  nightSeconds: number
  longestCompletionStreakDays: number
}

export const EMPTY_VIEWING_SUMMARY: ViewingSummary = {
  segmentCount: 0,
  totalActiveSeconds: 0,
  maxSevenDaySeconds: 0,
  maxWeekendSeconds: 0,
  nightSeconds: 0,
  longestCompletionStreakDays: 0,
}
