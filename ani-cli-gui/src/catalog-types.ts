export interface AnimeSearchResult {
  id: string
  name: string
  episodes: number
  aniListMediaId?: number
  coverUrl?: string
  catalogProvider: CatalogProvider
}

export type TranslationType = 'sub' | 'dub'
export type CatalogProvider = 'desu' | 'docchi' | 'anidb' | 'anikoto' | 'anikoto2'
