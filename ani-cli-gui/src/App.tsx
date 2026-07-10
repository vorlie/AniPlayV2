import { lazy, Suspense, useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { BrowsePage } from './pages/BrowsePage'
import { HistoryPage } from './pages/HistoryPage'
import { AnimePage } from './pages/AnimePage'
import { HomePage } from './pages/HomePage'
import { Navigation } from './components/Navigation'
import { AppNotifications, type AppNotification, type AppNotificationKind } from './components/AppNotifications'
import type { HistoryEntry } from './lib/history'
import type { DownloadState } from './download-types'
import { DownloadsPage } from './pages/DownloadsPage'
import { RemoteNoticeBanner } from './components/RemoteNoticeBanner'
import type { CatalogProvider } from './catalog-types'
import type { UpdateState } from './updater-types'
import { playNotificationSound, shouldPlayNotificationSound, type NotificationSoundLevel } from './lib/notification-sounds'

interface AnimeSelection {
  id: string
  name: string
  episodes: number
  aniListMediaId?: number
  coverUrl?: string
  catalogProvider: CatalogProvider
}

const SettingsPage = lazy(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })))

const LOGO_CLICK_TARGET = 7
const LOGO_CLICK_WINDOW_MS = 4000

function createNotification(title: string, body: string | undefined, kind: AppNotificationKind, durationMs?: number): AppNotification {
  return {
    id: `${Date.now()}:${Math.random().toString(36).slice(2)}`,
    title,
    body,
    kind,
    createdAt: Date.now(),
    durationMs,
  }
}

function initialNotifications(): AppNotification[] {
  const today = new Date()
  if (today.getMonth() !== 3 || today.getDate() !== 1) return []
  return [createNotification('Experimental filler detector enabled', 'Accuracy may vary wildly today.', 'easter-egg', 7000)]
}

function App() {
  const [activeTab, setActiveTab] = useState('home')
  const [searchQuery, setSearchQuery] = useState('')
  const [results, setResults] = useState<AnimeSelection[]>([])
  const [activeAnime, setActiveAnime] = useState<AnimeSelection | null>(null)
  const [resumeEpisode, setResumeEpisode] = useState<string | null>(null)
  const [resumeProgressSeconds, setResumeProgressSeconds] = useState<number | null>(null)
  const [downloadState, setDownloadState] = useState<DownloadState | null>(null)
  const [homeAniListOpenRequest, setHomeAniListOpenRequest] = useState<{ id: number; nonce: number } | null>(null)
  const [notifications, setNotifications] = useState<AppNotification[]>(initialNotifications)
  const [secretSakuraMode, setSecretSakuraMode] = useState(false)
  const logoClickTimesRef = useRef<number[]>([])
  const watchedEpisodesRef = useRef(new Set<string>())
  const watchBadgeThresholdsRef = useRef(new Set<number>())
  const updateNotificationKeysRef = useRef(new Set<string>())

  const dismissNotification = useCallback((id: string) => {
    setNotifications((items) => items.filter((item) => item.id !== id))
  }, [])

  const notify = useCallback((title: string, body: string | undefined, kind: AppNotificationKind = 'info', durationMs?: number, sound: NotificationSoundLevel = 'silent') => {
    setNotifications((items) => [...items, createNotification(title, body, kind, durationMs)].slice(-4))
    if (shouldPlayNotificationSound(sound)) playNotificationSound()
  }, [])

  useEffect(() => {
    if (!window.aniPlay) return
    void window.aniPlay.downloads.getState().then(setDownloadState)
    return window.aniPlay.downloads.onChanged(setDownloadState)
  }, [])

  const notifyUpdateState = useCallback((state: UpdateState) => {
    if (state.phase !== 'available' && state.phase !== 'downloaded') return
    const version = state.availableVersion ?? 'the latest version'
    const key = `${state.phase}:${version}`
    if (updateNotificationKeysRef.current.has(key)) return
    updateNotificationKeysRef.current.add(key)

    if (state.phase === 'available') {
      notify(`AniPlay ${version} is available`, 'Open Settings to download the update.', 'info', 8000, 'important')
      return
    }

    notify(`AniPlay ${version} is ready`, 'Open Settings to restart and install.', 'success', 8000, 'important')
  }, [notify])

  useEffect(() => {
    if (!window.aniPlay) return
    void window.aniPlay.updater.getState().then(notifyUpdateState).catch(() => {})
    return window.aniPlay.updater.onChanged(notifyUpdateState)
  }, [notifyUpdateState])

  const activeDownloadCount = downloadState?.jobs.filter((job) => ['queued', 'resolving', 'downloading'].includes(job.status)).length ?? 0

  const handleResumeFromHistory = (item: HistoryEntry) => {
    setActiveTab('player')
    setActiveAnime({
      id: item.animeId,
      name: item.animeName,
      episodes: 0,
      aniListMediaId: item.aniListMediaId,
      coverUrl: item.coverUrl,
      catalogProvider: item.catalogProvider,
    })
    setResumeEpisode(item.episode)
    setResumeProgressSeconds(item.progressSeconds)
  }

  const handleSelectAnime = (anime: AnimeSelection, options?: { episode?: string | null; resumeSeconds?: number | null }) => {
    setResumeEpisode(options?.episode ?? null)
    setResumeProgressSeconds(options?.resumeSeconds ?? null)
    setActiveTab('player')
    setActiveAnime(anime)
  }

  const handleOpenAniListMedia = (id: number) => {
    setHomeAniListOpenRequest({ id, nonce: Date.now() })
    setActiveTab('home')
  }

  const handleLogoClick = () => {
    if (secretSakuraMode) return
    const now = Date.now()
    logoClickTimesRef.current = [...logoClickTimesRef.current.filter((time) => now - time <= LOGO_CLICK_WINDOW_MS), now]
    if (logoClickTimesRef.current.length < LOGO_CLICK_TARGET) return
    logoClickTimesRef.current = []
    setSecretSakuraMode(true)
    notify('Secret theme unlocked', 'Midnight Sakura mode enabled for this session.', 'easter-egg', 7000)
  }

  const handleEpisodeStarted = useCallback((animeId: string, episode: string) => {
    const key = `${animeId}:${episode}`
    if (watchedEpisodesRef.current.has(key)) return
    watchedEpisodesRef.current.add(key)

    const count = watchedEpisodesRef.current.size
    if (count >= 6 && !watchBadgeThresholdsRef.current.has(6)) {
      watchBadgeThresholdsRef.current.add(6)
      notify('One more episode protocol engaged', 'Six unique episodes started this session.', 'easter-egg', 7000)
      return
    }
    if (count >= 3 && !watchBadgeThresholdsRef.current.has(3)) {
      watchBadgeThresholdsRef.current.add(3)
      notify('Marathon mode detected', 'Three unique episodes started this session.', 'easter-egg', 6500)
    }
  }, [notify])

  return (
    <div className={`min-h-screen bg-m3-surface text-m3-on-surface p-3 md:p-5 relative overflow-hidden flex flex-col ${secretSakuraMode ? 'secret-sakura-mode' : ''}`}>
      {/* Background Floats */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-m3-primary/10 blur-[120px] rounded-full animate-blob"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-[--custom-display-name-styles-dark-1-color] opacity-20 blur-[120px] rounded-full animate-blob animation-delay-2000"></div>
      </div>

      {/* Header */}
      <header className="relative z-10 w-full max-w-[1500px] mx-auto flex items-center justify-between gap-3 mb-4 md:mb-5 draggable" style={{ WebkitAppRegion: 'drag' } as CSSProperties}>
        <div className="effect-container items-center gap-3">
          <button type="button" onClick={handleLogoClick} className="effect-neon aniplay-logo-button font-sakura text-3xl md:text-4xl tracking-wide select-none" aria-label="AniPlay">
            <span className="glow-layer">AniPlay</span>
            <span className="text-layer">AniPlay</span>
          </button>
          <span className="hidden lg:inline text-xs font-bold uppercase tracking-[0.18em] text-m3-on-surface-variant">watch without the clutter</span>
        </div>
        <Navigation activeTab={activeTab} setActiveTab={setActiveTab} hasActivePlayer={activeAnime !== null} downloadCount={activeDownloadCount} />
      </header>

      {/* Main Content Area */}
      <main className="relative z-10 flex-1 flex flex-col w-full max-w-[1500px] mx-auto pb-20 md:pb-4">
        <div className="mb-4">
          <RemoteNoticeBanner provider={activeAnime?.catalogProvider} />
        </div>

        <div className={activeTab === 'home' ? 'flex flex-1 flex-col' : 'hidden'} aria-hidden={activeTab !== 'home'}>
          <HomePage
            key={homeAniListOpenRequest ? `anilist-${homeAniListOpenRequest.nonce}` : 'home'}
            setSearchQuery={setSearchQuery}
            setResults={setResults}
            onSelectAnime={handleSelectAnime}
            onResume={handleResumeFromHistory}
            initialSelectedId={homeAniListOpenRequest?.id ?? null}
            onClearInitialSelection={() => setHomeAniListOpenRequest(null)}
          />
        </div>

        {activeTab === 'search' && (
          <BrowsePage
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            results={results}
            setResults={setResults}
            onSelectAnime={handleSelectAnime}
            onOpenAniListMedia={handleOpenAniListMedia}
          />
        )}

        {activeAnime && (
          <div className={activeTab === 'player' ? 'flex flex-1 flex-col' : 'hidden'} aria-hidden={activeTab !== 'player'}>
            <AnimePage
              key={activeAnime.id}
              anime={activeAnime}
              initialEpisode={resumeEpisode}
              initialResumeSeconds={resumeProgressSeconds}
              onEpisodeStarted={handleEpisodeStarted}
              onBack={() => {
                setActiveAnime(null)
                setResumeEpisode(null)
                setResumeProgressSeconds(null)
                setActiveTab('search')
              }}
            />
          </div>
        )}

        {activeTab === 'history' && (
          <HistoryPage onResume={handleResumeFromHistory} />
        )}

        {activeTab === 'downloads' && <DownloadsPage state={downloadState} />}

        {activeTab === 'settings' && (
          <Suspense fallback={
            <div className="m3-card flex-1 min-h-[220px] flex items-center justify-center text-m3-on-surface-variant text-sm">
              Loading settings...
            </div>
          }>
            <SettingsPage />
          </Suspense>
         )}
      </main>

      <AppNotifications items={notifications} onDismiss={dismissNotification} />
    </div>
  )
}

export default App
