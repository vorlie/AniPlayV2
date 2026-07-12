import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Hls from 'hls.js'
import { ArrowLeft, Download, Loader2, Maximize2, Minimize2, Pause, PictureInPicture2, Play, Server, Sparkles, Volume2, VolumeX } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { addHistory } from '../lib/history'
import type { CatalogProvider } from '../catalog-types'
import type { TranslationType } from '../download-types'

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

  const activeLink = links[activeIdx]
  const resumeSeconds = useMemo(() => toResumeSeconds(initialResumeSeconds), [initialResumeSeconds])
  const isEmbedLink = Boolean(activeLink?.embed)
  const activeEmbedOrigin = useMemo(() => embedOrigin(activeLink), [activeLink])

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
        saveProgress(true)
        void window.aniPlay?.discordPresence.clear().catch(() => {})
      }
    }

    window.addEventListener('message', handleMessage)
    updatePresence(true, true)
    return () => window.removeEventListener('message', handleMessage)
  }, [activeEmbedOrigin, isEmbedLink, saveProgress, updatePresence])

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
    }

    video.addEventListener('loadedmetadata', handleLoadedMetadata)

    if (activeLink.hls && Hls.isSupported()) {
      const hls = new Hls()
      hlsRef.current = hls
      hls.loadSource(activeLink.url)
      hls.attachMedia(video)
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        applyResumePosition()
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
  }, [activeIdx, activeLink, resumeSeconds])

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
    const flush = () => {
      saveProgress(true)
    }
    window.addEventListener('pagehide', flush)
    window.addEventListener('beforeunload', flush)
    document.addEventListener('visibilitychange', flush)
    return () => {
      window.removeEventListener('pagehide', flush)
      window.removeEventListener('beforeunload', flush)
      document.removeEventListener('visibilitychange', flush)
      saveProgress(true)
      void window.aniPlay?.discordPresence.clear().catch(() => {})
    }
  }, [saveProgress])

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
    updatePresence(true, true)
  }

  const handlePause = (video: HTMLVideoElement) => {
    latestTimeRef.current = video.currentTime || 0
    latestDurationRef.current = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : latestDurationRef.current
    setIsPlaying(false)
    saveProgress(true)
    updatePresence(false, true)
  }

  const handleEnded = (video: HTMLVideoElement) => {
    latestTimeRef.current = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : video.currentTime || 0
    latestDurationRef.current = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : latestDurationRef.current
    setIsPlaying(false)
    setCurrentTime(latestTimeRef.current)
    saveProgress(true)
    void window.aniPlay?.discordPresence.clear().catch(() => {})
  }

  const togglePlay = () => {
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
    const video = videoRef.current
    if (!video) return
    const nextTime = Math.max(0, Math.min(duration || 0, t))
    video.currentTime = nextTime
    latestTimeRef.current = nextTime
    setCurrentTime(nextTime)
    updatePresence(!video.paused, true)
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
    saveProgress(true)
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
    <div
      className={isOverlay ? 'fixed inset-0 bg-black z-50 flex flex-col relative' : 'm3-card p-4 md:p-6 flex flex-col gap-3 relative'}
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

      {isOverlay ? (
        <div className="flex-1 flex items-center justify-center bg-black">
          {isEmbedLink ? (
            <iframe
              src={activeLink.url}
              className="h-full w-full border-0"
              allow="autoplay; fullscreen; picture-in-picture"
              allowFullScreen
              title={title}
            />
          ) : (
            <video
              ref={videoRef}
              className="w-full h-full object-contain"
              controls={useNativeControls}
              autoPlay
              onError={tryNextServer}
              onPlay={(e) => handlePlaying(e.currentTarget)}
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
                allowFullScreen
                title={title}
              />
            ) : (
              <video
                ref={videoRef}
                className="w-full h-full object-contain"
                controls={useNativeControls}
                autoPlay
                onError={tryNextServer}
                onPlay={(e) => handlePlaying(e.currentTarget)}
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
  )
}
