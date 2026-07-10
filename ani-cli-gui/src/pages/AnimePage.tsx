import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertCircle, ArrowLeft, ExternalLink, Loader2, MonitorPlay, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { PlayerPage } from './PlayerPage'
import { addHistory } from '../lib/history'
import { getTranslationType, invokeEpisodes, invokeLinks, openProviderEpisode, TRANSLATION_TYPE_KEY, type CatalogProvider, type TranslationType } from '../lib/api'

interface StreamLink {
  url: string
  resolution: string
  hls: boolean
  provider: string
  downloadable: boolean
  embed?: boolean
}



interface AnimePageProps {
  anime: { id: string; name: string; episodes: number; aniListMediaId?: number; coverUrl?: string; catalogProvider: CatalogProvider }
  onBack: () => void
  initialEpisode?: string | null
  initialResumeSeconds?: number | null
  onEpisodeStarted?: (animeId: string, episode: string) => void
}

export function AnimePage({
  anime,
  onBack,
  initialEpisode,
  initialResumeSeconds,
  onEpisodeStarted,
}: AnimePageProps) {
  const { t } = useTranslation()
  const [episodes, setEpisodes] = useState<string[]>([])
  const [loadedEpisodesKey, setLoadedEpisodesKey] = useState('')
  const [playingLinks, setPlayingLinks] = useState<StreamLink[]>([])
  const [playingEp, setPlayingEp] = useState<string>('')
  const [playingTranslationType, setPlayingTranslationType] = useState<TranslationType>('sub')
  const [selectedTranslationType, setSelectedTranslationType] = useState<TranslationType>(getTranslationType)
  const [loadingEp, setLoadingEp] = useState<string | null>(null)
  const [episodeQuery, setEpisodeQuery] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [browserFallbackEpisode, setBrowserFallbackEpisode] = useState<string | null>(null)
  const [aniListMetadata, setAniListMetadata] = useState(() => ({ mediaId: anime.aniListMediaId, coverUrl: anime.coverUrl }))
  const [idleQuoteIndex, setIdleQuoteIndex] = useState<number | null>(null)
  const restoredRef = useRef<string | null>(null)
  const supportsTranslationSwitch = anime.catalogProvider !== 'desu'
  const episodesKey = `${anime.catalogProvider}:${anime.id}:${selectedTranslationType}`
  const loadingEpisodes = loadedEpisodesKey !== episodesKey

  useEffect(() => {
    if (anime.aniListMediaId && anime.coverUrl) return
    void window.aniPlay?.aniList.mapping.enrich(anime, selectedTranslationType).then((media) => {
      if (media) setAniListMetadata({ mediaId: media.id, coverUrl: media.coverUrl || undefined })
    }).catch(() => {})
  }, [anime, selectedTranslationType])

  const handlePlay = useCallback((ep: string, translationType: TranslationType = selectedTranslationType) => {
    if (loadingEp === ep) return
    setLoadingEp(ep)
    setError(null)
    setBrowserFallbackEpisode(null)

    invokeLinks(anime.id, ep, translationType, anime.catalogProvider).then((res) => {
      setLoadingEp(null)
      if (res.success && Array.isArray(res.data) && res.data.length > 0) {
        const resumeSeconds =
          initialEpisode === ep && typeof initialResumeSeconds === 'number' && Number.isFinite(initialResumeSeconds)
            ? Math.max(0, initialResumeSeconds)
            : 0

        setPlayingLinks(res.data)
        setPlayingEp(ep)
        setPlayingTranslationType(translationType)
        onEpisodeStarted?.(anime.id, ep)
        addHistory({
          animeId: anime.id,
          animeName: anime.name,
          episode: ep,
          progressSeconds: resumeSeconds,
          aniListMediaId: aniListMetadata.mediaId,
          coverUrl: aniListMetadata.coverUrl,
          catalogProvider: anime.catalogProvider,
        })
      } else {
        setError(res.error || t('anime.noStreams'))
        if (anime.catalogProvider === 'desu' || anime.catalogProvider === 'miruro' || anime.catalogProvider === 'anikoto') setBrowserFallbackEpisode(ep)
      }
    }).catch((cause: unknown) => {
      setLoadingEp(null)
      setError(cause instanceof Error ? cause.message : t('anime.lookupFailed'))
      if (anime.catalogProvider === 'desu' || anime.catalogProvider === 'miruro' || anime.catalogProvider === 'anikoto') setBrowserFallbackEpisode(ep)
    })
  }, [anime.id, anime.name, anime.catalogProvider, aniListMetadata.mediaId, aniListMetadata.coverUrl, initialEpisode, initialResumeSeconds, loadingEp, onEpisodeStarted, selectedTranslationType, t])

  const selectTranslationType = useCallback((value: TranslationType) => {
    if (value === selectedTranslationType) return
    localStorage.setItem(TRANSLATION_TYPE_KEY, value)
    setSelectedTranslationType(value)
    setPlayingLinks([])
    setError(null)
    setBrowserFallbackEpisode(null)
    if (playingEp) {
      const episode = playingEp
      setPlayingEp('')
      handlePlay(episode, value)
    }
  }, [handlePlay, playingEp, selectedTranslationType])

  useEffect(() => {
    let cancelled = false
    const requestKey = episodesKey
    invokeEpisodes(anime.id, anime.catalogProvider, selectedTranslationType).then((res) => {
      if (cancelled) return
      if (res.success && Array.isArray(res.data)) {
        setEpisodes(res.data)
        setError(null)
      } else {
        setEpisodes([])
        setError(res.error || t('anime.episodesFailed'))
      }
      setLoadedEpisodesKey(requestKey)
    }).catch((cause: unknown) => {
      if (cancelled) return
      setEpisodes([])
      setError(cause instanceof Error ? cause.message : t('anime.episodesFailed'))
      setLoadedEpisodesKey(requestKey)
    })
    return () => { cancelled = true }
  }, [anime.id, anime.catalogProvider, selectedTranslationType, episodesKey, t])

  useEffect(() => {
    if (!initialEpisode || loadingEpisodes) return
    if (!episodes.includes(initialEpisode)) return
    const key = `${anime.id}:${initialEpisode}:${selectedTranslationType}`
    if (restoredRef.current === key) return
    restoredRef.current = key
    handlePlay(initialEpisode)
  }, [initialEpisode, episodes, loadingEpisodes, anime.id, handlePlay, selectedTranslationType])

  useEffect(() => {
    const shouldShowIdleQuote = !loadingEpisodes && !loadingEp && playingLinks.length === 0
    if (!shouldShowIdleQuote) {
      const resetTimer = window.setTimeout(() => setIdleQuoteIndex(null), 0)
      return () => window.clearTimeout(resetTimer)
    }

    let rotateTimer: number | undefined
    const startTimer = window.setTimeout(() => {
      const quotes = t('anime.idleQuotes', { returnObjects: true }) as string[]
      setIdleQuoteIndex((current) => current === null ? 0 : (current + 1) % quotes.length)
      rotateTimer = window.setInterval(() => {
        const nextQuotes = t('anime.idleQuotes', { returnObjects: true }) as string[]
        setIdleQuoteIndex((current) => current === null ? 0 : (current + 1) % nextQuotes.length)
      }, 30_000)
    }, 45_000)

    return () => {
      window.clearTimeout(startTimer)
      if (rotateTimer !== undefined) window.clearInterval(rotateTimer)
    }
  }, [loadingEp, loadingEpisodes, playingLinks.length, t])

  const idleQuotes = t('anime.idleQuotes', { returnObjects: true }) as string[]

  const visibleEpisodes = episodeQuery.trim()
    ? episodes.filter((episode) => episode.includes(episodeQuery.trim()))
    : episodes

  return (
    <div className="flex-1 flex flex-col space-y-6">
      <div className="flex items-center gap-3 md:gap-4 mb-1">
        <button
          onClick={onBack}
          aria-label={t('anime.backToBrowse')}
          className="icon-button"
        >
          <ArrowLeft size={22} />
        </button>
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.18em] font-bold text-m3-primary">{t('anime.nowBrowsing')}</p>
          <h2 className="truncate font-tempo text-2xl md:text-3xl font-bold">{anime.name}</h2>
        </div>
      </div>

      {error && (
        <div role="alert" className="flex items-start gap-3 rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">
          <AlertCircle className="mt-0.5 shrink-0" size={18} />
          <span className="flex-1">{error}</span>
          {browserFallbackEpisode && (
            <button
              type="button"
              onClick={() => void openProviderEpisode(anime.id, browserFallbackEpisode, anime.catalogProvider, selectedTranslationType).then((result) => {
                if (!result.success) setError(result.error || t('anime.browserFailed'))
              })}
              className="inline-flex shrink-0 items-center gap-1.5 font-bold hover:underline"
            >
              <ExternalLink size={15} /> {t('anime.openInBrowser')}
            </button>
          )}
          <button type="button" onClick={() => setError(null)} className="font-bold hover:underline">{t('anime.dismiss')}</button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4 lg:gap-5 flex-1 min-h-0">
        <aside className="m3-card p-4 md:p-5 flex flex-col min-h-[300px] lg:min-h-0 lg:max-h-[calc(100vh-210px)]">
          <h3 className="text-base md:text-lg font-bold mb-4 border-b border-m3-outline/20 pb-3 flex items-center justify-between">
            <span>{t('anime.episodes')}</span>
            <span className="text-xs bg-m3-primary/10 text-m3-primary px-2.5 py-1 rounded-full">{episodes.length || anime.episodes}</span>
          </h3>

          {supportsTranslationSwitch && (
            <div className="mb-3 inline-flex rounded-xl border border-m3-outline/30 p-1" role="group" aria-label={t('anime.audioVersion')}>
              {(['sub', 'dub'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => selectTranslationType(value)}
                  aria-pressed={selectedTranslationType === value}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm font-bold transition-colors ${selectedTranslationType === value ? 'bg-m3-primary text-m3-on-primary' : 'hover:bg-m3-on-surface/10'}`}
                >
                  {value === 'sub' ? t('anime.subbed') : t('anime.dubbed')}
                </button>
              ))}
            </div>
          )}

          {!loadingEpisodes && episodes.length > 12 && (
            <div className="relative mb-3">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-m3-outline" />
              <input type="search" inputMode="decimal" value={episodeQuery} onChange={(event) => setEpisodeQuery(event.target.value)} placeholder={t('anime.findEpisode')} aria-label={t('anime.findEpisode')} className="w-full rounded-xl border border-m3-outline/20 bg-m3-surface/45 py-2 pl-9 pr-3 text-sm outline-none focus:border-m3-primary/60" />
            </div>
          )}

          {loadingEpisodes ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="animate-m3-pulsate p-3 rounded-full bg-m3-primary/20">
                <MonitorPlay className="text-m3-primary animate-pulse" size={28} />
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto pr-1 grid grid-cols-3 lg:grid-cols-1 gap-2 content-start">
              {visibleEpisodes.map((ep) => {
                const isActive = playingEp === ep
                return (
                  <button
                    key={ep}
                    disabled={loadingEp === ep}
                    className={`w-full px-3 py-2.5 rounded-xl border text-sm transition-all font-bold flex items-center justify-between ${isActive ? 'bg-m3-primary text-m3-on-primary border-transparent' : 'border-m3-outline/20 bg-m3-surface-container/40 hover:bg-m3-primary hover:text-m3-on-primary hover:border-transparent'} ${loadingEp === ep ? 'opacity-50 cursor-wait animate-pulse' : ''}`}
                    onClick={() => handlePlay(ep)}
                  >
                    <span>{t('anime.episode', { episode: ep })}</span>
                    {loadingEp === ep ? <Loader2 size={13} className="animate-spin" /> : isActive && <span className="hidden lg:inline text-[10px] opacity-80">{t('anime.playing')}</span>}
                  </button>
                )
              })}
              {visibleEpisodes.length === 0 && <p className="col-span-full py-8 text-center text-sm text-m3-on-surface-variant">{t('anime.noMatchingEpisode')}</p>}
            </div>
          )}
        </aside>

        <section className="flex flex-col gap-3 min-h-[320px]">
          {playingLinks.length > 0 ? (
            <PlayerPage
              key={`${anime.id}:${playingEp}`}
              mode="embedded"
              links={playingLinks}
              title={`${anime.name} - Ep ${playingEp}`}
              onBack={() => setPlayingLinks([])}
              animeId={anime.id}
              animeName={anime.name}
              episode={playingEp}
              translationType={playingTranslationType}
              initialResumeSeconds={initialEpisode === playingEp ? initialResumeSeconds : null}
              aniListMediaId={aniListMetadata.mediaId}
              coverUrl={aniListMetadata.coverUrl}
              catalogProvider={anime.catalogProvider}
            />
          ) : (
            <div className="m3-card flex-1 min-h-[280px] flex flex-col items-center justify-center text-center px-6">
              <span className="flex size-16 items-center justify-center rounded-2xl bg-m3-primary/10 text-m3-primary"><MonitorPlay size={28} /></span>
              <p className="mt-4 font-bold">{t('anime.readyTitle')}</p>
              <p className="mt-1 min-h-5 text-sm text-m3-on-surface-variant">{idleQuoteIndex === null ? t('anime.readyBody') : idleQuotes[idleQuoteIndex]}</p>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
