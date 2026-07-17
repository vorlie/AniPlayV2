export interface AllAnimeDebugInfo {
  source: 'dynamic' | 'fallback'
  epoch: number
  buildId: string
  partA: string
  partB: string
  derivedKeyHex: string
  queryHash: string
  apiUrl: string
  referer: string
  appJsUrl?: string
  fetchedAt: string
  cacheExpiresAt: string
  legacyCtr: boolean
  error?: string
}
