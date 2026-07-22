import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Hls from 'hls.js'
import { ArrowLeft, Download, Loader2, Maximize2, MessageSquare, Minimize2, Pause, PictureInPicture2, Play, Server, Sparkles, Volume2, VolumeX } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { addHistory } from '../lib/history'
import type { CatalogProvider } from '../catalog-types'
import type { TranslationType } from '../download-types'
import { shouldWarnAboutUncontrollableAnikotoSource, watchTogetherContentMatches } from '../lib/watch-together-content'
import { useWatchTogether } from '../contexts/WatchTogetherContext'
import { WatchTogetherCompanion } from '../components/WatchTogetherCompanion'

interface StreamLink {
  url: string
  resolution: string
  hls: boolean
  provider: string
  downloadable: boolean
  subtitles?: { label: string; url: string }[]
  embed?: boolean
}

interface PlayerPageProps {
  links: StreamLink[]
  title: string
  onBack: () => void
  mode?: 'overlay' | 'embedded'
  animeId?: string
  animeName?: string
  episode?: string
  translationType?: TranslationType
  initialResumeSeconds?: number | null
  aniListMediaId?: number
  coverUrl?: string
  catalogProvider?: CatalogProvider
}

const SAVE_THROTTLE_MS = 5000
const PRESENCE_SYNC_MS = 15000
const WATCH_CHECKPOINT_MS = 5 * 60_000
const ROOM_CHECKPOINT_MS = 15_000

function toResumeSeconds(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return Math.max(0, value)
}

function clampProgress(progressSeconds: number, durationSeconds?: number) {
  if (!Number.isFinite(progressSeconds) || progressSeconds < 0) return 0
  if (typeof durationSeconds === 'number' && Number.isFinite(durationSeconds) && durationSeconds > 0) {
    return Math.min(progressSeconds, durationSeconds)
  }
  return progressSeconds
}

function formatTime(s: number) {
  if (!Number.isFinite(s) || s < 0) return '0:00'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60).toString().padStart(2, '0')
  return `${m}:${sec}`
}

function seekToResumePosition(video: HTMLVideoElement, progressSeconds: number, durationSeconds?: number) {
  const target = clampProgress(progressSeconds, durationSeconds)
  if (target <= 0) return false
  if (video.readyState < 1 && !Number.isFinite(video.duration)) return false
  try {
    video.currentTime = target
    return true
  } catch {
    return false
  }
}

function embedOrigin(link: StreamLink | undefined) {
  if (!link?.embed) return null
  try {
    return new URL(link.url).origin
  } catch {
    return null
  }
}

function parseEmbedMessage(value: unknown): unknown {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value) as unknown
  } catch {
    return null
  }
}

function finiteSeconds(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}

export function PlayerPage({
  links,
  title,
  onBack,
  mode = 'overlay',
  animeId,
  animeName,
  episode,
  translationType = 'sub',
  initialResumeSeconds,
  aniListMediaId,
  coverUrl,
  catalogProvider = 'anikoto',
}: PlayerPageProps) {
  const { t } = useTranslation()
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  const seekedRef = useRef(false)
  const lastSavedAtRef = useRef(0)
  const latestTimeRef = useRef(0)
  const latestDurationRef = useRef(0)
  const lastPresenceAtRef = useRef(0)
  const playingRef = useRef(false)
  const watchSegmentRef = useRef<{ startedAt: number; fromSeconds: number } | null>(null)
  const applyingRoomPlaybackRef = useRef(false)
  const lastRoomRevisionRef = useRef(-1)
  const [activeIdx, setActiveIdx] = useState(0)
  const [showServers, setShowServers] = useState(false)
  const [failed, setFailed] = useState<Set<number>>(new Set())
  const [useNativeControls, setUseNativeControls] = useState(() => {
    try {
      const saved = localStorage.getItem('player.useNativeControls')
      return saved == null ? true : saved !== 'false'
    } catch {
      return true
    }
  })
  const [isPlaying, setIsPlaying] = useState(false)
  const [muted, setMuted] = useState(false)
  const [volume, setVolume] = useState(1)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [isPip, setIsPip] = useState(false)
  const [downloadStatus, setDownloadStatus] = useState<'idle' | 'starting' | 'queued' | 'error'>('idle')
  const { state: watchTogetherState, companionOpen, unreadCount, setCompanionOpen, updatePlayback, setReady } = useWatchTogether()
  const [roomAutoplayBlocked, setRoomAutoplayBlocked] = useState(false)

  const activeLink = links[activeIdx]
  const resumeSeconds = useMemo(() => toResumeSeconds(initialResumeSeconds), [initialResumeSeconds])
  const isEmbedLink = Boolean(activeLink?.embed)
  const activeEmbedOrigin = useMemo(() => embedOrigin(activeLink), [activeLink])
  const roomMatchesPlayer = Boolean(
    watchTogetherState?.connected
    && watchTogetherContentMatches(watchTogetherState.content, catalogProvider, animeId, episode, translationType),
  )
  const roomGuestLocked = roomMatchesPlayer && watchTogetherState?.role === 'guest'
  const anikotoRoomSourceUnavailable = roomMatchesPlayer
    && shouldWarnAboutUncontrollableAnikotoSource(catalogProvider, links)

  useEffect(() => {
    if (!roomMatchesPlayer || !activeLink?.embed) return
    const directIndex = links.findIndex((link) => !link.embed)
    if (directIndex < 0 || directIndex === activeIdx) return
    const selectDirectSource = window.setTimeout(() => setActiveIdx(directIndex), 0)
    return () => window.clearTimeout(selectDirectSource)
  }, [activeIdx, activeLink?.embed, links, roomMatchesPlayer])

  const sendRoomPlayback = useCallback((video: HTMLVideoElement) => {
    if (!roomMatchesPlayer || watchTogetherState?.role !== 'host' || applyingRoomPlaybackRef.current) return
    void updatePlayback({
      position: Math.max(0, video.currentTime || 0),
      paused: video.paused,
      duration: Number.isFinite(video.duration) && video.duration > 0 ? video.duration : undefined,
      revision: 0, // The room server assigns the authoritative revision.
    }).catch(() => {})
  }, [roomMatchesPlayer, updatePlayback, watchTogetherState?.role])

  useEffect(() => {
    const video = videoRef.current
    const playback = watchTogetherState?.playback
    if (!video || !roomGuestLocked || !playback || activeLink?.embed || playback.revision <= lastRoomRevisionRef.current) return
    lastRoomRevisionRef.current = playback.revision
    const updatedAt = playback.updatedAt ? Date.parse(playback.updatedAt) : Date.now()
    const elapsedSeconds = playback.paused || !Number.isFinite(updatedAt) ? 0 : Math.max(0, (Date.now() - updatedAt) / 1000)
    const target = Math.max(0, Math.min(playback.duration ?? Number.POSITIVE_INFINITY, playback.position + elapsedSeconds))
    const drift = target - video.currentTime
    applyingRoomPlaybackRef.current = true
    if (Math.abs(drift) > 1.5) {
      video.currentTime = target
      video.playbackRate = 1
    } else {
      video.playbackRate = Math.abs(drift) < 0.35 ? 1 : drift > 0 ? 1.03 : 0.97
    }
    if (playback.paused) video.pause()
    else void video.play().then(() => {
      setRoomAutoplayBlocked(false)
      return setReady(true)
    }).catch(() => {
      setRoomAutoplayBlocked(true)
      return setReady(false)
    })
    const release = window.setTimeout(() => { applyingRoomPlaybackRef.current = false }, 300)
    const resetRate = window.setTimeout(() => { video.playbackRate = 1 }, 5_000)
    return () => { window.clearTimeout(release); window.clearTimeout(resetRate) }
  }, [activeLink?.embed, roomGuestLocked, setReady, watchTogetherState?.playback])

  useEffect(() => {
    if (!roomMatchesPlayer) return
    void setReady(Boolean(activeLink && !activeLink.embed && videoRef.current?.readyState && videoRef.current.readyState >= 2)).catch(() => {})
    return () => { void setReady(false).catch(() => {}) }
  }, [activeLink, roomMatchesPlayer, setReady])

  useEffect(() => {
    if (!roomMatchesPlayer || watchTogetherState?.role !== 'host') return
    const video = videoRef.current
    if (video && !activeLink?.embed) sendRoomPlayback(video)
    const timer = window.setInterval(() => {
      const currentVideo = videoRef.current
      if (currentVideo && !activeLink?.embed) sendRoomPlayback(currentVideo)
    }, ROOM_CHECKPOINT_MS)
    return () => window.clearInterval(timer)
  }, [activeLink?.embed, roomMatchesPlayer, sendRoomPlayback, watchTogetherState?.role])

  const saveProgress = useCallback((force = false) => {
    if (!animeId || !animeName || !episode) return
    const progressSeconds = clampProgress(latestTimeRef.current, latestDurationRef.current || undefined)
    if (!force && progressSeconds <= 0) return

    const now = Date.now()
    if (!force && now - lastSavedAtRef.current < SAVE_THROTTLE_MS) return

    lastSavedAtRef.current = now
    addHistory({
      animeId,
      animeName,
      episode,
      progressSeconds,
      durationSeconds: latestDurationRef.current > 0 ? latestDurationRef.current : undefined,
      aniListMediaId,
      coverUrl,
      catalogProvider,
    })
  }, [animeId, animeName, episode, aniListMediaId, coverUrl, catalogProvider])

  const startWatchSegment = useCallback(() => {
    if (!window.aniPlay || !animeId || !animeName || !episode || watchSegmentRef.current) return
    watchSegmentRef.current = { startedAt: Date.now(), fromSeconds: latestTimeRef.current }
  }, [animeId, animeName, episode])

  const flushWatchSegment = useCallback((completed = false, restart = false) => {
    const now = Date.now()
    const segment = watchSegmentRef.current ?? (completed ? { startedAt: now - 1000, fromSeconds: Math.max(0, latestTimeRef.current - 1) } : null)
    watchSegmentRef.current = null
    if (segment && window.aniPlay && animeId && animeName && episode) {
      const endedAt = now
      const activeSeconds = Math.max(0, (endedAt - segment.startedAt) / 1000)
      if (activeSeconds >= (completed ? 1 : 10)) {
        void window.aniPlay.viewing.append({
          startedAt: segment.startedAt, endedAt, activeSeconds, timezoneOffsetMinutes: new Date(segment.startedAt).getTimezoneOffset(),
          animeId, animeName, episode, catalogProvider, aniListMediaId,
          fromSeconds: segment.fromSeconds, toSeconds: latestTimeRef.current,
          durationSeconds: latestDurationRef.current > 0 ? latestDurationRef.current : undefined,
          completed,
        }).catch(() => {})
      }
    }
    if (restart && playingRef.current) startWatchSegment()
  }, [animeId, animeName, episode, catalogProvider, aniListMediaId, startWatchSegment])

  const updatePresence = useCallback((playing: boolean, force = false) => {
    if (!window.aniPlay || !animeName || !episode) return
    const now = Date.now()
    if (!force && now - lastPresenceAtRef.current < PRESENCE_SYNC_MS) return
    lastPresenceAtRef.current = now
    void window.aniPlay.discordPresence.update({
      animeName,
      episode,
      translationType,
      currentTime: latestTimeRef.current,
      duration: latestDurationRef.current > 0 ? latestDurationRef.current : undefined,
      playing,
      aniListMediaId,
      coverUrl,
    }).catch(() => {})
  }, [animeName, episode, translationType, aniListMediaId, coverUrl])

  useEffect(() => {
    if (!videoRef.current) return
    updatePresence(!videoRef.current.paused, true)
  }, [updatePresence])

  useEffect(() => {
    if (!isEmbedLink || !activeEmbedOrigin) return

    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== activeEmbedOrigin) return
      const data = parseEmbedMessage(event.data)
      if (!data || typeof data !== 'object') return
      const payload = data as Record<string, unknown>
      const time = finiteSeconds(payload.time ?? payload.currentTime)
      const nextDuration = finiteSeconds(payload.duration)

      if (time !== null) {
        latestTimeRef.current = time
        if (nextDuration !== null && nextDuration > 0) latestDurationRef.current = nextDuration
        setCurrentTime(latestTimeRef.current)
        setDuration(latestDurationRef.current)
        setIsPlaying(true)
        if (!playingRef.current) { playingRef.current = true; startWatchSegment() }
        saveProgress(false)
        updatePresence(true, false)
      }

      if (payload.event === 'complete') {
        if (nextDuration !== null && nextDuration > 0) {
          latestTimeRef.current = nextDuration
          latestDurationRef.current = nextDuration
        }
        setCurrentTime(latestTimeRef.current)
        setDuration(latestDurationRef.current)
        setIsPlaying(false)
        playingRef.current = false
        flushWatchSegment(true)
        saveProgress(true)
        void window.aniPlay?.discordPresence.clear().catch(() => {})
      }
      if (payload.event === 'pause') { playingRef.current = false; setIsPlaying(false); flushWatchSegment(false) }
    }

    window.addEventListener('message', handleMessage)
    updatePresence(true, true)
    return () => window.removeEventListener('message', handleMessage)
  }, [activeEmbedOrigin, flushWatchSegment, isEmbedLink, saveProgress, startWatchSegment, updatePresence])

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'player.useNativeControls') {
        setUseNativeControls(e.newValue == null ? true : e.newValue !== 'false')
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !activeLink || activeLink.embed) return
    setFailed((prev) => {
      const next = new Set(prev)
      next.delete(activeIdx)
      return next
    })

    if (hlsRef.current) {
      hlsRef.current.destroy()
      hlsRef.current = null
    }

    const applyResumePosition = () => {
      if (seekedRef.current || resumeSeconds == null) return
      const target = clampProgress(resumeSeconds, video.duration)
      if (target <= 0) {
        seekedRef.current = true
        return
      }
      if (seekToResumePosition(video, target, video.duration)) {
        seekedRef.current = true
      }
    }

    const handleLoadedMetadata = () => {
      applyResumePosition()
      if (roomMatchesPlayer) void setReady(true).catch(() => {})
    }

    video.addEventListener('loadedmetadata', handleLoadedMetadata)

    if (activeLink.hls && Hls.isSupported()) {
      const hls = new Hls()
      hlsRef.current = hls
      hls.loadSource(activeLink.url)
      hls.attachMedia(video)
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        applyResumePosition()
        if (roomMatchesPlayer) void setReady(true).catch(() => {})
        video.play().catch(() => {})
      })
    } else {
      video.src = activeLink.url
      video.load()
      applyResumePosition()
      video.play().catch(() => {})
    }

    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata)
      if (hlsRef.current) {
        hlsRef.current.destroy()
        hlsRef.current = null
      }
    }
  }, [activeIdx, activeLink, resumeSeconds, roomMatchesPlayer, setReady])

  useEffect(() => {
    const onPipEnter = () => setIsPip(true)
    const onPipLeave = () => setIsPip(false)
    document.addEventListener('enterpictureinpicture', onPipEnter as EventListener)
    document.addEventListener('leavepictureinpicture', onPipLeave as EventListener)
    return () => {
      document.removeEventListener('enterpictureinpicture', onPipEnter as EventListener)
      document.removeEventListener('leavepictureinpicture', onPipLeave as EventListener)
    }
  }, [])

  useEffect(() => {
    const checkpoint = window.setInterval(() => { if (playingRef.current) flushWatchSegment(false, true) }, WATCH_CHECKPOINT_MS)
    return () => window.clearInterval(checkpoint)
  }, [flushWatchSegment])

  useEffect(() => {
    const flushFinal = () => {
      saveProgress(true)
      playingRef.current = false
      flushWatchSegment(false)
    }
    const flushVisibilityCheckpoint = () => {
      if (document.visibilityState !== 'hidden') return
      saveProgress(true)
      flushWatchSegment(false, true)
    }
    window.addEventListener('pagehide', flushFinal)
    window.addEventListener('beforeunload', flushFinal)
    document.addEventListener('visibilitychange', flushVisibilityCheckpoint)
    return () => {
      window.removeEventListener('pagehide', flushFinal)
      window.removeEventListener('beforeunload', flushFinal)
      document.removeEventListener('visibilitychange', flushVisibilityCheckpoint)
      saveProgress(true)
      playingRef.current = false
      flushWatchSegment(false)
      void window.aniPlay?.discordPresence.clear().catch(() => {})
    }
  }, [flushWatchSegment, saveProgress])

  const tryNextServer = () => {
    setFailed((prev) => {
      const next = new Set(prev)
      next.add(activeIdx)
      return next
    })
    for (let i = 1; i < links.length; i++) {
      const idx = (activeIdx + i) % links.length
      if (!failed.has(idx)) {
        setActiveIdx(idx)
        return
      }
    }
  }

  const isOverlay = mode === 'overlay'

  const handleTimeUpdate = (video: HTMLVideoElement) => {
    latestTimeRef.current = video.currentTime || 0
    latestDurationRef.current = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : latestDurationRef.current
    setCurrentTime(latestTimeRef.current)
    setDuration(latestDurationRef.current)
    saveProgress(false)
    updatePresence(!video.paused, false)
  }

  const handleDurationChange = (video: HTMLVideoElement) => {
    latestDurationRef.current = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0
    setDuration(latestDurationRef.current)
    updatePresence(!video.paused, true)
  }

  const handlePlaying = (video: HTMLVideoElement) => {
    latestTimeRef.current = video.currentTime || 0
    latestDurationRef.current = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : latestDurationRef.current
    setIsPlaying(true)
    setRoomAutoplayBlocked(false)
    playingRef.current = true
    startWatchSegment()
    updatePresence(true, true)
    if (roomMatchesPlayer) void setReady(true).catch(() => {})
    sendRoomPlayback(video)
  }

  const handlePause = (video: HTMLVideoElement) => {
    latestTimeRef.current = video.currentTime || 0
    latestDurationRef.current = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : latestDurationRef.current
    setIsPlaying(false)
    playingRef.current = false
    flushWatchSegment(false)
    saveProgress(true)
    updatePresence(false, true)
    sendRoomPlayback(video)
  }

  const handleEnded = (video: HTMLVideoElement) => {
    latestTimeRef.current = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : video.currentTime || 0
    latestDurationRef.current = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : latestDurationRef.current
    setIsPlaying(false)
    playingRef.current = false
    setCurrentTime(latestTimeRef.current)
    saveProgress(true)
    flushWatchSegment(true)
    void window.aniPlay?.discordPresence.clear().catch(() => {})
  }

  const togglePlay = () => {
    if (roomGuestLocked) return
    const video = videoRef.current
    if (!video) return
    if (video.paused) video.play().catch(() => {})
    else video.pause()
  }

  const toggleMute = () => {
    const video = videoRef.current
    if (!video) return
    video.muted = !video.muted
    setMuted(video.muted)
  }

  const setVideoVolume = (v: number) => {
    const video = videoRef.current
    if (!video) return
    const clamped = Math.max(0, Math.min(1, v))
    video.volume = clamped
    video.muted = clamped === 0
    setVolume(clamped)
    setMuted(video.muted)
  }

  const seek = (t: number) => {
    if (roomGuestLocked) return
    const video = videoRef.current
    if (!video) return
    const wasPlaying = !video.paused
    flushWatchSegment(false)
    const nextTime = Math.max(0, Math.min(duration || 0, t))
    video.currentTime = nextTime
    latestTimeRef.current = nextTime
    setCurrentTime(nextTime)
    if (wasPlaying) { playingRef.current = true; startWatchSegment() }
    updatePresence(!video.paused, true)
    sendRoomPlayback(video)
  }

  const skipForward = () => {
    const video = videoRef.current
    if (!video) return
    seek(video.currentTime + 85)
  }

  const enterFullscreen = () => {
    const video = videoRef.current
    if (!video) return
    if (video.requestFullscreen) video.requestFullscreen().catch(() => {})
  }

  const togglePip = async () => {
    const video = videoRef.current as (HTMLVideoElement & { disablePictureInPicture?: boolean }) | null
    if (!video) return
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture()
        return
      }
      if (!document.pictureInPictureEnabled || video.disablePictureInPicture) return
      await video.requestPictureInPicture()
    } catch {
      // Silently ignore when provider/browser blocks PiP for this stream
    }
  }

  const handleBack = () => {
    if (roomMatchesPlayer && !window.confirm(t('watchTogether.leavePlaybackConfirm'))) return
    saveProgress(true)
    playingRef.current = false
    flushWatchSegment(false)
    onBack()
  }

  const startDownload = async () => {
    if (!window.aniPlay || !activeLink?.downloadable || !animeId || !animeName || !episode || downloadStatus === 'starting') return
    setDownloadStatus('starting')
    const result = await window.aniPlay.downloads.start({
      animeId,
      animeName,
      episode,
      translationType,
      catalogProvider,
      provider: activeLink.provider,
      resolution: activeLink.resolution,
      durationSeconds: duration > 0 ? duration : undefined,
    })
    setDownloadStatus(result.success ? 'queued' : 'error')
    if (result.success) setTimeout(() => setDownloadStatus('idle'), 2500)
  }

  return (
    <div className={`relative min-w-0 ${watchTogetherState?.code && !isOverlay ? '2xl:contents' : ''}`}>
      <div
        className={isOverlay ? 'fixed inset-0 bg-black z-50 flex flex-col relative' : `m3-card p-4 md:p-6 flex flex-col gap-3 relative min-w-0 ${watchTogetherState?.code ? '2xl:col-start-2 2xl:row-start-1 2xl:h-fit 2xl:self-start' : ''}`}
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
      <div className={isOverlay ? 'p-4 flex items-center justify-between absolute top-0 left-0 w-full z-10 bg-gradient-to-b from-black/90 to-transparent' : 'flex items-center justify-between'}>
        <div className="flex items-center space-x-3">
          <button
            onClick={handleBack}
            className={isOverlay ? 'p-2 rounded-full hover:bg-white/20 transition-colors text-white' : 'p-2 rounded-full hover:bg-m3-on-surface/10 transition-colors text-m3-on-surface'}
          >
            <ArrowLeft size={22} />
          </button>
          <h2 className={isOverlay ? 'font-tempo text-lg font-bold text-white tracking-wider drop-shadow-md' : 'font-tempo text-lg md:text-xl font-bold text-m3-on-surface tracking-wide'}>
            {title}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          {watchTogetherState?.code && !isOverlay ? (
            <button type="button" onClick={() => setCompanionOpen(!companionOpen)} className="relative inline-flex items-center gap-2 rounded-full border border-m3-outline/30 px-3 py-2 text-sm font-bold text-m3-on-surface hover:bg-m3-on-surface/10 2xl:hidden" aria-expanded={companionOpen} aria-label={t('watchTogether.openCompanion')}>
              <MessageSquare size={16} />
              <span className="hidden sm:inline">{t('watchTogether.chat')}</span>
              {unreadCount > 0 ? <span className="rounded-full bg-m3-primary px-1.5 py-0.5 text-[10px] text-m3-on-primary">{unreadCount}</span> : null}
            </button>
          ) : null}
          {!isOverlay && (
            <span className="hidden md:inline-flex items-center gap-1 text-xs px-3 py-1 rounded-full bg-m3-primary/15 text-m3-primary font-bold">
              <Sparkles size={12} />
              {t('player.persistent')}
            </span>
          )}
          {activeLink?.downloadable && <button
            type="button"
            onClick={() => void startDownload()}
            disabled={!activeLink || !animeId || !animeName || !episode || downloadStatus === 'starting'}
            title={downloadStatus === 'error' ? t('player.downloadError') : t('player.downloadCurrent')}
            className={`flex items-center gap-2 px-3 md:px-4 py-2 rounded-full border transition-all text-sm font-bold disabled:opacity-40 ${isOverlay ? 'border-white/30 text-white hover:bg-white/10' : 'border-m3-outline/30 text-m3-on-surface hover:bg-m3-on-surface/10'}`}
          >
            {downloadStatus === 'starting' ? <Loader2 className="animate-spin" size={16} /> : <Download size={16} />}
            <span className="hidden sm:inline">{downloadStatus === 'queued' ? t('player.queued') : t('player.download')}</span>
          </button>}
          <button
            onClick={() => setShowServers((s) => !s)}
            className={`flex items-center space-x-2 px-4 py-2 rounded-full border transition-all text-sm font-bold ${showServers ? 'bg-m3-primary text-m3-on-primary border-transparent' : (isOverlay ? 'border-white/30 text-white hover:bg-white/10' : 'border-m3-outline/30 text-m3-on-surface hover:bg-m3-on-surface/10')}`}
          >
            <Server size={16} />
            <span>{t('player.servers', { count: links.length })}</span>
          </button>
        </div>
      </div>

      {anikotoRoomSourceUnavailable ? (
        <div
          role="alert"
          className={isOverlay
            ? 'absolute left-1/2 top-20 z-30 w-[min(92%,720px)] -translate-x-1/2 rounded-2xl border border-amber-300/30 bg-amber-950/95 px-4 py-3 text-sm text-amber-100 shadow-2xl'
            : 'rounded-2xl border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-sm text-amber-200'}
        >
          {t('watchTogether.anikotoDirectUnavailable')}
        </div>
      ) : null}

      {roomGuestLocked && roomAutoplayBlocked ? (
        <button
          type="button"
          className="absolute inset-0 z-30 m-auto h-fit w-fit rounded-full bg-m3-primary px-5 py-3 font-black text-m3-on-primary shadow-2xl"
          onClick={() => {
            const video = videoRef.current
            if (!video) return
            void video.play().then(() => {
              setRoomAutoplayBlocked(false)
              return setReady(true)
            }).catch(() => {})
          }}
        >
          {t('watchTogether.autoplayBlocked')}
        </button>
      ) : null}

      {isOverlay ? (
        <div className="flex-1 flex items-center justify-center bg-black">
          {isEmbedLink ? (
            <iframe
              src={activeLink.url}
              className="h-full w-full border-0"
              allow="autoplay; fullscreen; picture-in-picture"
              title={title}
            />
          ) : (
            <video
              ref={videoRef}
              crossOrigin={activeLink?.subtitles?.length ? 'anonymous' : undefined}
              className="w-full h-full object-contain"
              controls={useNativeControls && !roomGuestLocked}
              autoPlay
              onError={tryNextServer}
              onPlaying={(e) => handlePlaying(e.currentTarget)}
              onWaiting={() => { playingRef.current = false; flushWatchSegment(false); if (roomMatchesPlayer) void setReady(false).catch(() => {}) }}
              onPause={(e) => handlePause(e.currentTarget)}
              onEnded={(e) => handleEnded(e.currentTarget)}
              onTimeUpdate={(e) => handleTimeUpdate(e.currentTarget)}
              onDurationChange={(e) => handleDurationChange(e.currentTarget)}
              onVolumeChange={(e) => {
                const v = e.target as HTMLVideoElement
                setVolume(v.volume)
                setMuted(v.muted)
              }}
            >
              {activeLink?.subtitles?.map((track, index) => (
                <track key={`${track.url}:${index}`} src={track.url} label={track.label} kind="captions" default={index === 0} />
              ))}
            </video>
          )}
        </div>
      ) : (
        <div className="w-full mx-auto" style={{ maxWidth: 'min(100%, calc(62vh * 1.7778))' }}>
          <div className="aspect-video rounded-2xl overflow-hidden bg-black border border-m3-outline/20">
            {isEmbedLink ? (
              <iframe
                src={activeLink.url}
                className="h-full w-full border-0"
                allow="autoplay; fullscreen; picture-in-picture"
                title={title}
              />
            ) : (
              <video
                ref={videoRef}
                crossOrigin={activeLink?.subtitles?.length ? 'anonymous' : undefined}
                className="w-full h-full object-contain"
                controls={useNativeControls && !roomGuestLocked}
                autoPlay
                onError={tryNextServer}
                onPlaying={(e) => handlePlaying(e.currentTarget)}
                onWaiting={() => { playingRef.current = false; flushWatchSegment(false); if (roomMatchesPlayer) void setReady(false).catch(() => {}) }}
                onPause={(e) => handlePause(e.currentTarget)}
                onEnded={(e) => handleEnded(e.currentTarget)}
                onTimeUpdate={(e) => handleTimeUpdate(e.currentTarget)}
                onDurationChange={(e) => handleDurationChange(e.currentTarget)}
                onVolumeChange={(e) => {
                  const v = e.target as HTMLVideoElement
                  setVolume(v.volume)
                  setMuted(v.muted)
                }}
              >
                {activeLink?.subtitles?.map((track, index) => (
                  <track key={`${track.url}:${index}`} src={track.url} label={track.label} kind="captions" default={index === 0} />
                ))}
              </video>
            )}
          </div>
        </div>
      )}

      {!isEmbedLink && !useNativeControls && (
        <div className={isOverlay ? 'absolute left-3 right-3 bottom-1 z-20' : 'mt-2'}>
          <div className="rounded-2xl border border-m3-outline/25 bg-m3-surface/75 backdrop-blur-xl px-3 py-3 shadow-2xl">
            <div className="flex items-center gap-2 text-m3-on-surface text-xs mb-2">
              <button onClick={togglePlay} className="p-2 rounded-lg bg-m3-primary text-m3-on-primary hover:brightness-110 transition-all">
                {isPlaying ? <Pause size={16} /> : <Play size={16} />}
              </button>
              <button onClick={skipForward} className="p-2 rounded-lg border border-m3-outline/30 text-m3-on-surface-variant hover:bg-m3-on-surface/10 hover:text-m3-on-surface transition-all">
                +85s
              </button>
              <button onClick={toggleMute} className="p-2 rounded-lg border border-m3-outline/30 text-m3-on-surface-variant hover:bg-m3-on-surface/10 hover:text-m3-on-surface transition-all">
                {muted || volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={muted ? 0 : volume}
                onChange={(e) => setVideoVolume(Number(e.target.value))}
                className="w-20 accent-[var(--color-m3-primary)]"
              />
              <span className="ml-1 px-2 py-1 rounded-md bg-m3-surface-container/70 border border-m3-outline/20 text-m3-on-surface-variant">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>
              <button onClick={enterFullscreen} className="ml-auto p-2 rounded-lg border border-m3-outline/30 text-m3-on-surface-variant hover:bg-m3-on-surface/10 hover:text-m3-on-surface transition-all">
                <Maximize2 size={16} />
              </button>
              <button onClick={togglePip} className="p-2 rounded-lg border border-m3-outline/30 text-m3-on-surface-variant hover:bg-m3-on-surface/10 hover:text-m3-on-surface transition-all" title={t('player.pictureInPicture')}>
                {isPip ? <Minimize2 size={16} /> : <PictureInPicture2 size={16} />}
              </button>
            </div>
            <input
              type="range"
              min={0}
              max={Math.max(duration, 0)}
              step={0.1}
              value={Math.min(currentTime, duration || 0)}
              onChange={(e) => seek(Number(e.target.value))}
              className="w-full accent-[var(--color-m3-primary)]"
            />
          </div>
        </div>
      )}

      {showServers && (
        <div className={isOverlay ? 'absolute bottom-0 left-0 right-0 bg-m3-surface/95 backdrop-blur-xl border-t border-m3-outline/20 p-4 z-20' : 'bg-m3-surface/70 rounded-2xl border border-m3-outline/20 p-4'}>
          <p className="text-xs text-m3-on-surface-variant mb-3 uppercase tracking-widest font-bold">{t('player.selectServer')}</p>
          <div className="flex flex-wrap gap-2 max-h-[40vh] overflow-y-auto pr-1">
            {links.map((link, i) => (
              <button
                key={i}
                onClick={() => {
                  setActiveIdx(i)
                  setShowServers(false)
                }}
                className={`px-4 py-2 rounded-full text-sm font-bold border transition-all ${
                  i === activeIdx
                    ? 'bg-m3-primary text-m3-on-primary border-transparent shadow-lg'
                    : 'border-m3-outline/30 text-m3-on-surface-variant hover:bg-m3-on-surface/10 hover:text-m3-on-surface'
                }`}
              >
                <span className="opacity-60 text-xs mr-1">{link.provider}</span>
                {link.resolution}
                {link.hls && <span className="ml-1 text-xs opacity-50">HLS</span>}
              </button>
            ))}
          </div>
        </div>
      )}
      </div>
      {watchTogetherState?.code && !isOverlay ? <WatchTogetherCompanion /> : null}
    </div>
  )
}
