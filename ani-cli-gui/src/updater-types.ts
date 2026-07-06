export type UpdatePhase = 'unavailable' | 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'error'

export interface UpdateState {
  phase: UpdatePhase
  currentVersion: string
  availableVersion?: string
  progress?: number
  message?: string
  canCheck: boolean
  canInstall: boolean
}
