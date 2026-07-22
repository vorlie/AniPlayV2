import { app, dialog, shell } from 'electron'
import { spawn, type ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import { join } from 'node:path'
import type { DownloadJob, DownloadRequest, DownloadResult, DownloadState } from '../../src/download-types'
import { getEpisodeLinks } from '../scrape'
import { buildFfmpegArgs, createDownloadFileName, findAvailablePath, mediaHeaders, nextQueuedJob, parseFfmpegProgress, recoverInterruptedJobs } from './download-utils'
import { isMegaPlayMediaHost } from '../media-headers'
import { startHlsMimeProxy } from './hls-mime-proxy'

const ACTIVE_STATUSES = new Set(['queued', 'resolving', 'downloading'])
const FINISHED_STATUSES = new Set(['completed', 'failed', 'cancelled'])
const HISTORY_LIMIT = 100

interface PersistedDownloads {
  directory?: string
  jobs?: DownloadJob[]
}

export class DownloadManager {
  private jobs: DownloadJob[] = []
  private directory = ''
  private process: ChildProcess | null = null
  private activeJobId: string | null = null
  private stopped = false
  private persistTimer: NodeJS.Timeout | null = null
  private readonly onChange: (state: DownloadState) => void

  constructor(onChange: (state: DownloadState) => void) {
    this.onChange = onChange
  }

  initialize(): void {
    this.directory = join(app.getPath('downloads'), 'AniPlay')
    try {
      const parsed = JSON.parse(fs.readFileSync(this.statePath(), 'utf8')) as PersistedDownloads
      if (typeof parsed.directory === 'string' && parsed.directory) this.directory = parsed.directory
      if (Array.isArray(parsed.jobs)) this.jobs = parsed.jobs.slice(0, HISTORY_LIMIT)
    } catch {
      // First run or invalid state: use safe defaults.
    }

    this.jobs = recoverInterruptedJobs(this.jobs)
    for (const job of this.jobs) {
      this.removePartial(job)
    }
    this.persistNow()
    this.emit()
  }

  getState(): DownloadState {
    const ffmpegError = this.ffmpegValidationError()
    return {
      jobs: structuredClone(this.jobs),
      settings: { directory: this.directory },
      ffmpegAvailable: ffmpegError === null,
      ffmpegError,
    }
  }

  start(request: DownloadRequest): DownloadResult {
    const ffmpegError = this.ffmpegValidationError()
    if (ffmpegError) return { success: false, error: ffmpegError }
    const now = Date.now()
    const job: DownloadJob = {
      id: randomUUID(),
      request: structuredClone(request),
      status: 'queued',
      progress: { percent: 0, processedSeconds: 0 },
      fileName: null,
      outputPath: null,
      error: null,
      createdAt: now,
      updatedAt: now,
    }
    this.jobs.unshift(job)
    this.trimHistory()
    this.changed()
    void this.pump()
    return { success: true, job: structuredClone(job) }
  }

  cancel(id: string): DownloadResult {
    const job = this.jobs.find((item) => item.id === id)
    if (!job) return { success: false, error: 'Download not found' }
    if (!ACTIVE_STATUSES.has(job.status)) return { success: false, error: 'Download is not active' }
    job.status = 'cancelled'
    job.error = null
    job.updatedAt = Date.now()
    if (this.activeJobId === id) this.process?.kill()
    else this.removePartial(job)
    this.changed()
    return { success: true, job: structuredClone(job) }
  }

  retry(id: string): DownloadResult {
    const source = this.jobs.find((item) => item.id === id)
    if (!source) return { success: false, error: 'Download not found' }
    if (!['failed', 'cancelled', 'interrupted'].includes(source.status)) {
      return { success: false, error: 'Only failed, cancelled, or interrupted downloads can be retried' }
    }
    return this.start(source.request)
  }

  clearFinished(): DownloadResult {
    this.jobs = this.jobs.filter((job) => !FINISHED_STATUSES.has(job.status))
    this.changed()
    return { success: true }
  }

  async chooseDirectory(): Promise<DownloadState> {
    const result = await dialog.showOpenDialog({
      title: 'Choose AniPlay download folder',
      defaultPath: this.directory,
      properties: ['openDirectory', 'createDirectory'],
    })
    if (!result.canceled && result.filePaths[0]) {
      this.directory = result.filePaths[0]
      this.changed()
    }
    return this.getState()
  }

  reveal(id: string): DownloadResult {
    const job = this.jobs.find((item) => item.id === id)
    if (!job?.outputPath || job.status !== 'completed') return { success: false, error: 'Completed download not found' }
    shell.showItemInFolder(job.outputPath)
    return { success: true, job: structuredClone(job) }
  }

  shutdown(): void {
    this.stopped = true
    const active = this.jobs.find((job) => job.id === this.activeJobId)
    if (active && ACTIVE_STATUSES.has(active.status)) {
      active.status = 'interrupted'
      active.error = 'Download was interrupted when AniPlay closed. Retry to start again.'
      active.updatedAt = Date.now()
      this.removePartial(active)
    }
    this.process?.kill()
    this.persistNow()
  }

  private async pump(): Promise<void> {
    if (this.stopped || this.activeJobId) return
    const job = nextQueuedJob(this.jobs)
    if (!job) return
    this.activeJobId = job.id
    try {
      await this.run(job)
    } finally {
      this.activeJobId = null
      this.process = null
      this.changed()
      if (!this.stopped) void this.pump()
    }
  }

  private async run(job: DownloadJob): Promise<void> {
    job.status = 'resolving'
    job.updatedAt = Date.now()
    this.changed()
    try {
      const links = await getEpisodeLinks(job.request.animeId, job.request.episode, job.request.translationType, job.request.catalogProvider)
      if (this.wasAborted(job)) return
      const link = links.find((item) => item.provider === job.request.provider && item.resolution === job.request.resolution)
      if (!link) throw new Error(`The selected ${job.request.provider} ${job.request.resolution} source is no longer available`)

      fs.mkdirSync(this.directory, { recursive: true })
      fs.accessSync(this.directory, fs.constants.W_OK)
      const fileName = createDownloadFileName(job.request)
      const outputPath = findAvailablePath(this.directory, fileName)
      const parsed = outputPath.slice(0, -4)
      const partialPath = `${parsed}.part.mp4`
      job.fileName = outputPath.split(/[\\/]/).pop() || fileName
      job.outputPath = outputPath
      job.status = 'downloading'
      job.progress = { percent: job.request.durationSeconds ? 0 : null, processedSeconds: 0 }
      job.updatedAt = Date.now()
      this.changed()

      const shouldRelayHls = link.hls && isMegaPlayMediaHost(new URL(link.url).hostname)
      const relay = shouldRelayHls ? await startHlsMimeProxy(link.url, mediaHeaders(link.url)) : null
      try {
        await this.runFfmpeg(job, relay?.url ?? link.url, partialPath, link.subtitles ?? [])
      } finally {
        await relay?.close()
      }
      if (this.wasAborted(job)) {
        this.removePath(partialPath)
        return
      }
      fs.renameSync(partialPath, outputPath)
      job.status = 'completed'
      job.progress = { percent: 100, processedSeconds: job.progress.processedSeconds }
      job.error = null
      job.updatedAt = Date.now()
    } catch (error: unknown) {
      if (!this.wasAborted(job)) {
        job.status = 'failed'
        job.error = error instanceof Error ? error.message : 'Download failed'
        job.updatedAt = Date.now()
      }
      this.removePartial(job)
    }
  }

  private runFfmpeg(job: DownloadJob, url: string, partialPath: string, subtitles: { label: string; url: string }[]): Promise<void> {
    const args = buildFfmpegArgs(url, partialPath, subtitles)
    return new Promise((resolvePromise, reject) => {
      let stderr = ''
      let stdoutBuffer = ''
      const child = spawn(this.ffmpegPath(), args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
      this.process = child
      child.stdout.on('data', (chunk: Buffer) => {
        stdoutBuffer += chunk.toString()
        const blocks = stdoutBuffer.split('\nprogress=')
        stdoutBuffer = blocks.pop() || ''
        for (const block of blocks) {
          const parsed = parseFfmpegProgress(block, job.request.durationSeconds)
          if (!parsed) continue
          job.progress = parsed
          job.updatedAt = Date.now()
          this.emit()
          this.schedulePersist()
        }
      })
      child.stderr.on('data', (chunk: Buffer) => { stderr = `${stderr}${chunk.toString()}`.slice(-4000) })
      child.on('error', reject)
      child.on('close', (code) => {
        if (this.wasAborted(job)) resolvePromise()
        else if (code === 0) resolvePromise()
        else reject(new Error(stderr.trim() || `FFmpeg exited with code ${code ?? 'unknown'}`))
      })
    })
  }

  private ffmpegPath(): string {
    const binary = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
    return app.isPackaged
      ? join(process.resourcesPath, 'bin', binary)
      : join(process.env.APP_ROOT || app.getAppPath(), 'node_modules', 'ffmpeg-static', binary)
  }

  private wasAborted(job: DownloadJob): boolean {
    return job.status === 'cancelled' || job.status === 'interrupted'
  }

  private ffmpegValidationError(): string | null {
    const path = this.ffmpegPath()
    try {
      fs.accessSync(path, process.platform === 'win32' ? fs.constants.F_OK : fs.constants.X_OK)
      return null
    } catch {
      return `Bundled FFmpeg is missing or not executable: ${path}`
    }
  }

  private statePath(): string { return join(app.getPath('userData'), 'downloads.json') }
  private partialPath(job: DownloadJob): string | null { return job.outputPath ? `${job.outputPath.slice(0, -4)}.part.mp4` : null }
  private removePartial(job: DownloadJob): void { const path = this.partialPath(job); if (path) this.removePath(path) }
  private removePath(path: string): void { try { fs.rmSync(path, { force: true }) } catch { /* best effort */ } }
  private trimHistory(): void { if (this.jobs.length > HISTORY_LIMIT) this.jobs = this.jobs.slice(0, HISTORY_LIMIT) }
  private emit(): void { this.onChange(this.getState()) }
  private changed(): void { this.trimHistory(); this.emit(); this.schedulePersist() }
  private schedulePersist(): void {
    if (this.persistTimer) return
    this.persistTimer = setTimeout(() => { this.persistTimer = null; this.persistNow() }, 500)
  }
  private persistNow(): void {
    try {
      fs.mkdirSync(app.getPath('userData'), { recursive: true })
      fs.writeFileSync(this.statePath(), JSON.stringify({ directory: this.directory, jobs: this.jobs }, null, 2), 'utf8')
    } catch (error) {
      console.error('Failed to persist downloads:', error)
    }
  }
}
