import type { AdBlockSettings, AdBlockState } from '../../src/adblock-types'
import type { AnimeDetails, AnimeSummary, AniListProfile, DashboardData, ListUpdateInput, MediaListState } from '../../src/anilist-types'
import type { AnimeSearchResult, CatalogProvider, TranslationType } from '../../src/catalog-types'
import type { DownloadJob, DownloadRequest, DownloadState } from '../../src/download-types'
import type { DiscordPresenceSettings } from '../../src/discord-presence-types'
import type { RemoteNoticeState } from '../../src/remote-notice-types'
import type { UpdateState } from '../../src/updater-types'
import { EMPTY_VIEWING_SUMMARY } from '../../src/viewing-types'
import type { WatchTogetherContent, WatchTogetherMessage, WatchTogetherPlaybackState, WatchTogetherState } from '../../src/watch-together-types'

const NOW = Date.parse('2026-07-23T12:00:00Z')
const DEMO_ID = 'showcase:starfall-atelier'

function poster(title: string, from: string, to: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="460" height="650"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><circle cx="350" cy="150" r="110" fill="white" opacity=".12"/><path d="M40 500 Q230 310 420 500 V650 H40Z" fill="#09090b" opacity=".65"/><text x="38" y="555" fill="white" font-family="Segoe UI" font-size="38" font-weight="700">${title}</text><text x="40" y="600" fill="white" opacity=".72" font-family="Segoe UI" font-size="18">ANIPLAY ORIGINAL</text></svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

const shows: AnimeSearchResult[] = [
  { id: DEMO_ID, name: 'Starfall Atelier', episodes: 12, aniListMediaId: 900001, coverUrl: poster('Starfall Atelier', '#ff5b3d', '#5227a7'), catalogProvider: 'anikoto' },
  { id: 'showcase:signal-bloom', name: 'Signal Bloom', episodes: 10, aniListMediaId: 900002, coverUrl: poster('Signal Bloom', '#00a896', '#052f5f'), catalogProvider: 'anikoto' },
  { id: 'showcase:moonlit-circuit', name: 'Moonlit Circuit', episodes: 24, aniListMediaId: 900003, coverUrl: poster('Moonlit Circuit', '#e056fd', '#30336b'), catalogProvider: 'anikoto' },
]

function summary(index: number, progress?: number): AnimeSummary {
  const show = shows[index]
  return {
    id: show.aniListMediaId!, title: show.name, titleEnglish: show.name, titleRomaji: show.name,
    synonyms: [], coverUrl: show.coverUrl!, bannerUrl: show.coverUrl, accentColor: index === 0 ? '#ff5b3d' : '#7c5cff',
    format: 'TV', seasonYear: 2026, episodes: show.episodes, averageScore: 84 - index * 3,
    ...(progress === undefined ? {} : { listState: { id: 7000 + index, status: 'CURRENT' as const, progress, score: 8 + index, repeat: 0 } }),
  }
}

const dashboard: DashboardData = {
  session: { authenticated: true, configured: true, user: { id: 424242, name: 'AniPlayDemo', avatar: shows[0].coverUrl }, expiresAt: NOW + 86_400_000 },
  trending: [summary(0), summary(1), summary(2)], seasonal: [summary(1), summary(0)], recommendations: [summary(2), summary(1)],
  airing: [{ media: summary(0, 3), episode: 4, airingAt: Math.floor((NOW + 3_600_000) / 1000) }],
  current: [summary(0, 3), summary(1, 6)], planning: [summary(2)], completed: [], paused: [], dropped: [], repeating: [], stale: false,
}

const details = new Map<number, AnimeDetails>(shows.map((show, index) => [show.aniListMediaId!, {
  ...summary(index, index === 0 ? 3 : undefined),
  description: 'A synthetic AniPlay showcase title about friends building impossible worlds together.',
  genres: ['Adventure', 'Fantasy', 'Sci-Fi'], status: 'RELEASING', season: 'SUMMER', relations: [], recommendations: [summary((index + 1) % shows.length)],
}]))

const profile: AniListProfile = {
  user: { id: 424242, name: 'AniPlayDemo', avatar: shows[0].coverUrl, bannerImage: shows[1].coverUrl, about: 'A deterministic showcase profile. No real AniList account is used.' },
  stats: {
    count: 128, episodesWatched: 1842, minutesWatched: 43_920, meanScore: 82,
    statuses: [{ label: 'Completed', count: 91 }, { label: 'Current', count: 14 }, { label: 'Planning', count: 23 }],
    genres: [{ label: 'Adventure', count: 68, meanScore: 84 }, { label: 'Fantasy', count: 57, meanScore: 86 }, { label: 'Sci-Fi', count: 42, meanScore: 81 }],
  },
  achievementFacts: { currentlyAiring: 8, hiddenGems: 13, completedLong50: 17, completedLong100: 4, completedShort12: 38, completedShounen: 22, sliceOfLifeEpisodes: 240 },
  favourites: [summary(0), summary(1), summary(2)],
}

function idleRoom(): WatchTogetherState {
  return { code: '', connected: false, role: 'host', content: null, playback: null, participants: [], chat: [], status: 'idle', endpoint: 'showcase://watch-together', error: null }
}

function clone<T>(value: T): T {
  return structuredClone(value)
}

export function createShowcaseApi(mediaUrl = process.env.ANIPLAY_SHOWCASE_VIDEO_URL ?? '', subtitleUrl = process.env.ANIPLAY_SHOWCASE_SUBTITLE_URL ?? '') {
  let room = idleRoom()
  const downloads: DownloadState = { jobs: [], settings: { directory: 'C:\\AniPlay Showcase\\Downloads' }, ffmpegAvailable: true, ffmpegError: null }
  let adBlock: AdBlockState = { mode: 'balanced', blockKnownAdHosts: true, active: true, listCount: 3, blockedCount: 7, totalBlockedCount: 128 }
  let discord: DiscordPresenceSettings = { enabled: true, connected: true }
  const roomListeners = new Set<(state: WatchTogetherState) => void>()
  const downloadListeners = new Set<(state: DownloadState) => void>()
  const updateListeners = new Set<(state: UpdateState) => void>()
  const noticeListeners = new Set<(state: RemoteNoticeState) => void>()

  const emitRoom = () => roomListeners.forEach((listener) => listener(clone(room)))
  const emitDownloads = () => downloadListeners.forEach((listener) => listener(clone(downloads)))
  const updateState: UpdateState = { phase: 'idle', currentVersion: '1.16.5-showcase', canCheck: false, canInstall: false }
  const noticeState: RemoteNoticeState = { notices: [], stale: false, fetchedAt: new Date(NOW).toISOString() }
  const ok = <T>(data?: T) => ({ success: true, ...(data === undefined ? {} : { data }) })

  const api = {
    search: async (query: string, _translationType: TranslationType, provider: CatalogProvider) => ok(shows.filter((show) => show.name.toLowerCase().includes(query.toLowerCase())).map((show) => ({ ...show, catalogProvider: provider }))),
    getEpisodes: async () => ok(Array.from({ length: 12 }, (_value, index) => String(index + 1))),
    getEpisodeLinks: async () => ok([{ url: mediaUrl, resolution: '1080p', hls: false, provider: 'AniPlay Showcase', downloadable: true, subtitles: subtitleUrl ? [{ label: 'English', url: subtitleUrl }] : [] }]),
    openProviderEpisode: async () => ok<void>(),
    getCiphermapInfo: async () => ok(null),
    getAllAnimeDebugInfo: async () => ({ source: 'fallback' as const, epoch: 0, buildId: 'showcase', partA: '', partB: '', derivedKeyHex: '', queryHash: '', apiUrl: 'showcase://allanime', referer: 'showcase://', fetchedAt: new Date(NOW).toISOString(), cacheExpiresAt: new Date(NOW).toISOString(), legacyCtr: false }),
    exportAllAnimeDebugInfo: async () => ({ saved: false }),
    syncCiphermap: async () => ({ success: false as const, error: 'Disabled in showcase mode' }),
    openProjectPage: async () => ({ success: true }),
    aniList: {
      auth: { status: async () => clone(dashboard.session), start: async () => clone(dashboard.session), logout: async () => clone(dashboard.session) },
      dashboard: { get: async () => clone(dashboard) },
      profile: { get: async () => clone(profile), export: async () => ({ saved: false }) },
      media: { get: async (id: number) => clone(details.get(id) ?? details.get(900001)!), search: async (query: string) => clone([...details.values()].filter((item) => item.title.toLowerCase().includes(query.toLowerCase()))) },
      list: {
        update: async (input: ListUpdateInput): Promise<MediaListState> => ({ id: 7000, status: input.status, progress: input.progress ?? 0, score: input.score ?? 0, repeat: input.repeat ?? 0 }),
        delete: async () => true,
      },
      mapping: {
        resolve: async (_media: AnimeSummary, candidates: AnimeSearchResult[], translationType: TranslationType) => ({ candidates: candidates.map((anime) => ({ anime, confidence: 1, reasons: ['Showcase fixture'] })), autoMatched: true, mapping: candidates[0] ? { mediaId: 900001, scraperId: candidates[0].id, scraperName: candidates[0].name, episodes: candidates[0].episodes, catalogProvider: candidates[0].catalogProvider, translationType, confirmedAt: NOW } : undefined }),
        confirm: async (mediaId: number, anime: AnimeSearchResult, translationType: TranslationType) => ({ mediaId, scraperId: anime.id, scraperName: anime.name, episodes: anime.episodes, catalogProvider: anime.catalogProvider, translationType, confirmedAt: NOW }),
        forget: async () => true,
        enrich: async (anime: AnimeSearchResult) => clone(details.get(anime.aniListMediaId ?? 900001) ?? null),
      },
    },
    viewing: { getSummary: async () => clone({ ...EMPTY_VIEWING_SUMMARY, segmentCount: 48, totalActiveSeconds: 86_400 }), append: async () => clone({ ...EMPTY_VIEWING_SUMMARY, segmentCount: 49, totalActiveSeconds: 86_460 }) },
    discordPresence: { getSettings: async () => clone(discord), setEnabled: async (enabled: boolean) => (discord = { enabled, connected: enabled }), update: async () => clone(discord), clear: async () => undefined },
    graphics: { getSettings: async () => ({ safeGraphicsMode: false, active: false, restartRequired: false, launchOverride: false }), setSafeMode: async (enabled: boolean) => ({ safeGraphicsMode: enabled, active: false, restartRequired: true, launchOverride: false }) },
    watchTogether: {
      getConfig: async () => ({ available: true, endpoint: 'showcase://watch-together', message: null }), getState: async () => clone(room),
      create: async (input: { content: WatchTogetherContent; playback?: WatchTogetherPlaybackState }) => {
        room = { code: 'DEMO42ROOM', connected: true, role: 'host', content: input.content, playback: input.playback ?? { position: 0, paused: true, revision: 1 }, status: 'connected', endpoint: 'showcase://watch-together', error: null,
          participants: [{ id: 'host', aniListId: 424242, name: 'AniPlayDemo', avatar: shows[0].coverUrl, role: 'host', ready: true, connected: true }, { id: 'guest', aniListId: 515151, name: 'DemoFriend', avatar: shows[1].coverUrl, role: 'guest', ready: true, connected: true }],
          chat: [{ id: 'welcome', authorId: 'guest', authorName: 'DemoFriend', body: 'Ready when you are!', createdAt: new Date(NOW).toISOString() }], serverTime: new Date(NOW).toISOString() }
        emitRoom(); return clone(room)
      },
      join: async () => clone(room), leave: async () => { room = idleRoom(); emitRoom() }, reconnect: async () => { room.connected = true; room.status = 'connected'; emitRoom(); return clone(room) },
      sendChat: async (body: string) => { const message: WatchTogetherMessage = { id: `message-${room.chat.length}`, authorId: 'host', authorName: 'AniPlayDemo', body, createdAt: new Date(NOW + room.chat.length * 1000).toISOString() }; room.chat.push(message); emitRoom() },
      updatePlayback: async (payload: WatchTogetherPlaybackState) => { room.playback = { ...payload, revision: (room.playback?.revision ?? 0) + 1 }; emitRoom() },
      setContent: async (content: WatchTogetherContent) => { room.content = content; emitRoom() }, setReady: async (ready: boolean) => { if (room.participants[0]) room.participants[0].ready = ready; emitRoom() }, consumeInvite: async () => undefined,
      onInvite: () => () => undefined, onChanged: (callback: (state: WatchTogetherState) => void) => { roomListeners.add(callback); return () => roomListeners.delete(callback) },
    },
    adBlock: { getState: async () => clone(adBlock), setSettings: async (settings: Partial<AdBlockSettings>) => (adBlock = { ...adBlock, ...settings }) },
    updater: { getState: async () => clone(updateState), check: async () => clone(updateState), download: async () => clone(updateState), install: async () => undefined, onChanged: (callback: (state: UpdateState) => void) => { updateListeners.add(callback); return () => updateListeners.delete(callback) } },
    notices: { getState: async () => clone(noticeState), refresh: async () => clone(noticeState), dismiss: async () => clone(noticeState), open: async () => false, onChanged: (callback: (state: RemoteNoticeState) => void) => { noticeListeners.add(callback); return () => noticeListeners.delete(callback) } },
    downloads: {
      getState: async () => clone(downloads),
      start: async (request: DownloadRequest) => {
        const job: DownloadJob = { id: `demo-download-${downloads.jobs.length + 1}`, request, status: 'downloading', progress: { percent: 18, processedSeconds: 5 }, fileName: `${request.animeName} - Episode ${request.episode}.mp4`, outputPath: `${downloads.settings.directory}\\${request.animeName} - Episode ${request.episode}.mp4`, error: null, createdAt: NOW, updatedAt: NOW }
        downloads.jobs.unshift(job); emitDownloads()
        for (const [delay, percent] of [[350, 52], [700, 84], [1050, 100]] as const) setTimeout(() => { job.progress = { percent, processedSeconds: percent / 4 }; job.status = percent === 100 ? 'completed' : 'downloading'; job.updatedAt = NOW + delay; emitDownloads() }, delay)
        return { success: true, job: clone(job) }
      },
      cancel: async (id: string) => { const job = downloads.jobs.find((item) => item.id === id); if (job) job.status = 'cancelled'; emitDownloads(); return { success: Boolean(job), job: job ? clone(job) : undefined } },
      retry: async (id: string) => { const job = downloads.jobs.find((item) => item.id === id); if (job) job.status = 'queued'; emitDownloads(); return { success: Boolean(job), job: job ? clone(job) : undefined } },
      clearFinished: async () => { downloads.jobs = downloads.jobs.filter((job) => !['completed', 'failed', 'cancelled'].includes(job.status)); emitDownloads(); return { success: true } },
      chooseDirectory: async () => clone(downloads), reveal: async () => ({ success: true }), onChanged: (callback: (state: DownloadState) => void) => { downloadListeners.add(callback); return () => downloadListeners.delete(callback) },
    },
  }
  return api
}
