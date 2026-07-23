import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import { promises as fsp } from 'node:fs'
import { join } from 'node:path'
import type { WatchSegment, WatchSegmentInput, ViewingSummary } from '../../src/viewing-types'
import { EMPTY_VIEWING_SUMMARY } from '../../src/viewing-types'

const EVENTS_FILE = 'viewing-events.v1.jsonl'
const SUMMARY_FILE = 'viewing-summary.v1.json'
const DAY_MS = 86_400_000

function finite(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value) }
function shortText(value: unknown, max: number) { return typeof value === 'string' && value.trim() && value.length <= max ? value.trim() : null }

export function validateWatchSegment(value: unknown): WatchSegmentInput {
  if (!value || typeof value !== 'object') throw new TypeError('Invalid watch segment')
  const item = value as Partial<WatchSegmentInput>
  if (!finite(item.startedAt) || !finite(item.endedAt) || item.endedAt <= item.startedAt || item.endedAt - item.startedAt > 12 * 60 * 60_000) throw new TypeError('Invalid watch segment time')
  const elapsedSeconds = (item.endedAt - item.startedAt) / 1000
  if (!finite(item.activeSeconds) || item.activeSeconds < 1 || item.activeSeconds > elapsedSeconds + 2) throw new TypeError('Invalid active watch time')
  const timezoneOffsetMinutes = finite(item.timezoneOffsetMinutes) ? item.timezoneOffsetMinutes : Number.NaN
  if (!Number.isInteger(timezoneOffsetMinutes) || timezoneOffsetMinutes < -840 || timezoneOffsetMinutes > 840) throw new TypeError('Invalid timezone offset')
  const animeId = shortText(item.animeId, 1000); const animeName = shortText(item.animeName, 300); const episode = shortText(item.episode, 100)
  if (!animeId || !animeName || !episode) throw new TypeError('Invalid watch media')
  const catalogProvider = item.catalogProvider === 'desu' || item.catalogProvider === 'docchi' || item.catalogProvider === 'anidb' || item.catalogProvider === 'anikoto' ? item.catalogProvider : item.catalogProvider === 'allanime' ? 'allanime' : null
  if (!catalogProvider) throw new TypeError('Invalid catalog provider')
  if (!finite(item.fromSeconds) || item.fromSeconds < 0 || !finite(item.toSeconds) || item.toSeconds < 0) throw new TypeError('Invalid playback position')
  const durationSeconds = item.durationSeconds
  if (durationSeconds !== undefined && (!finite(durationSeconds) || durationSeconds <= 0)) throw new TypeError('Invalid playback duration')
  const aniListMediaId = item.aniListMediaId
  if (aniListMediaId !== undefined && (!Number.isInteger(aniListMediaId) || aniListMediaId <= 0)) throw new TypeError('Invalid AniList media ID')
  return { startedAt: item.startedAt, endedAt: item.endedAt, activeSeconds: item.activeSeconds, timezoneOffsetMinutes, animeId, animeName, episode, catalogProvider, aniListMediaId, fromSeconds: item.fromSeconds, toSeconds: item.toSeconds, durationSeconds, completed: item.completed === true }
}

function localMs(event: WatchSegment, timestamp: number) { return timestamp - event.timezoneOffsetMinutes * 60_000 }
function localDay(event: WatchSegment) { return Math.floor(localMs(event, event.endedAt) / DAY_MS) }

function nightSeconds(event: WatchSegment) {
  const start = localMs(event, event.startedAt); const end = localMs(event, event.endedAt)
  const wallSeconds = Math.max(1, (end - start) / 1000)
  let overlapMs = 0
  for (let day = Math.floor(start / DAY_MS) * DAY_MS; day <= end; day += DAY_MS) {
    const nightEnd = day + 6 * 60 * 60_000
    overlapMs += Math.max(0, Math.min(end, nightEnd) - Math.max(start, day))
  }
  return event.activeSeconds * Math.min(1, overlapMs / 1000 / wallSeconds)
}

export function summarizeViewingEvents(events: WatchSegment[]): ViewingSummary {
  if (!events.length) return { ...EMPTY_VIEWING_SUMMARY }
  const sorted = [...events].sort((a, b) => a.startedAt - b.startedAt)
  let maxSevenDaySeconds = 0; let windowSeconds = 0; let left = 0
  const weekends = new Map<number, number>(); const completionDays = new Set<number>()
  let totalActiveSeconds = 0; let totalNightSeconds = 0
  sorted.forEach((event) => {
    totalActiveSeconds += event.activeSeconds; windowSeconds += event.activeSeconds; totalNightSeconds += nightSeconds(event)
    while (event.startedAt - sorted[left].startedAt >= 7 * DAY_MS) { windowSeconds -= sorted[left].activeSeconds; left += 1 }
    maxSevenDaySeconds = Math.max(maxSevenDaySeconds, windowSeconds)
    const local = new Date(localMs(event, event.startedAt)); const weekday = local.getUTCDay()
    if (weekday === 0 || weekday === 6) {
      const day = Math.floor(local.getTime() / DAY_MS); const saturday = weekday === 0 ? day - 1 : day
      weekends.set(saturday, (weekends.get(saturday) ?? 0) + event.activeSeconds)
    }
    if (event.completed) completionDays.add(localDay(event))
  })
  let longestCompletionStreakDays = 0; let streak = 0; let previous: number | undefined
  for (const day of [...completionDays].sort((a, b) => a - b)) { streak = previous !== undefined && day === previous + 1 ? streak + 1 : 1; longestCompletionStreakDays = Math.max(longestCompletionStreakDays, streak); previous = day }
  return { segmentCount: events.length, totalActiveSeconds, maxSevenDaySeconds, maxWeekendSeconds: Math.max(0, ...weekends.values()), nightSeconds: totalNightSeconds, longestCompletionStreakDays }
}

export class ViewingLogService {
  private events: WatchSegment[] = []
  private summary: ViewingSummary = { ...EMPTY_VIEWING_SUMMARY }
  private writeQueue: Promise<unknown> = Promise.resolve()
  private readonly basePath: string
  constructor(basePath: string) { this.basePath = basePath }
  private path(name: string) { return join(this.basePath, name) }
  initialize() {
    fs.mkdirSync(this.basePath, { recursive: true })
    try {
      this.events = fs.readFileSync(this.path(EVENTS_FILE), 'utf8').split(/\r?\n/).filter(Boolean).flatMap((line) => {
        try {
          const parsed = JSON.parse(line) as WatchSegment
          if (parsed.v !== 1 || parsed.kind !== 'watch_segment' || typeof parsed.id !== 'string') return []
          return [{ ...parsed, ...validateWatchSegment(parsed) }]
        } catch { return [] }
      })
    } catch { this.events = [] }
    this.summary = summarizeViewingEvents(this.events)
  }
  getSummary() { return { ...this.summary } }
  append(value: unknown) {
    const input = validateWatchSegment(value)
    const event: WatchSegment = { ...input, v: 1, id: randomUUID(), kind: 'watch_segment', recordedAt: Date.now() }
    const operation = this.writeQueue.then(async () => {
      await fsp.appendFile(this.path(EVENTS_FILE), `${JSON.stringify(event)}\n`, 'utf8')
      this.events.push(event); this.summary = summarizeViewingEvents(this.events)
      await fsp.writeFile(this.path(SUMMARY_FILE), `${JSON.stringify(this.summary, null, 2)}\n`, 'utf8')
      return this.getSummary()
    })
    this.writeQueue = operation.catch(() => {})
    return operation
  }
}
