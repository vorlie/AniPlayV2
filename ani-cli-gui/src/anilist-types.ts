import type { AnimeSearchResult, CatalogProvider, TranslationType } from './catalog-types'

export type AniListStatus = 'CURRENT' | 'PLANNING' | 'COMPLETED' | 'PAUSED' | 'DROPPED' | 'REPEATING'

export interface AniListSession {
  authenticated: boolean
  configured: boolean
  user?: { id: number; name: string; avatar?: string }
  expiresAt?: number
}

export interface MediaListState {
  id: number
  status: AniListStatus
  progress: number
  score: number
  repeat: number
}

export interface AnimeSummary {
  id: number
  title: string
  titleEnglish?: string
  titleRomaji?: string
  synonyms: string[]
  coverUrl: string
  bannerUrl?: string
  accentColor: string
  format?: string
  seasonYear?: number
  episodes?: number
  averageScore?: number
  nextAiringEpisode?: { episode: number; airingAt: number }
  listState?: MediaListState
}

export interface AnimeDetails extends AnimeSummary {
  description: string
  genres: string[]
  status?: string
  season?: string
  relations: AnimeRelation[]
  recommendations: AnimeSummary[]
}

export interface AnimeRelation {
  relationType: string
  media: AnimeSummary
}

export interface AiringItem {
  media: AnimeSummary
  episode: number
  airingAt: number
}

export interface DashboardData {
  session: AniListSession
  trending: AnimeSummary[]
  seasonal: AnimeSummary[]
  recommendations: AnimeSummary[]
  airing: AiringItem[]
  current: AnimeSummary[]
  planning: AnimeSummary[]
  completed: AnimeSummary[]
  stale?: boolean
}

export interface AniListProfileStatGroup {
  label: string
  count: number
  meanScore?: number
  minutesWatched?: number
}

export interface AniListProfile {
  user: { id: number; name: string; avatar?: string; bannerImage?: string; about?: string }
  stats: {
    count: number
    episodesWatched: number
    minutesWatched: number
    meanScore: number
    statuses: AniListProfileStatGroup[]
    genres: AniListProfileStatGroup[]
  }
  favourites: AnimeSummary[]
}

export interface ListUpdateInput {
  mediaId: number
  status: AniListStatus
  progress?: number
  score?: number
  repeat?: number
}

export interface CatalogMapping {
  mediaId: number
  scraperId: string
  scraperName: string
  episodes: number
  catalogProvider: CatalogProvider
  translationType: TranslationType
  confirmedAt: number
}

export interface CatalogCandidate {
  anime: AnimeSearchResult
  confidence: number
  reasons: string[]
}

export interface CatalogResolution {
  mapping?: CatalogMapping
  candidates: CatalogCandidate[]
  autoMatched: boolean
}
