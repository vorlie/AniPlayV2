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

export async function invokeSearch(query: string): Promise<IpcResponse<AnimeSearchResult[]>> {
  if (window.aniPlay) return window.aniPlay.search(query)
  throw new Error('AniPlay API is only available in the Electron application')
}

export async function invokeEpisodes(id: string): Promise<IpcResponse<string[]>> {
  if (window.aniPlay) return window.aniPlay.getEpisodes(id)
  throw new Error('AniPlay API is only available in the Electron application')
}

export async function invokeLinks(id: string, ep: string): Promise<IpcResponse<StreamLink[]>> {
  if (window.aniPlay) return window.aniPlay.getEpisodeLinks(id, ep)
  throw new Error('AniPlay API is only available in the Electron application')
}
