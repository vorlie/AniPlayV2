import type { CatalogProvider } from './catalog-types'

export type RemoteNoticeSeverity = 'info' | 'warning' | 'critical' | 'update'

export interface RemoteNotice {
  id: string
  severity: RemoteNoticeSeverity
  title: string
  message: string
  providers?: CatalogProvider[]
  dismissible: boolean
  link?: string
}

export interface RemoteNoticeState {
  notices: RemoteNotice[]
  sourceUpdatedAt?: string
  fetchedAt?: string
  stale: boolean
  error?: string
}
