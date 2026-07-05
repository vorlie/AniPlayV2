import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('aniPlay', {
  search: (query: string, translationType: 'sub' | 'dub') => ipcRenderer.invoke('search', query, translationType),
  getEpisodes: (showId: string, translationType: 'sub' | 'dub') => ipcRenderer.invoke('episodes', showId, translationType),
  getEpisodeLinks: (showId: string, episode: string, translationType: 'sub' | 'dub') => ipcRenderer.invoke('links', showId, episode, translationType),
  getCiphermapInfo: () => ipcRenderer.invoke('get-ciphermap-info'),
  syncCiphermap: () => ipcRenderer.invoke('sync-ciphermap'),
  openProjectPage: (page: 'repository' | 'issues' | 'pulls') => ipcRenderer.invoke('open-project-page', page),
})
