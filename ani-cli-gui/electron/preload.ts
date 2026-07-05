import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('aniPlay', {
  search: (query: string) => ipcRenderer.invoke('search', query),
  getEpisodes: (showId: string) => ipcRenderer.invoke('episodes', showId),
  getEpisodeLinks: (showId: string, episode: string) => ipcRenderer.invoke('links', showId, episode),
  getCiphermapInfo: () => ipcRenderer.invoke('get-ciphermap-info'),
  syncCiphermap: () => ipcRenderer.invoke('sync-ciphermap'),
  openProjectPage: (page: 'repository' | 'issues' | 'pulls') => ipcRenderer.invoke('open-project-page', page),
})
