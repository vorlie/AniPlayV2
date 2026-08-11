import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { BrowsePage } from './pages/BrowsePage'
import { HistoryPage } from './pages/HistoryPage'
import { AnimePage } from './pages/AnimePage'
import { AniListPage } from './pages/AniListPage'
import { AppNotifications, type AppNotification, type AppNotificationKind } from './components/feedback/Toast/AppNotifications'
import { useTranslation } from 'react-i18next'
import { replaceLegacyHistoryEntry, type HistoryEntry } from './lib/history'
import { invokeSearch } from './lib/api'
import type { DownloadState } from './download-types'
import { DownloadsPage } from './pages/DownloadsPage'
import { RemoteNoticeBanner } from './components/feedback/Toast/RemoteNoticeBanner'
import type { CatalogProvider, TranslationType } from './catalog-types'
import type { UpdateState } from './updater-types'
import { playNotificationSound, shouldPlayNotificationSound, type NotificationSoundLevel } from './lib/notification-sounds'
import { WatchTogetherSetupDialog } from './components/aniplay/PlayerControls/WatchTogetherSetupDialog'
import { Sparkles, Minus, Square, X, Home, Search, Clock, Download, Settings } from 'lucide-react'
import type { WatchTogetherCreateContext } from './watch-together-types'
import { useWatchTogether } from './contexts/WatchTogetherContext'
import { Layout } from './components/layout/Layout'
import { type SidebarItem, type BreadcrumbItem } from './components/layout'

interface AnimeSelection {
  id: string
  name: string
  episodes: number
  aniListMediaId?: number
  coverUrl?: string
  catalogProvider: CatalogProvider
}

const SettingsPage = lazy(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })))

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
  const [torrentEpisodeRequest, setTorrentEpisodeRequest] = useState<{ episode: string; query: string; nonce: number } | null>(null)
  const [downloadState, setDownloadState] = useState<DownloadState | null>(null)
  const [aniListOpenRequest, setAniListOpenRequest] = useState<{ id: number; nonce: number } | null>(null)
  const [notifications, setNotifications] = useState<AppNotification[]>(initialNotifications)
  const [watchTogetherOpen, setWatchTogetherOpen] = useState(false)
  const [watchTogetherContext, setWatchTogetherContext] = useState<WatchTogetherCreateContext | null>(null)
  const [watchTogetherPlayerNonce, setWatchTogetherPlayerNonce] = useState(0)
  const { state: watchTogetherState, inviteCode: watchTogetherInviteCode, setCompanionOpen } = useWatchTogether()
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
    const aniPlay = window.aniPlay
    if (!aniPlay) return
    void aniPlay.downloads.getState().then(setDownloadState)
    return aniPlay.downloads.onChanged(setDownloadState)
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
    void window.aniPlay.updater.getState().then(notifyUpdateState).catch(() => { })
    return window.aniPlay.updater.onChanged(notifyUpdateState)
  }, [notifyUpdateState])

  useEffect(() => {
    const today = new Date()
    if (today.getMonth() !== 3 || today.getDate() !== 1) return
    const timer = window.setTimeout(() => notify(t('notifications.aprilTitle'), t('notifications.aprilBody'), 'easter-egg', 7000), 0)
    return () => window.clearTimeout(timer)
  }, [notify, t])

  const activeDownloadCount = downloadState?.jobs.filter((job) => ['queued', 'resolving', 'downloading'].includes(job.status)).length ?? 0

  // Sidebar navigation items
  const sidebarItems: SidebarItem[] = [
    { id: 'anilist', label: t('app.home'), icon: Home },
    { id: 'search', label: t('app.browse'), icon: Search },
    { id: 'history', label: t('app.history'), icon: Clock },
    { id: 'downloads', label: t('app.downloads'), icon: Download, badge: activeDownloadCount || undefined },
    { id: 'settings', label: t('app.settings'), icon: Settings },
  ]
  const nativeControls = window.aniPlay?.windowControls;
  // Window controls
  const windowControls = [
    { icon: Minus, label: 'Minimize', onClick: () => nativeControls?.minimize() },
    { icon: Square, label: 'Maximize', onClick: () => nativeControls?.maximize() },
    { icon: X, label: 'Close', onClick: () => nativeControls?.close() }
  ]

  // Breadcrumbs for header
  const breadcrumbs: BreadcrumbItem[] = [
    { label: t('nav.anilist'), active: activeTab === 'anilist' && !activeAnime },
  ]

  if (activeTab !== 'anilist') {
    const tabLabels: Record<string, string> = {
      search: t('app.browse'),
      history: t('app.history'),
      downloads: t('app.downloads'),
      settings: t('app.settings'),
      player: t('app.player'),
    }
    breadcrumbs.push({ label: tabLabels[activeTab] || activeTab, active: !activeAnime })
  }

  if (activeAnime) {
    breadcrumbs.push({ label: activeAnime.name, active: true })
  }

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
    setTorrentEpisodeRequest(null)
    setResumeEpisode(options?.episode ?? null)
    setResumeProgressSeconds(options?.resumeSeconds ?? null)
    setResumeTranslationType(null)
    setActiveTab('player')
    setActiveAnime(anime)
  }

  const handleSelectTorrent = (anime: AnimeSelection, episode: string, query: string) => {
    setResumeEpisode(null)
    setResumeProgressSeconds(null)
    setResumeTranslationType(null)
    setTorrentEpisodeRequest({ episode, query, nonce: Date.now() })
    setActiveAnime(anime)
    setActiveTab('player')
  }

  const handleOpenAniListMedia = (id: number) => {
    setAniListOpenRequest({ id, nonce: Date.now() })
    setActiveTab('anilist')
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
    <Layout
      sidebar={{
        items: sidebarItems,
        activeId: activeAnime ? 'player' : activeTab,
        onItemClick: (id) => {
          if (id === 'player' && activeAnime) {
            setActiveTab('player')
          } else {
            setActiveTab(id)
            if (id !== 'player') {
              setActiveAnime(null)
            }
          }
        },
      }}
      header={{
        logo: (
          <div className="app-logo">
            <span className="font-black tracking-wider text-lg">ANI//PLAY</span>
          </div>
        ),
        breadcrumbs,
        rightContent: (
          <button
            type="button"
            onClick={openGlobalWatchTogether}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-[var(--accent-dim)] text-[var(--accent)] text-sm font-medium hover:bg-[var(--accent-dimmer)] transition-colors"
          >
            <Sparkles size={14} />
            <span>{t('watchTogether.title')}</span>
          </button>
        ),
        windowControls,
      }}
    >
      <div className="container">
        <div className="mb-4">
          <RemoteNoticeBanner provider={activeAnime?.catalogProvider} />
        </div>

        <div className={activeTab === 'anilist' ? '' : 'hidden'} aria-hidden={activeTab !== 'anilist'}>
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
            onSelectTorrent={handleSelectTorrent}
            onOpenAniListMedia={handleOpenAniListMedia}
          />
        )}

        {activeAnime && (
          <div className={activeTab === 'player' ? '' : 'hidden'} aria-hidden={activeTab !== 'player'}>
            <AnimePage
              key={`${activeAnime.id}:${resumeTranslationType ?? 'default'}:${watchTogetherPlayerNonce}:${torrentEpisodeRequest?.nonce ?? 'provider'}`}
              anime={activeAnime}
              initialEpisode={resumeEpisode}
              initialResumeSeconds={resumeProgressSeconds}
              initialTranslationType={resumeTranslationType}
              initialTorrentEpisode={torrentEpisodeRequest?.episode ?? null}
              initialTorrentQuery={torrentEpisodeRequest?.query ?? null}
              onEpisodeStarted={handleEpisodeStarted}
              onOpenWatchTogether={openWatchTogether}
              onWatchTogetherContextChange={setWatchTogetherContext}
              onBack={() => {
                setActiveAnime(null)
                setResumeEpisode(null)
                setResumeProgressSeconds(null)
                setResumeTranslationType(null)
                setTorrentEpisodeRequest(null)
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
            <div className="flex-1 min-h-[220px] flex items-center justify-center text-[var(--text-secondary)] text-sm">
              {t('app.loadingSettings')}
            </div>
          }>
            <SettingsPage />
          </Suspense>
        )}
      </div>

      <AppNotifications items={notifications} onDismiss={dismissNotification} />
      <WatchTogetherSetupDialog key={watchTogetherInviteCode ?? 'watch-together'} anime={activeAnime ?? undefined} context={watchTogetherContext} isOpen={watchTogetherOpen || Boolean(watchTogetherInviteCode)} onOpenChange={setWatchTogetherOpen} />
    </Layout>
  )
}

export default App
