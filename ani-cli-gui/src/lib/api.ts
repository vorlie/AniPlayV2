export interface IpcResponse<T> {
  success: boolean
  data?: T
  error?: string
}

import type { AnimeSearchResult, CatalogProvider, TranslationType } from '../catalog-types'
export type { AnimeSearchResult, CatalogProvider, TranslationType } from '../catalog-types'

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

export const TRANSLATION_TYPE_KEY = 'playback.translationType'
export const CATALOG_PROVIDER_KEY = 'catalog.provider'
export const ANILIST_SEARCH_KEY = 'search.anilistFirst'
export const ADULT_CONTENT_OPT_IN_KEY = 'search.adultContentOptIn'
export const DOCCHI_ADULT_OPT_IN_KEY = 'search.docchiAdultOptIn'
export const DEFAULT_CATALOG_PROVIDER: CatalogProvider = 'anikoto'

export function getTranslationType(): TranslationType {
  return localStorage.getItem(TRANSLATION_TYPE_KEY) === 'dub' ? 'dub' : 'sub'
}

export function getCatalogProvider(): CatalogProvider {
  const provider = localStorage.getItem(CATALOG_PROVIDER_KEY)
  if (provider === 'miruro') {
    localStorage.setItem(CATALOG_PROVIDER_KEY, 'anidb')
    return 'anidb'
  }
  return provider === 'allanime' || provider === 'desu' || provider === 'docchi' || provider === 'anidb' || provider === 'anikoto' ? provider : DEFAULT_CATALOG_PROVIDER
}

export function getAniListFirstSearch(): boolean {
  return localStorage.getItem(ANILIST_SEARCH_KEY) === 'true'
}

export function getAdultContentOptIn(): boolean {
  const current = localStorage.getItem(ADULT_CONTENT_OPT_IN_KEY)
  if (current !== null) return current === 'true'
  const legacy = localStorage.getItem(DOCCHI_ADULT_OPT_IN_KEY) === 'true'
  if (legacy) localStorage.setItem(ADULT_CONTENT_OPT_IN_KEY, 'true')
  return legacy
}

export const getDocchiAdultOptIn = getAdultContentOptIn

export async function invokeSearch(query: string, catalogProvider: CatalogProvider = getCatalogProvider(), aniListFirstSearch: boolean = getAniListFirstSearch()): Promise<IpcResponse<AnimeSearchResult[]>> {
  if (window.aniPlay) return window.aniPlay.search(query, getTranslationType(), catalogProvider, aniListFirstSearch, (catalogProvider === 'docchi' || catalogProvider === 'anidb') && getAdultContentOptIn())
  throw new Error('AniPlay API is only available in the Electron application')
}

export async function invokeEpisodes(id: string, catalogProvider: CatalogProvider = DEFAULT_CATALOG_PROVIDER, translationType: TranslationType = getTranslationType()): Promise<IpcResponse<string[]>> {
  if (window.aniPlay) return window.aniPlay.getEpisodes(id, translationType, catalogProvider)
  throw new Error('AniPlay API is only available in the Electron application')
}

export async function invokeLinks(id: string, ep: string, translationType: TranslationType = getTranslationType(), catalogProvider: CatalogProvider = DEFAULT_CATALOG_PROVIDER): Promise<IpcResponse<StreamLink[]>> {
  if (window.aniPlay) return window.aniPlay.getEpisodeLinks(id, ep, translationType, catalogProvider)
  throw new Error('AniPlay API is only available in the Electron application')
}

export async function openProviderEpisode(id: string, ep: string, catalogProvider: CatalogProvider, translationType: TranslationType = getTranslationType()): Promise<IpcResponse<void>> {
  if (window.aniPlay) return window.aniPlay.openProviderEpisode(id, ep, catalogProvider, translationType)
  throw new Error('AniPlay API is only available in the Electron application')
}
