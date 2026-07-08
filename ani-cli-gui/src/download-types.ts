import type { CatalogProvider } from './catalog-types'

export type TranslationType = 'sub' | 'dub'

export type DownloadStatus =
  | 'queued'
  | 'resolving'
  | 'downloading'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'interrupted'

export interface DownloadRequest {
  animeId: string
  animeName: string
  episode: string
  translationType: TranslationType
  catalogProvider: CatalogProvider
  provider: string
  resolution: string
  durationSeconds?: number
}

export interface DownloadProgress {
  percent: number | null
  processedSeconds: number
}

export interface DownloadJob {
  id: string
  request: DownloadRequest
  status: DownloadStatus
  progress: DownloadProgress
  fileName: string | null
  outputPath: string | null
  error: string | null
  createdAt: number
  updatedAt: number
}

export interface DownloadSettings {
  directory: string
}

export interface DownloadState {
  jobs: DownloadJob[]
  settings: DownloadSettings
  ffmpegAvailable: boolean
  ffmpegError: string | null
}

export interface DownloadResult {
  success: boolean
  job?: DownloadJob
  error?: string
}
