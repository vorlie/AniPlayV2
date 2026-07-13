import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { DownloadJob } from '../../src/download-types'
import { buildFfmpegArgs, createDownloadFileName, findAvailablePath, mediaHeaders, nextQueuedJob, parseFfmpegProgress, recoverInterruptedJobs, sanitizeFilePart } from './download-utils'

function job(id: string, status: DownloadJob['status'], createdAt: number): DownloadJob {
  return {
    id,
    request: { animeId: 'show', animeName: 'Anime', episode: '1', translationType: 'sub', catalogProvider: 'allanime', provider: 'Default', resolution: '1080p' },
    status,
    progress: { percent: 0, processedSeconds: 0 },
    fileName: null,
    outputPath: null,
    error: null,
    createdAt,
    updatedAt: createdAt,
  }
}

describe('download utilities', () => {
  it('sanitizes unsafe and reserved Windows file names', () => {
    expect(sanitizeFilePart('  A: B / C*  ')).toBe('A B C')
    expect(sanitizeFilePart('CON')).toBe('_CON')
  })

  it('creates descriptive MP4 names', () => {
    expect(createDownloadFileName({ animeName: 'Cowboy Bebop', episode: '12', translationType: 'dub', resolution: '1080p' }))
      .toBe('Cowboy Bebop - Episode 12 [Dub] [1080p].mp4')
  })

  it('numbers collisions without overwriting', () => {
    const directory = mkdtempSync(join(tmpdir(), 'aniplay-'))
    try {
      writeFileSync(join(directory, 'Episode.mp4'), '')
      expect(findAvailablePath(directory, 'Episode.mp4')).toBe(join(directory, 'Episode (2).mp4'))
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('parses determinate and indeterminate FFmpeg progress', () => {
    expect(parseFfmpegProgress('out_time_us=5000000\n', 10)).toEqual({ processedSeconds: 5, percent: 50 })
    expect(parseFfmpegProgress('out_time_us=5000000\n')).toEqual({ processedSeconds: 5, percent: null })
  })

  it('builds stream-copy FFmpeg arguments with provider headers', () => {
    const args = buildFfmpegArgs('https://www.mp4upload.com/video.mp4', 'episode.part.mp4')
    expect(args).toContain('copy')
    expect(args).toContain('episode.part.mp4')
    expect(args.join(' ')).toContain('https://www.mp4upload.com/')
    expect(mediaHeaders('https://video.wixstatic.com/video/file.mp4').Referer).toBe('https://youtu-chan.com/')
  })

  it('runs queued jobs oldest-first', () => {
    expect(nextQueuedJob([job('new', 'queued', 2), job('old', 'queued', 1)])?.id).toBe('old')
  })

  it('marks active persisted jobs interrupted', () => {
    const recovered = recoverInterruptedJobs([job('active', 'downloading', 1), job('done', 'completed', 2)], 10)
    expect(recovered[0].status).toBe('interrupted')
    expect(recovered[0].updatedAt).toBe(10)
    expect(recovered[1].status).toBe('completed')
  })
})
