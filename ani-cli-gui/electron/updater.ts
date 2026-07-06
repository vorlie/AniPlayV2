import { app } from 'electron'
import { autoUpdater, type ProgressInfo, type UpdateInfo } from 'electron-updater'
import type { UpdateState } from '../src/updater-types'

type StateListener = (state: UpdateState) => void

export class UpdateService {
  private state: UpdateState
  private checkTimer?: ReturnType<typeof setTimeout>
  private readonly onChanged: StateListener

  constructor(onChanged: StateListener) {
    this.onChanged = onChanged
    const unsupportedReason = !app.isPackaged
      ? 'Updates are only available in packaged builds.'
      : process.platform !== 'win32'
        ? 'Automatic updates are currently available for Windows installer builds.'
        : process.env.PORTABLE_EXECUTABLE_FILE
          ? 'Portable builds cannot update in place. Download the latest portable release from GitHub.'
          : undefined
    this.state = {
      phase: unsupportedReason ? 'unavailable' : 'idle',
      currentVersion: app.getVersion(),
      message: unsupportedReason,
      canCheck: !unsupportedReason,
      canInstall: false,
    }
  }

  initialize() {
    if (!this.state.canCheck) return
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.allowPrerelease = false
    autoUpdater.on('checking-for-update', () => this.setState({ phase: 'checking', message: undefined }))
    autoUpdater.on('update-available', (info: UpdateInfo) => this.setState({ phase: 'available', availableVersion: info.version, message: undefined }))
    autoUpdater.on('update-not-available', () => this.setState({ phase: 'idle', availableVersion: undefined, progress: undefined, message: 'AniPlay is up to date.' }))
    autoUpdater.on('download-progress', (progress: ProgressInfo) => this.setState({ phase: 'downloading', progress: Math.max(0, Math.min(100, progress.percent)), message: undefined }))
    autoUpdater.on('update-downloaded', (info: UpdateInfo) => this.setState({ phase: 'downloaded', availableVersion: info.version, progress: 100, message: 'Update ready to install.', canInstall: true }))
    autoUpdater.on('error', (error: Error) => this.setState({ phase: 'error', progress: undefined, message: error.message || 'Update failed.', canInstall: false }))
    this.checkTimer = setTimeout(() => { void this.check() }, 10_000)
    this.checkTimer.unref?.()
  }

  getState(): UpdateState {
    return { ...this.state }
  }

  async check(): Promise<UpdateState> {
    if (!this.state.canCheck || this.state.phase === 'checking' || this.state.phase === 'downloading') return this.getState()
    try {
      await autoUpdater.checkForUpdates()
    } catch (error) {
      this.fail(error)
    }
    return this.getState()
  }

  async download(): Promise<UpdateState> {
    if (!this.state.canCheck || this.state.phase !== 'available') return this.getState()
    this.setState({ phase: 'downloading', progress: 0, message: undefined })
    try {
      await autoUpdater.downloadUpdate()
    } catch (error) {
      this.fail(error)
    }
    return this.getState()
  }

  install() {
    if (!this.state.canInstall || this.state.phase !== 'downloaded') throw new Error('No downloaded update is ready to install')
    autoUpdater.quitAndInstall(false, true)
  }

  shutdown() {
    if (this.checkTimer) clearTimeout(this.checkTimer)
  }

  private fail(error: unknown) {
    this.setState({ phase: 'error', progress: undefined, message: error instanceof Error ? error.message : 'Update failed.', canInstall: false })
  }

  private setState(change: Partial<UpdateState>) {
    this.state = { ...this.state, ...change }
    this.onChanged(this.getState())
  }
}
