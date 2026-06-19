export interface IpcResponse<T> {
  success: boolean
  data?: T
  error?: string
}

export async function invokeSearch<T = any>(query: string): Promise<IpcResponse<T>> {
  const ipc = (window as any).ipcRenderer
  if (ipc && typeof ipc.invoke === 'function') {
    return ipc.invoke('search', query)
  }
  const params = new URLSearchParams({ q: query })
  const res = await fetch(`/api/search?${params.toString()}`)
  return res.json()
}

export async function invokeEpisodes<T = any>(id: string): Promise<IpcResponse<T>> {
  const ipc = (window as any).ipcRenderer
  if (ipc && typeof ipc.invoke === 'function') {
    return ipc.invoke('episodes', id)
  }
  const params = new URLSearchParams({ id })
  const res = await fetch(`/api/episodes?${params.toString()}`)
  return res.json()
}

export async function invokeLinks<T = any>(id: string, ep: string): Promise<IpcResponse<T>> {
  const ipc = (window as any).ipcRenderer
  if (ipc && typeof ipc.invoke === 'function') {
    return ipc.invoke('links', id, ep)
  }
  const params = new URLSearchParams({ id, ep })
  const res = await fetch(`/api/links?${params.toString()}`)
  return res.json()
}
