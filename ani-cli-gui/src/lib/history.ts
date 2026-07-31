import type { CatalogProvider } from "../catalog-types";

export interface HistoryEntry {
  animeId: string;
  animeName: string;
  episode: string;
  watchedAt: number;
  progressSeconds: number;
  durationSeconds?: number;
  aniListMediaId?: number;
  coverUrl?: string;
  catalogProvider: CatalogProvider;
  legacyProvider?: "miruro";
}

export interface HistoryGroup {
  animeId: string;
  animeName: string;
  coverUrl?: string;
  aniListMediaId?: number;
  catalogProvider: CatalogProvider;

  latest: HistoryEntry;
  episodesWatched: number;

  lastWatchedAt: number;
  progressPercent: number;
}

const HISTORY_KEY = "watch.history.v1";
const MAX_ITEMS = 100;

function toFiniteNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeEntry(entry: unknown): HistoryEntry | null {
  if (!entry || typeof entry !== "object") return null;

  const candidate = entry as Omit<Partial<HistoryEntry>, "catalogProvider"> & {
    catalogProvider?: unknown;
  } & Record<string, unknown>;

  if (
    typeof candidate.animeId !== "string" ||
    typeof candidate.animeName !== "string" ||
    typeof candidate.episode !== "string"
  ) {
    return null;
  }

  const progressSeconds = Math.max(
    0,
    toFiniteNumber(candidate.progressSeconds, 0),
  );

  const durationSeconds =
    typeof candidate.durationSeconds === "number" &&
    Number.isFinite(candidate.durationSeconds) &&
    candidate.durationSeconds >= 0
      ? candidate.durationSeconds
      : undefined;

  const aniListMediaId =
    typeof candidate.aniListMediaId === "number" &&
    Number.isInteger(candidate.aniListMediaId) &&
    candidate.aniListMediaId > 0
      ? candidate.aniListMediaId
      : undefined;

  const coverUrl =
    typeof candidate.coverUrl === "string" &&
    candidate.coverUrl.startsWith("https://")
      ? candidate.coverUrl
      : undefined;

  const provider =
    candidate.catalogProvider === "desu" ||
    candidate.catalogProvider === "docchi" ||
    candidate.catalogProvider === "anidb" ||
    candidate.catalogProvider === "anikoto" ||
    candidate.catalogProvider === "anikoto2"
      ? candidate.catalogProvider
      : candidate.catalogProvider === "miruro"
        ? "anidb"
        : "allanime";

  return {
    animeId: candidate.animeId,
    animeName: candidate.animeName,
    episode: candidate.episode,
    watchedAt: toFiniteNumber(candidate.watchedAt, 0),
    progressSeconds,
    durationSeconds,
    aniListMediaId,
    coverUrl,
    catalogProvider: provider,
    legacyProvider:
      candidate.catalogProvider === "miruro" ? "miruro" : undefined,
  };
}

function sortByWatchedAtDesc(entries: HistoryEntry[]) {
  return entries.sort((a, b) => b.watchedAt - a.watchedAt);
}

export function readHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);

    if (!raw) return [];

    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return sortByWatchedAtDesc(
      parsed
        .map(normalizeEntry)
        .filter((entry): entry is HistoryEntry => entry !== null),
    );
  } catch {
    return [];
  }
}

export function writeHistory(entries: HistoryEntry[]) {
  try {
    localStorage.setItem(
      HISTORY_KEY,
      JSON.stringify(sortByWatchedAtDesc([...entries]).slice(0, MAX_ITEMS)),
    );
  } catch {
    // Ignore storage failures
  }
}

export function addHistory(entry: Omit<HistoryEntry, "watchedAt">) {
  const existing = readHistory();

  const previous = existing.find(
    (item) => item.animeId === entry.animeId && item.episode === entry.episode,
  );

  const normalizedEntry: HistoryEntry = {
    animeId: entry.animeId,
    animeName: entry.animeName,

    episode: entry.episode,

    progressSeconds: Math.max(0, toFiniteNumber(entry.progressSeconds, 0)),

    durationSeconds:
      typeof entry.durationSeconds === "number" &&
      Number.isFinite(entry.durationSeconds)
        ? entry.durationSeconds
        : previous?.durationSeconds,

    watchedAt: Date.now(),

    aniListMediaId: entry.aniListMediaId ?? previous?.aniListMediaId,

    coverUrl: entry.coverUrl ?? previous?.coverUrl,

    catalogProvider: entry.catalogProvider,

    legacyProvider: entry.legacyProvider ?? previous?.legacyProvider,
  };

  const filtered = existing.filter(
    (item) =>
      !(item.animeId === entry.animeId && item.episode === entry.episode),
  );

  filtered.unshift(normalizedEntry);

  writeHistory(filtered);
}

export function replaceLegacyHistoryEntry(
  entry: HistoryEntry,
  replacement: {
    id: string;
    name: string;
    episodes: number;
    aniListMediaId?: number;
    coverUrl?: string;
  },
): HistoryEntry {
  const migrated: HistoryEntry = {
    ...entry,

    animeId: replacement.id,
    animeName: replacement.name,

    aniListMediaId: replacement.aniListMediaId ?? entry.aniListMediaId,

    coverUrl: replacement.coverUrl ?? entry.coverUrl,

    catalogProvider: "anidb",

    legacyProvider: undefined,
  };

  const entries = readHistory().map((candidate) =>
    candidate.legacyProvider === "miruro" &&
    candidate.animeId === entry.animeId &&
    candidate.animeName === entry.animeName
      ? {
          ...candidate,
          ...migrated,
          episode: candidate.episode,
          progressSeconds: candidate.progressSeconds,
          watchedAt: candidate.watchedAt,
        }
      : candidate,
  );

  writeHistory(entries);

  return migrated;
}

export function clearHistory() {
  try {
    localStorage.removeItem(HISTORY_KEY);
  } catch {
    // Ignore storage failures
  }
}

/* -----------------------------
   History UI helpers
----------------------------- */

export function getProgressPercent(entry: HistoryEntry): number {
  if (!entry.durationSeconds || entry.durationSeconds <= 0) {
    return 0;
  }

  return Math.min(
    100,
    Math.max(
      0,
      Math.round((entry.progressSeconds / entry.durationSeconds) * 100),
    ),
  );
}

export function getHistoryGroups(entries = readHistory()): HistoryGroup[] {
  const groups = new Map<string, HistoryEntry[]>();

  for (const entry of entries) {
    const current = groups.get(entry.animeId) ?? [];

    current.push(entry);

    groups.set(entry.animeId, current);
  }

  return Array.from(groups.values())

    .map((items) => {
      const sorted = items.sort((a, b) => b.watchedAt - a.watchedAt);

      const latest = sorted[0];

      return {
        animeId: latest.animeId,
        animeName: latest.animeName,

        coverUrl: latest.coverUrl,

        aniListMediaId: latest.aniListMediaId,

        catalogProvider: latest.catalogProvider,

        latest,

        episodesWatched: new Set(items.map((item) => item.episode)).size,

        lastWatchedAt: latest.watchedAt,

        progressPercent: getProgressPercent(latest),
      };
    })

    .sort((a, b) => b.lastWatchedAt - a.lastWatchedAt);
}

export function getContinueWatching(entries = readHistory()): HistoryGroup[] {
  return getHistoryGroups(entries).filter(({ latest }) => {
    if (!latest.durationSeconds) {
      return latest.progressSeconds > 30;
    }

    return (
      latest.progressSeconds > 30 &&
      latest.progressSeconds < latest.durationSeconds - 60
    );
  });
}

export function getRecentHistory(
  entries = readHistory(),
  limit = 10,
): HistoryEntry[] {
  return entries
    .slice()
    .sort((a, b) => b.watchedAt - a.watchedAt)
    .slice(0, limit);
}
