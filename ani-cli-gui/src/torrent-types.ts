export interface TorrentRelease {
  id: string
  title: string
  infoHash: string
  magnet: string
  size: string
  sizeBytes: number | null
  seeders: number
  leechers: number
  publishedAt: string | null
  trusted: boolean
  remake: boolean
  resolution: string | null
  codec: string | null
  episode: string | null
  batch: boolean
}

export interface TorrentFileInfo {
  index: number
  name: string
  path: string
  sizeBytes: number
  episode: string | null
  playableInternally: boolean
}

export type TorrentPhase = 'idle' | 'metadata' | 'selecting' | 'buffering' | 'ready' | 'playing' | 'stopped' | 'error'

export interface TorrentSessionState {
  phase: TorrentPhase
  sessionId: string | null
  infoHash: string | null
  name: string | null
  selectedFile: TorrentFileInfo | null
  files: TorrentFileInfo[]
  playbackUrl: string | null
  downloadedBytes: number
  uploadedBytes: number
  downloadSpeed: number
  uploadSpeed: number
  progress: number
  peers: number
  error: string | null
}

export interface TorrentSettings {
  cacheDirectory: string
  cacheLimitGiB: number
  deleteAfterPlayback: boolean
  downloadLimitKiB: number
  uploadLimitKiB: number
  mpvPath: string
  privacyAccepted: boolean
}

export interface TorrentStartInput {
  release: TorrentRelease
  episode: string
}

export interface TorrentStartResult {
  state: TorrentSessionState
  requiresFileSelection: boolean
}
