import { contextBridge, ipcRenderer } from 'electron'
import type { DownloadRequest, DownloadState } from '../src/download-types'
import type { AnimeSummary, CatalogMapping, ListUpdateInput } from '../src/anilist-types'
import type { AnimeSearchResult, CatalogProvider, TranslationType } from '../src/catalog-types'
import type { DiscordPlaybackPresence } from '../src/discord-presence-types'
import type { UpdateState } from '../src/updater-types'
import type { RemoteNoticeState } from '../src/remote-notice-types'

contextBridge.exposeInMainWorld('aniPlay', {
  search: (query: string, translationType: TranslationType, catalogProvider: CatalogProvider) => ipcRenderer.invoke('search', query, translationType, catalogProvider),
  getEpisodes: (showId: string, translationType: TranslationType, catalogProvider: CatalogProvider) => ipcRenderer.invoke('episodes', showId, translationType, catalogProvider),
  getEpisodeLinks: (showId: string, episode: string, translationType: TranslationType, catalogProvider: CatalogProvider) => ipcRenderer.invoke('links', showId, episode, translationType, catalogProvider),
  openProviderEpisode: (showId: string, episode: string, catalogProvider: CatalogProvider) => ipcRenderer.invoke('open-provider-episode', showId, episode, catalogProvider),
  getCiphermapInfo: () => ipcRenderer.invoke('get-ciphermap-info'),
  syncCiphermap: () => ipcRenderer.invoke('sync-ciphermap'),
  openProjectPage: (page: 'repository' | 'issues' | 'pulls') => ipcRenderer.invoke('open-project-page', page),
  aniList: {
    auth: {
      status: () => ipcRenderer.invoke('anilist:auth-status'),
      start: () => ipcRenderer.invoke('anilist:auth-start'),
      logout: () => ipcRenderer.invoke('anilist:auth-logout'),
    },
    dashboard: { get: () => ipcRenderer.invoke('anilist:dashboard') },
    media: { get: (id: number) => ipcRenderer.invoke('anilist:media', id) },
    list: {
      update: (input: ListUpdateInput) => ipcRenderer.invoke('anilist:list-update', input),
      delete: (id: number) => ipcRenderer.invoke('anilist:list-delete', id),
    },
    mapping: {
      resolve: (media: AnimeSummary, candidates: AnimeSearchResult[], translationType: TranslationType) => ipcRenderer.invoke('anilist:mapping-resolve', media, candidates, translationType),
      confirm: (mediaId: number, anime: AnimeSearchResult, translationType: TranslationType): Promise<CatalogMapping> => ipcRenderer.invoke('anilist:mapping-confirm', mediaId, anime, translationType),
      forget: (mediaId: number) => ipcRenderer.invoke('anilist:mapping-forget', mediaId),
      enrich: (anime: AnimeSearchResult, translationType: TranslationType) => ipcRenderer.invoke('anilist:mapping-enrich', anime, translationType),
    },
  },
  discordPresence: {
    getSettings: () => ipcRenderer.invoke('discord-presence:get-settings'),
    setEnabled: (enabled: boolean) => ipcRenderer.invoke('discord-presence:set-enabled', enabled),
    update: (playback: DiscordPlaybackPresence) => ipcRenderer.invoke('discord-presence:update', playback),
    clear: () => ipcRenderer.invoke('discord-presence:clear'),
  },
  updater: {
    getState: (): Promise<UpdateState> => ipcRenderer.invoke('updater:get-state'),
    check: (): Promise<UpdateState> => ipcRenderer.invoke('updater:check'),
    download: (): Promise<UpdateState> => ipcRenderer.invoke('updater:download'),
    install: (): Promise<void> => ipcRenderer.invoke('updater:install'),
    onChanged: (callback: (state: UpdateState) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, state: UpdateState) => callback(state)
      ipcRenderer.on('updater:changed', listener)
      return () => ipcRenderer.removeListener('updater:changed', listener)
    },
  },
  notices: {
    getState: (): Promise<RemoteNoticeState> => ipcRenderer.invoke('notices:get-state'),
    refresh: (): Promise<RemoteNoticeState> => ipcRenderer.invoke('notices:refresh'),
    dismiss: (id: string): Promise<RemoteNoticeState> => ipcRenderer.invoke('notices:dismiss', id),
    open: (id: string): Promise<boolean> => ipcRenderer.invoke('notices:open', id),
    onChanged: (callback: (state: RemoteNoticeState) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, state: RemoteNoticeState) => callback(state)
      ipcRenderer.on('notices:changed', listener)
      return () => ipcRenderer.removeListener('notices:changed', listener)
    },
  },
  downloads: {
    getState: () => ipcRenderer.invoke('downloads:get-state'),
    start: (request: DownloadRequest) => ipcRenderer.invoke('downloads:start', request),
    cancel: (id: string) => ipcRenderer.invoke('downloads:cancel', id),
    retry: (id: string) => ipcRenderer.invoke('downloads:retry', id),
    clearFinished: () => ipcRenderer.invoke('downloads:clear-finished'),
    chooseDirectory: () => ipcRenderer.invoke('downloads:choose-directory'),
    reveal: (id: string) => ipcRenderer.invoke('downloads:reveal', id),
    onChanged: (callback: (state: DownloadState) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, state: DownloadState) => callback(state)
      ipcRenderer.on('downloads:changed', listener)
      return () => ipcRenderer.removeListener('downloads:changed', listener)
    },
  },
})
