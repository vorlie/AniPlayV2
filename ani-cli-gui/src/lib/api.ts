export interface IpcResponse<T> {
  success: boolean
  data?: T
  error?: string
}

export interface AnimeSearchResult {
  id: string
  name: string
  episodes: number
}

export interface StreamLink {
  url: string
  resolution: string
  hls: boolean
  provider: string
}

export type TranslationType = 'sub' | 'dub'

export const TRANSLATION_TYPE_KEY = 'playback.translationType'

export function getTranslationType(): TranslationType {
  return localStorage.getItem(TRANSLATION_TYPE_KEY) === 'dub' ? 'dub' : 'sub'
}

export async function invokeSearch(query: string): Promise<IpcResponse<AnimeSearchResult[]>> {
  if (window.aniPlay) return window.aniPlay.search(query, getTranslationType())
  throw new Error('AniPlay API is only available in the Electron application')
}

export async function invokeEpisodes(id: string): Promise<IpcResponse<string[]>> {
  if (window.aniPlay) return window.aniPlay.getEpisodes(id, getTranslationType())
  throw new Error('AniPlay API is only available in the Electron application')
}

export async function invokeLinks(id: string, ep: string, translationType: TranslationType = getTranslationType()): Promise<IpcResponse<StreamLink[]>> {
  if (window.aniPlay) return window.aniPlay.getEpisodeLinks(id, ep, translationType)
  throw new Error('AniPlay API is only available in the Electron application')
}
