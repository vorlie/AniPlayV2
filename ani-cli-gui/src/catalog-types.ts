export interface AnimeSearchResult {
  id: string
  name: string
  episodes: number
  aniListMediaId?: number
  coverUrl?: string
}

export type TranslationType = 'sub' | 'dub'
