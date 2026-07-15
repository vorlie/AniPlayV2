import { describe, expect, it } from 'vitest'
import { summarizeViewingEvents, validateWatchSegment, ViewingLogService } from './viewing-log'
import type { WatchSegment } from '../../src/viewing-types'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

function event(startedAt: number, activeSeconds: number, options: Partial<WatchSegment> = {}): WatchSegment {
  return { v: 1, id: String(startedAt), kind: 'watch_segment', recordedAt: startedAt, startedAt, endedAt: startedAt + activeSeconds * 1000, activeSeconds, timezoneOffsetMinutes: 0, animeId: 'anime', animeName: 'Anime', episode: '1', catalogProvider: 'anikoto', fromSeconds: 0, toSeconds: activeSeconds, completed: false, ...options }
}

describe('viewing log', () => {
  it('rejects active time longer than the wall-clock segment', () => {
    expect(() => validateWatchSegment({ ...event(Date.now(), 60), activeSeconds: 120 })).toThrow('Invalid active watch time')
  })

  it('summarizes weekly, weekend, night, and completion-streak activity', () => {
    const saturday = Date.UTC(2026, 6, 11, 1)
    const events = [
      event(saturday, 6 * 3600, { completed: true }),
      event(saturday + 24 * 3600_000, 7 * 3600, { completed: true }),
      event(saturday + 2 * 24 * 3600_000, 12 * 3600, { completed: true }),
    ]
    const summary = summarizeViewingEvents(events)
    expect(summary.maxSevenDaySeconds).toBe(25 * 3600)
    expect(summary.maxWeekendSeconds).toBe(13 * 3600)
    expect(summary.nightSeconds).toBe(15 * 3600)
    expect(summary.longestCompletionStreakDays).toBe(3)
  })

  it('appends immutable JSONL events and updates its summary', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'aniplay-viewing-'))
    const service = new ViewingLogService(directory)
    service.initialize()
    const input = event(Date.now() - 60_000, 60)
    const summary = await service.append(input)
    const lines = readFileSync(join(directory, 'viewing-events.v1.jsonl'), 'utf8').trim().split('\n')
    expect(lines).toHaveLength(1)
    expect(JSON.parse(lines[0])).toMatchObject({ kind: 'watch_segment', activeSeconds: 60 })
    expect(summary.segmentCount).toBe(1)
  })
})
