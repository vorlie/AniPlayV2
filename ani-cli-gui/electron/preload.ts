import { contextBridge, ipcRenderer } from 'electron'
import type { DownloadRequest, DownloadState } from '../src/download-types'

contextBridge.exposeInMainWorld('aniPlay', {
  search: (query: string, translationType: 'sub' | 'dub') => ipcRenderer.invoke('search', query, translationType),
  getEpisodes: (showId: string, translationType: 'sub' | 'dub') => ipcRenderer.invoke('episodes', showId, translationType),
  getEpisodeLinks: (showId: string, episode: string, translationType: 'sub' | 'dub') => ipcRenderer.invoke('links', showId, episode, translationType),
  getCiphermapInfo: () => ipcRenderer.invoke('get-ciphermap-info'),
  syncCiphermap: () => ipcRenderer.invoke('sync-ciphermap'),
  openProjectPage: (page: 'repository' | 'issues' | 'pulls') => ipcRenderer.invoke('open-project-page', page),
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
