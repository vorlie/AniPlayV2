import type { DownloadRequest, DownloadResult, DownloadState } from './download-types'

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
  | { success: true; entries: number; generatedAt: string; tag: string; source: string }
  | { success: false; error: string }

interface DownloadsApi {
  getState(): Promise<DownloadState>
  start(request: DownloadRequest): Promise<DownloadResult>
  cancel(id: string): Promise<DownloadResult>
  retry(id: string): Promise<DownloadResult>
  clearFinished(): Promise<DownloadResult>
  chooseDirectory(): Promise<DownloadState>
  reveal(id: string): Promise<DownloadResult>
  onChanged(callback: (state: DownloadState) => void): () => void
}

interface AniPlayApi {
  search(query: string, translationType: 'sub' | 'dub'): Promise<IpcResponse<SearchResult[]>>
  getEpisodes(showId: string, translationType: 'sub' | 'dub'): Promise<IpcResponse<string[]>>
  getEpisodeLinks(showId: string, episode: string, translationType: 'sub' | 'dub'): Promise<IpcResponse<StreamLink[]>>
  getCiphermapInfo(): Promise<IpcResponse<CiphermapInfo | null>>
  syncCiphermap(): Promise<CiphermapSyncResponse>
  openProjectPage(page: 'repository' | 'issues' | 'pulls'): Promise<{ success: boolean }>
  downloads: DownloadsApi
}

declare global {
  interface Window {
    aniPlay?: AniPlayApi
  }
}

export {}
