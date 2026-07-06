import type { DownloadRequest, DownloadResult, DownloadState } from './download-types'
import type { AnimeDetails, AnimeSummary, AniListSession, CatalogMapping, CatalogResolution, DashboardData, ListUpdateInput, MediaListState } from './anilist-types'
import type { CatalogProvider, TranslationType } from './catalog-types'
import type { DiscordPlaybackPresence, DiscordPresenceSettings } from './discord-presence-types'

interface SearchResult {
  id: string
  name: string
  episodes: number
  catalogProvider: CatalogProvider
}

interface StreamLink {
  url: string
  resolution: string
  hls: boolean
  provider: string
  downloadable: boolean
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
  search(query: string, translationType: TranslationType, catalogProvider: CatalogProvider): Promise<IpcResponse<SearchResult[]>>
  getEpisodes(showId: string, translationType: TranslationType, catalogProvider: CatalogProvider): Promise<IpcResponse<string[]>>
  getEpisodeLinks(showId: string, episode: string, translationType: TranslationType, catalogProvider: CatalogProvider): Promise<IpcResponse<StreamLink[]>>
  openProviderEpisode(showId: string, episode: string, catalogProvider: CatalogProvider): Promise<IpcResponse<void>>
  getCiphermapInfo(): Promise<IpcResponse<CiphermapInfo | null>>
  syncCiphermap(): Promise<CiphermapSyncResponse>
  openProjectPage(page: 'repository' | 'issues' | 'pulls'): Promise<{ success: boolean }>
  aniList: {
    auth: { status(): Promise<AniListSession>; start(): Promise<AniListSession>; logout(): Promise<AniListSession> }
    dashboard: { get(): Promise<DashboardData> }
    media: { get(id: number): Promise<AnimeDetails> }
    list: { update(input: ListUpdateInput): Promise<MediaListState>; delete(id: number): Promise<boolean> }
    mapping: {
      resolve(media: AnimeSummary, candidates: SearchResult[], translationType: TranslationType): Promise<CatalogResolution>
      confirm(mediaId: number, anime: SearchResult, translationType: TranslationType): Promise<CatalogMapping>
      forget(mediaId: number): Promise<boolean>
      enrich(anime: SearchResult, translationType: TranslationType): Promise<AnimeSummary | null>
    }
  }
  discordPresence: {
    getSettings(): Promise<DiscordPresenceSettings>
    setEnabled(enabled: boolean): Promise<DiscordPresenceSettings>
    update(playback: DiscordPlaybackPresence): Promise<DiscordPresenceSettings>
    clear(): Promise<void>
  }
  downloads: DownloadsApi
}

declare global {
  interface Window {
    aniPlay?: AniPlayApi
  }
}

export {}
