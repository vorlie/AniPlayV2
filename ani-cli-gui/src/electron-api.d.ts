interface SearchResult {
  id: string
  name: string
  episodes: number
}

interface StreamLink {
  url: string
  resolution: string
  hls: boolean
  provider: string
}

interface CiphermapInfo {
  generatedAt: string
  entries: number
  source: string
  tag?: string | null
}

interface IpcResponse<T> {
  success: boolean
  data?: T
  error?: string
}

type CiphermapSyncResponse =
  | {
      success: true
      entries: number
      generatedAt: string
      tag: string
      source: string
    }
  | {
      success: false
      error: string
    }

interface AniPlayApi {
  search(query: string, translationType: 'sub' | 'dub'): Promise<IpcResponse<SearchResult[]>>
  getEpisodes(showId: string, translationType: 'sub' | 'dub'): Promise<IpcResponse<string[]>>
  getEpisodeLinks(showId: string, episode: string, translationType: 'sub' | 'dub'): Promise<IpcResponse<StreamLink[]>>
  getCiphermapInfo(): Promise<IpcResponse<CiphermapInfo | null>>
  syncCiphermap(): Promise<CiphermapSyncResponse>
  openProjectPage(page: 'repository' | 'issues' | 'pulls'): Promise<{ success: boolean }>
}

interface Window {
  aniPlay?: AniPlayApi
}
