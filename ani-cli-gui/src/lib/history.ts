export interface HistoryEntry {
  animeId: string
  animeName: string
  episode: string
  watchedAt: number
}

const HISTORY_KEY = 'watch.history.v1'
const MAX_ITEMS = 100

export function readHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((x) => x && typeof x.animeId === 'string' && typeof x.episode === 'string')
      .sort((a, b) => (b.watchedAt || 0) - (a.watchedAt || 0))
  } catch {
    return []
  }
}

export function writeHistory(entries: HistoryEntry[]) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(0, MAX_ITEMS)))
}

export function addHistory(entry: Omit<HistoryEntry, 'watchedAt'>) {
  const existing = readHistory()
  const filtered = existing.filter((x) => !(x.animeId === entry.animeId && x.episode === entry.episode))
  filtered.unshift({ ...entry, watchedAt: Date.now() })
  writeHistory(filtered)
}

export function clearHistory() {
  localStorage.removeItem(HISTORY_KEY)
}

