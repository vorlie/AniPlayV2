export type AdBlockMode = 'off' | 'easylist' | 'basic' | 'balanced' | 'strict'

export interface AdBlockSettings {
  mode: AdBlockMode
  blockKnownAdHosts: boolean
}

export interface AdBlockState extends AdBlockSettings {
  active: boolean
  listCount: number
  blockedCount: number
  totalBlockedCount: number
  lastError?: string
}
