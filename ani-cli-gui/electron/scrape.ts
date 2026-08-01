import { getDesuEpisodeLinks, getDesuEpisodes, searchDesu } from './providers/desu'
import { getDocchiEpisodeLinks, getDocchiEpisodes, searchDocchi } from './providers/docchi'
import { getAniDbEpisodeLinks, getAniDbEpisodes, searchAniDb } from './providers/anidb'
import { getAnikotoEpisodeLinks, getAnikotoEpisodes, searchAnikoto } from './providers/anikoto'
import { getAnikoto2EpisodeLinks, getAnikoto2Episodes, searchAnikoto2 } from './providers/anikoto2'
import type { CatalogProvider } from '../src/catalog-types'

export interface StreamLink {
  url: string
  resolution: string
  hls: boolean
  provider: string
  downloadable: boolean
  subtitles?: { label: string; url: string }[]
  embed?: boolean
  requestHeaders?: Record<string, string>
}

export type TranslationType = 'sub' | 'dub'

export interface SearchResult {
  id: string
  name: string
  episodes: number
  aniListMediaId?: number
  coverUrl?: string
  catalogProvider: CatalogProvider
}

export async function searchAnime(query: string, _mode: TranslationType, catalogProvider: CatalogProvider = 'anikoto', aniListFirstSearch = false, includeAdult = false): Promise<SearchResult[]> {
  if (catalogProvider === 'desu') return searchDesu(query)
  if (catalogProvider === 'docchi') return searchDocchi(query, includeAdult)
  if (catalogProvider === 'anidb') return searchAniDb(query, includeAdult)
  if (catalogProvider === 'anikoto') return searchAnikoto(query, aniListFirstSearch)
  if (catalogProvider === 'anikoto2') return searchAnikoto2(query)
  throw new Error(`Catalog provider is no longer supported: ${String(catalogProvider)}`)
}

export async function getEpisodes(showId: string, mode: TranslationType, catalogProvider: CatalogProvider = 'anikoto'): Promise<string[]> {
  if (catalogProvider === 'desu') return getDesuEpisodes(showId)
  if (catalogProvider === 'docchi') return getDocchiEpisodes(showId)
  if (catalogProvider === 'anidb') return getAniDbEpisodes(showId)
  if (catalogProvider === 'anikoto') return getAnikotoEpisodes(showId)
  if (catalogProvider === 'anikoto2') return getAnikoto2Episodes(showId, mode)
  throw new Error(`Catalog provider is no longer supported: ${String(catalogProvider)}`)
}

export async function getEpisodeLinks(showId: string, epNo: string, mode: TranslationType, catalogProvider: CatalogProvider = 'anikoto'): Promise<StreamLink[]> {
  if (catalogProvider === 'desu') return getDesuEpisodeLinks(showId, epNo)
  if (catalogProvider === 'docchi') return getDocchiEpisodeLinks(showId, epNo)
  if (catalogProvider === 'anidb') return getAniDbEpisodeLinks(showId, epNo, mode)
  if (catalogProvider === 'anikoto') return getAnikotoEpisodeLinks(showId, epNo, mode)
  if (catalogProvider === 'anikoto2') return getAnikoto2EpisodeLinks(showId, epNo, mode)
  throw new Error(`Catalog provider is no longer supported: ${String(catalogProvider)}`)
}