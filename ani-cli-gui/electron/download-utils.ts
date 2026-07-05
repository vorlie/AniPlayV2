import { existsSync } from 'node:fs'
import { join, parse } from 'node:path'
import type { DownloadJob } from '../src/download-types'

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i

export function sanitizeFilePart(value: string, maxLength = 120): string {
  const cleaned = value
    .normalize('NFKC')
    .split('')
    .filter((character) => character.charCodeAt(0) > 31)
    .join('')
    .replace(/[<>:"/\\|?*]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    .trim()
    .slice(0, maxLength)
    .replace(/[. ]+$/g, '')
  if (!cleaned) return 'Untitled'
  return WINDOWS_RESERVED.test(cleaned) ? `_${cleaned}` : cleaned
}

export function createDownloadFileName(input: {
  animeName: string
  episode: string
  translationType: 'sub' | 'dub'
  resolution: string
}): string {
  const anime = sanitizeFilePart(input.animeName, 120)
  const episode = sanitizeFilePart(input.episode, 24)
  const resolution = sanitizeFilePart(input.resolution || 'Auto', 24)
  const mode = input.translationType === 'dub' ? 'Dub' : 'Sub'
  return `${anime} - Episode ${episode} [${mode}] [${resolution}].mp4`.slice(0, 220)
}

export function findAvailablePath(directory: string, fileName: string): string {
  const parsed = parse(fileName)
  let candidate = join(directory, fileName)
  for (let index = 2; existsSync(candidate); index += 1) {
    candidate = join(directory, `${parsed.name} (${index})${parsed.ext}`)
  }
  return candidate
}

export function parseFfmpegProgress(text: string, durationSeconds?: number): { processedSeconds: number; percent: number | null } | null {
  const match = text.match(/(?:^|\n)out_time_(?:us|ms)=(\d+)/)
  if (!match) return null
  const processedSeconds = Number(match[1]) / 1_000_000
  if (!Number.isFinite(processedSeconds)) return null
  const percent = durationSeconds && durationSeconds > 0
    ? Math.max(0, Math.min(100, (processedSeconds / durationSeconds) * 100))
    : null
  return { processedSeconds, percent }
}

export function mediaHeaders(url: string): Record<string, string> {
  const host = new URL(url).hostname.toLowerCase()
  const referer = host.endsWith('mp4upload.com')
    ? 'https://www.mp4upload.com/'
    : 'https://youtu-chan.com/'
  return {
    Referer: referer,
    Origin: new URL(referer).origin,
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:150.0) Gecko/20100101 Firefox/150.0',
  }
}

export function buildFfmpegArgs(url: string, outputPath: string): string[] {
  const headers = mediaHeaders(url)
  const headerText = Object.entries(headers).map(([key, value]) => `${key}: ${value}`).join('\r\n') + '\r\n'
  return [
    '-y', '-headers', headerText,
    '-i', url,
    '-map', '0:v:0?', '-map', '0:a:0?',
    '-c', 'copy', '-movflags', '+faststart',
    '-progress', 'pipe:1', '-nostats', '-loglevel', 'error',
    '-f', 'mp4', outputPath,
  ]
}

export function recoverInterruptedJobs(jobs: DownloadJob[], now = Date.now()): DownloadJob[] {
  return jobs.map((job) => {
    if (!['queued', 'resolving', 'downloading'].includes(job.status)) return structuredClone(job)
    return {
      ...structuredClone(job),
      status: 'interrupted',
      error: 'Download was interrupted when AniPlay closed. Retry to start again.',
      updatedAt: now,
    }
  })
}

export function nextQueuedJob(jobs: DownloadJob[]): DownloadJob | undefined {
  return [...jobs].reverse().find((job) => job.status === 'queued')
}
