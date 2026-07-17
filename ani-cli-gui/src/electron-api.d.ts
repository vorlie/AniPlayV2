import type { DownloadRequest, DownloadResult, DownloadState } from './download-types'
import type { AnimeDetails, AnimeSummary, AniListProfile, AniListSession, CatalogMapping, CatalogResolution, DashboardData, ListUpdateInput, MediaListState } from './anilist-types'
import type { CatalogProvider, TranslationType } from './catalog-types'
import type { DiscordPlaybackPresence, DiscordPresenceSettings } from './discord-presence-types'
import type { UpdateState } from './updater-types'
import type { RemoteNoticeState } from './remote-notice-types'
import type { AdBlockSettings, AdBlockState } from './adblock-types'
import type { ProfileSharePayload } from './profile-share-types'
import type { WatchSegmentInput, ViewingSummary } from './viewing-types'
import type { AllAnimeDebugInfo } from './scraper-types'

interface SearchResult {
  id: string
  name: string
  episodes: number
  aniListMediaId?: number
  coverUrl?: string
  catalogProvider: CatalogProvider
}

interface StreamLink {
  url: string
  resolution: string
  hls: boolean
  provider: string
  downloadable: boolean
  subtitles?: { label: string; url: string }[]
  embed?: boolean
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

interface GraphicsSettings {
  safeGraphicsMode: boolean
  active: boolean
  restartRequired: boolean
  launchOverride: boolean
}

interface AniPlayApi {
  search(query: string, translationType: TranslationType, catalogProvider: CatalogProvider, aniListFirstSearch?: boolean, includeAdultDocchi?: boolean): Promise<IpcResponse<SearchResult[]>>
  getEpisodes(showId: string, translationType: TranslationType, catalogProvider: CatalogProvider): Promise<IpcResponse<string[]>>
  getEpisodeLinks(showId: string, episode: string, translationType: TranslationType, catalogProvider: CatalogProvider): Promise<IpcResponse<StreamLink[]>>
  openProviderEpisode(showId: string, episode: string, catalogProvider: CatalogProvider, translationType?: TranslationType): Promise<IpcResponse<void>>
  getCiphermapInfo(): Promise<IpcResponse<CiphermapInfo | null>>
  getAllAnimeDebugInfo(refresh?: boolean): Promise<AllAnimeDebugInfo>
  exportAllAnimeDebugInfo(): Promise<{ saved: boolean }>
  syncCiphermap(): Promise<CiphermapSyncResponse>
  openProjectPage(page: 'repository' | 'issues' | 'pulls' | 'discord'): Promise<{ success: boolean }>
  aniList: {
    auth: { status(): Promise<AniListSession>; start(): Promise<AniListSession>; logout(): Promise<AniListSession> }
    dashboard: { get(): Promise<DashboardData> }
    profile: { get(): Promise<AniListProfile>; export(payload: ProfileSharePayload): Promise<{ saved: boolean }> }
    media: { get(id: number): Promise<AnimeDetails> }
    list: { update(input: ListUpdateInput): Promise<MediaListState>; delete(id: number): Promise<boolean> }
    mapping: {
      resolve(media: AnimeSummary, candidates: SearchResult[], translationType: TranslationType): Promise<CatalogResolution>
      confirm(mediaId: number, anime: SearchResult, translationType: TranslationType): Promise<CatalogMapping>
      forget(mediaId: number): Promise<boolean>
      enrich(anime: SearchResult, translationType: TranslationType): Promise<AnimeSummary | null>
    }
  }
  viewing: {
    getSummary(): Promise<ViewingSummary>
    append(segment: WatchSegmentInput): Promise<ViewingSummary>
  }
  discordPresence: {
    getSettings(): Promise<DiscordPresenceSettings>
    setEnabled(enabled: boolean): Promise<DiscordPresenceSettings>
    update(playback: DiscordPlaybackPresence): Promise<DiscordPresenceSettings>
    clear(): Promise<void>
  }
  graphics: {
    getSettings(): Promise<GraphicsSettings>
    setSafeMode(enabled: boolean): Promise<GraphicsSettings>
  }
  adBlock: {
    getState(): Promise<AdBlockState>
    setSettings(settings: Partial<AdBlockSettings>): Promise<AdBlockState>
  }
  updater: {
    getState(): Promise<UpdateState>
    check(): Promise<UpdateState>
    download(): Promise<UpdateState>
    install(): Promise<void>
    onChanged(callback: (state: UpdateState) => void): () => void
  }
  notices: {
    getState(): Promise<RemoteNoticeState>
    refresh(): Promise<RemoteNoticeState>
    dismiss(id: string): Promise<RemoteNoticeState>
    open(id: string): Promise<boolean>
    onChanged(callback: (state: RemoteNoticeState) => void): () => void
  }
  downloads: DownloadsApi
}

declare global {
  interface Window {
    aniPlay?: AniPlayApi
  }
}

export {}
