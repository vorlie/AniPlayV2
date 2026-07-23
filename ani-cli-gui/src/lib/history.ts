import type { CatalogProvider } from '../catalog-types'

export interface HistoryEntry {
  animeId: string
  animeName: string
  episode: string
  watchedAt: number
  progressSeconds: number
  durationSeconds?: number
  aniListMediaId?: number
  coverUrl?: string
  catalogProvider: CatalogProvider
  legacyProvider?: 'miruro'
}

const HISTORY_KEY = 'watch.history.v1'
const MAX_ITEMS = 100

function toFiniteNumber(value: unknown, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function normalizeEntry(entry: unknown): HistoryEntry | null {
  if (!entry || typeof entry !== 'object') return null

  const candidate = entry as Omit<Partial<HistoryEntry>, 'catalogProvider'> & { catalogProvider?: unknown } & Record<string, unknown>
  if (typeof candidate.animeId !== 'string' || typeof candidate.animeName !== 'string' || typeof candidate.episode !== 'string') {
    return null
  }

  const progressSeconds = Math.max(0, toFiniteNumber(candidate.progressSeconds, 0))
  const durationSeconds = candidate.durationSeconds
  const normalizedDuration = typeof durationSeconds === 'number' && Number.isFinite(durationSeconds) && durationSeconds >= 0
    ? durationSeconds
    : undefined
  const aniListMediaId = typeof candidate.aniListMediaId === 'number' && Number.isInteger(candidate.aniListMediaId) && candidate.aniListMediaId > 0
    ? candidate.aniListMediaId
    : undefined
  const coverUrl = typeof candidate.coverUrl === 'string' && candidate.coverUrl.startsWith('https://') ? candidate.coverUrl : undefined

  return {
    animeId: candidate.animeId,
    animeName: candidate.animeName,
    episode: candidate.episode,
    watchedAt: toFiniteNumber(candidate.watchedAt, 0),
    progressSeconds,
    durationSeconds: normalizedDuration,
    aniListMediaId,
    coverUrl,
    catalogProvider: candidate.catalogProvider === 'miruro'
      ? 'anidb'
      : candidate.catalogProvider === 'desu' || candidate.catalogProvider === 'docchi' || candidate.catalogProvider === 'anidb' || candidate.catalogProvider === 'anikoto' ? candidate.catalogProvider : 'allanime',
    legacyProvider: candidate.catalogProvider === 'miruro' ? 'miruro' : undefined,
  }
}

function sortByWatchedAtDesc(entries: HistoryEntry[]) {
  return entries.sort((a, b) => b.watchedAt - a.watchedAt)
}

export function readHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return sortByWatchedAtDesc(parsed.map(normalizeEntry).filter((entry): entry is HistoryEntry => entry !== null))
  } catch {
    return []
  }
}

export function writeHistory(entries: HistoryEntry[]) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(sortByWatchedAtDesc([...entries]).slice(0, MAX_ITEMS)))
  } catch {
    // Ignore storage failures to keep playback usable.
  }
}

export function addHistory(entry: Omit<HistoryEntry, 'watchedAt'>) {
  const existing = readHistory()
  const normalizedEntry: HistoryEntry = {
    animeId: entry.animeId,
    animeName: entry.animeName,
    episode: entry.episode,
    progressSeconds: Math.max(0, toFiniteNumber(entry.progressSeconds, 0)),
    durationSeconds: typeof entry.durationSeconds === 'number' && Number.isFinite(entry.durationSeconds) && entry.durationSeconds >= 0
      ? entry.durationSeconds
      : undefined,
    watchedAt: Date.now(),
    aniListMediaId: entry.aniListMediaId,
    coverUrl: entry.coverUrl,
    catalogProvider: entry.catalogProvider === 'desu' || entry.catalogProvider === 'docchi' || entry.catalogProvider === 'anidb' || entry.catalogProvider === 'anikoto' ? entry.catalogProvider : 'allanime',
  }
  const filtered = existing.filter((x) => !(x.animeId === entry.animeId && x.episode === entry.episode))
  filtered.unshift(normalizedEntry)
  writeHistory(filtered)
}

export function replaceLegacyHistoryEntry(entry: HistoryEntry, replacement: { id: string; name: string; episodes: number; aniListMediaId?: number; coverUrl?: string }): HistoryEntry {
  const migrated: HistoryEntry = {
    ...entry,
    animeId: replacement.id,
    animeName: replacement.name,
    aniListMediaId: replacement.aniListMediaId ?? entry.aniListMediaId,
    coverUrl: replacement.coverUrl ?? entry.coverUrl,
    catalogProvider: 'anidb',
    legacyProvider: undefined,
  }
  const entries = readHistory().map((candidate) =>
    candidate.legacyProvider === 'miruro' && candidate.animeId === entry.animeId && candidate.animeName === entry.animeName
      ? { ...candidate, ...migrated, episode: candidate.episode, progressSeconds: candidate.progressSeconds, watchedAt: candidate.watchedAt }
      : candidate)
  writeHistory(entries)
  return migrated
}

export function clearHistory() {
  try {
    localStorage.removeItem(HISTORY_KEY)
  } catch {
    // Ignore storage failures to keep playback usable.
  }
}
