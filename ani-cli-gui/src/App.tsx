import { lazy, Suspense, useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { BrowsePage } from './pages/BrowsePage'
import { HistoryPage } from './pages/HistoryPage'
import { AnimePage } from './pages/AnimePage'
import { AniListPage } from './pages/AniListPage'
import { Navigation } from './components/Navigation'
import { AppNotifications, type AppNotification, type AppNotificationKind } from './components/AppNotifications'
import { useTranslation } from 'react-i18next'
import { replaceLegacyHistoryEntry, type HistoryEntry } from './lib/history'
import { invokeSearch } from './lib/api'
import type { DownloadState } from './download-types'
import { DownloadsPage } from './pages/DownloadsPage'
import { RemoteNoticeBanner } from './components/RemoteNoticeBanner'
import type { CatalogProvider, TranslationType } from './catalog-types'
import type { UpdateState } from './updater-types'
import { playNotificationSound, shouldPlayNotificationSound, type NotificationSoundLevel } from './lib/notification-sounds'
import { WatchTogetherSetupDialog } from './components/WatchTogetherSetupDialog'
import { Sparkles } from 'lucide-react'
import type { WatchTogetherCreateContext } from './watch-together-types'
import { useWatchTogether } from './contexts/WatchTogetherContext'

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
const TEST_BUILD_VERSION_PATTERN = /-(?:test|alpha|beta|rc)\b/i

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
  return []
}

function App() {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState('anilist')
  const [searchQuery, setSearchQuery] = useState('')
  const [results, setResults] = useState<AnimeSelection[]>([])
  const [activeAnime, setActiveAnime] = useState<AnimeSelection | null>(null)
  const [resumeEpisode, setResumeEpisode] = useState<string | null>(null)
  const [resumeProgressSeconds, setResumeProgressSeconds] = useState<number | null>(null)
  const [resumeTranslationType, setResumeTranslationType] = useState<TranslationType | null>(null)
  const [downloadState, setDownloadState] = useState<DownloadState | null>(null)
  const [aniListOpenRequest, setAniListOpenRequest] = useState<{ id: number; nonce: number } | null>(null)
  const [notifications, setNotifications] = useState<AppNotification[]>(initialNotifications)
  const [appVersion, setAppVersion] = useState<string | null>(null)
  const [secretSakuraMode, setSecretSakuraMode] = useState(false)
  const [watchTogetherOpen, setWatchTogetherOpen] = useState(false)
  const [watchTogetherContext, setWatchTogetherContext] = useState<WatchTogetherCreateContext | null>(null)
  const [watchTogetherPlayerNonce, setWatchTogetherPlayerNonce] = useState(0)
  const { state: watchTogetherState, inviteCode: watchTogetherInviteCode, setCompanionOpen } = useWatchTogether()
  const logoClickTimesRef = useRef<number[]>([])
  const watchedEpisodesRef = useRef(new Set<string>())
  const watchBadgeThresholdsRef = useRef(new Set<number>())
  const updateNotificationKeysRef = useRef(new Set<string>())
  const watchTogetherContentKeyRef = useRef<string | null>(null)

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

  useEffect(() => {
    const room = watchTogetherState
    if (!room?.connected || !room.content) {
      if (room?.status === 'idle') watchTogetherContentKeyRef.current = null
      return
    }
    const content = room.content
    const contentKey = `${room.code}:${content.provider}:${content.showId}:${content.episode}:${content.translationType}`
    if (watchTogetherContentKeyRef.current === contentKey) return
    watchTogetherContentKeyRef.current = contentKey
    setActiveAnime((current) => {
      if (current?.id === content.showId && current.catalogProvider === content.provider) return current
      return {
        id: content.showId,
        name: content.animeName,
        episodes: 0,
        aniListMediaId: content.aniListMediaId,
        catalogProvider: content.provider as CatalogProvider,
      }
    })
    setResumeEpisode(content.episode)
    setResumeProgressSeconds(room.playback?.position ?? 0)
    setResumeTranslationType(content.translationType)
    setActiveTab('player')
  }, [watchTogetherState])

  const openWatchTogether = useCallback(() => {
    if (watchTogetherState?.code) {
      setActiveTab('player')
      setCompanionOpen(true)
      return
    }
    setWatchTogetherOpen(true)
  }, [setCompanionOpen, watchTogetherState?.code])

  const openGlobalWatchTogether = useCallback(() => {
    if (watchTogetherState?.code) {
      setWatchTogetherPlayerNonce((nonce) => nonce + 1)
    }
    openWatchTogether()
  }, [openWatchTogether, watchTogetherState?.code])

  const notifyUpdateState = useCallback((state: UpdateState) => {
    setAppVersion(state.currentVersion)
    if (state.phase !== 'available' && state.phase !== 'downloaded') return
    const version = state.availableVersion ?? 'the latest version'
    const key = `${state.phase}:${version}`
    if (updateNotificationKeysRef.current.has(key)) return
    updateNotificationKeysRef.current.add(key)

    if (state.phase === 'available') {
      notify(t('notifications.updateAvailableTitle', { version }), t('notifications.updateAvailableBody'), 'info', 8000, 'important')
      return
    }

    notify(t('notifications.updateReadyTitle', { version }), t('notifications.updateReadyBody'), 'success', 8000, 'important')
  }, [notify, t])

  useEffect(() => {
    if (!window.aniPlay) return
    void window.aniPlay.updater.getState().then(notifyUpdateState).catch(() => {})
    return window.aniPlay.updater.onChanged(notifyUpdateState)
  }, [notifyUpdateState])

  useEffect(() => {
    const today = new Date()
    if (today.getMonth() !== 3 || today.getDate() !== 1) return
    const timer = window.setTimeout(() => notify(t('notifications.aprilTitle'), t('notifications.aprilBody'), 'easter-egg', 7000), 0)
    return () => window.clearTimeout(timer)
  }, [notify, t])

  const activeDownloadCount = downloadState?.jobs.filter((job) => ['queued', 'resolving', 'downloading'].includes(job.status)).length ?? 0
  const isTestBuild = appVersion ? TEST_BUILD_VERSION_PATTERN.test(appVersion) : false

  const handleResumeFromHistory = async (historyItem: HistoryEntry) => {
    let item = historyItem
    if (item.legacyProvider === 'miruro') {
      const response = await invokeSearch(item.animeName, 'anidb')
      if (!response.success || !response.data?.length) {
        notify('AniDB.app migration', response.error || `No AniDB.app match was found for ${item.animeName}`, 'warning')
        return
      }
      const normalized = item.animeName.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
      const exact = response.data.filter((candidate) => candidate.name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim() === normalized)
      let replacement = exact.length === 1 ? exact[0] : undefined
      if (!replacement) {
        const candidates = response.data.slice(0, 8)
        const answer = window.prompt(`Choose the AniDB.app match for "${item.animeName}":\n${candidates.map((candidate, index) => `${index + 1}. ${candidate.name}`).join('\n')}`, '1')
        const index = Number(answer) - 1
        if (!Number.isInteger(index) || !candidates[index]) return
        replacement = candidates[index]
      }
      item = replaceLegacyHistoryEntry(item, replacement)
    }
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
    setResumeTranslationType(null)
  }

  const handleSelectAnime = (anime: AnimeSelection, options?: { episode?: string | null; resumeSeconds?: number | null }) => {
    setResumeEpisode(options?.episode ?? null)
    setResumeProgressSeconds(options?.resumeSeconds ?? null)
    setResumeTranslationType(null)
    setActiveTab('player')
    setActiveAnime(anime)
  }

  const handleOpenAniListMedia = (id: number) => {
    setAniListOpenRequest({ id, nonce: Date.now() })
    setActiveTab('anilist')
  }

  const handleLogoClick = () => {
    if (secretSakuraMode) return
    const now = Date.now()
    logoClickTimesRef.current = [...logoClickTimesRef.current.filter((time) => now - time <= LOGO_CLICK_WINDOW_MS), now]
    if (logoClickTimesRef.current.length < LOGO_CLICK_TARGET) return
    logoClickTimesRef.current = []
    setSecretSakuraMode(true)
    notify(t('notifications.secretTitle'), t('notifications.secretBody'), 'easter-egg', 7000)
  }

  const handleEpisodeStarted = useCallback((animeId: string, episode: string) => {
    const key = `${animeId}:${episode}`
    if (watchedEpisodesRef.current.has(key)) return
    watchedEpisodesRef.current.add(key)

    const count = watchedEpisodesRef.current.size
    if (count >= 6 && !watchBadgeThresholdsRef.current.has(6)) {
      watchBadgeThresholdsRef.current.add(6)
      notify(t('notifications.protocolTitle'), t('notifications.protocolBody'), 'easter-egg', 7000)
      return
    }
    if (count >= 3 && !watchBadgeThresholdsRef.current.has(3)) {
      watchBadgeThresholdsRef.current.add(3)
      notify(t('notifications.marathonTitle'), t('notifications.marathonBody'), 'easter-egg', 6500)
    }
  }, [notify, t])

  return (
    <div className={`app-shell min-h-screen bg-m3-surface text-m3-on-surface p-3 md:p-5 relative overflow-hidden flex flex-col ${secretSakuraMode ? 'secret-sakura-mode' : ''}`}>
      {/* Background Floats */}
      <div className="ambient-background absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-m3-primary/10 blur-[120px] rounded-full animate-blob"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-[--custom-display-name-styles-dark-1-color] opacity-20 blur-[120px] rounded-full animate-blob animation-delay-2000"></div>
      </div>

      {/* Header */}
      <header className="app-header relative z-10 w-full max-w-[1500px] mx-auto flex items-center justify-between gap-3 mb-4 md:mb-5 draggable" style={{ WebkitAppRegion: 'drag' } as CSSProperties}>
        <div className="effect-container items-center gap-3">
          <button type="button" onClick={handleLogoClick} className="effect-neon aniplay-logo-button font-sakura text-3xl md:text-4xl tracking-wide select-none" aria-label="AniPlay">
            <span className="glow-layer">AniPlay</span>
            <span className="text-layer">AniPlay</span>
          </button>
          <span className="hidden lg:inline text-xs font-bold uppercase tracking-[0.18em] text-m3-on-surface-variant">{t('app.tagline')}</span>
          {isTestBuild && (
            <span className="hidden sm:inline-flex rounded-full border border-amber-300/35 bg-amber-300/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-amber-100">
              {t('app.testBuild', { version: appVersion })}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}>
          <button type="button" onClick={openGlobalWatchTogether} className="inline-flex items-center gap-2 rounded-full border border-m3-outline/20 bg-m3-surface-container/90 px-3 py-2 text-sm font-semibold text-m3-on-surface shadow-sm">
            <Sparkles size={16} />
            <span>{t('watchTogether.title')}</span>
          </button>
          <Navigation activeTab={activeTab} setActiveTab={setActiveTab} hasActivePlayer={activeAnime !== null} downloadCount={activeDownloadCount} />
        </div>
      </header>

      {/* Main Content Area */}
      <main className="app-main relative z-10 flex-1 flex flex-col w-full max-w-[1500px] mx-auto pb-20 md:pb-4">
        <div className="mb-4">
          <RemoteNoticeBanner provider={activeAnime?.catalogProvider} />
        </div>

        <div className={activeTab === 'anilist' ? 'flex flex-1 flex-col' : 'hidden'} aria-hidden={activeTab !== 'anilist'}>
          <AniListPage
            key={aniListOpenRequest?.nonce ?? 'anilist-workspace'}
            setSearchQuery={setSearchQuery}
            setResults={setResults}
            onSelectAnime={handleSelectAnime}
            onResume={handleResumeFromHistory}
            initialSelectedId={aniListOpenRequest?.id ?? null}
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
              key={`${activeAnime.id}:${resumeTranslationType ?? 'default'}:${watchTogetherPlayerNonce}`}
              anime={activeAnime}
              initialEpisode={resumeEpisode}
              initialResumeSeconds={resumeProgressSeconds}
              initialTranslationType={resumeTranslationType}
              onEpisodeStarted={handleEpisodeStarted}
              onOpenWatchTogether={openWatchTogether}
              onWatchTogetherContextChange={setWatchTogetherContext}
              onBack={() => {
                setActiveAnime(null)
                setResumeEpisode(null)
                setResumeProgressSeconds(null)
                setResumeTranslationType(null)
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
              {t('app.loadingSettings')}
            </div>
          }>
            <SettingsPage />
          </Suspense>
         )}
      </main>

      <AppNotifications items={notifications} onDismiss={dismissNotification} />
      <WatchTogetherSetupDialog key={watchTogetherInviteCode ?? 'watch-together'} anime={activeAnime ?? undefined} context={watchTogetherContext} isOpen={watchTogetherOpen || Boolean(watchTogetherInviteCode)} onOpenChange={setWatchTogetherOpen} />
    </div>
  )
}

export default App
