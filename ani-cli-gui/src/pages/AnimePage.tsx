import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertCircle, ArrowLeft, Loader2, MonitorPlay, Search } from 'lucide-react'
import { PlayerPage } from './PlayerPage'
import { addHistory } from '../lib/history'
import { getTranslationType, invokeEpisodes, invokeLinks, type TranslationType } from '../lib/api'

interface StreamLink {
  url: string
  resolution: string
  hls: boolean
  provider: string
}



interface AnimePageProps {
  anime: { id: string; name: string; episodes: number }
  onBack: () => void
  initialEpisode?: string | null
  initialResumeSeconds?: number | null
}

export function AnimePage({
  anime,
  onBack,
  initialEpisode,
  initialResumeSeconds,
}: AnimePageProps) {
  const [episodes, setEpisodes] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [playingLinks, setPlayingLinks] = useState<StreamLink[]>([])
  const [playingEp, setPlayingEp] = useState<string>('')
  const [playingTranslationType, setPlayingTranslationType] = useState<TranslationType>('sub')
  const [loadingEp, setLoadingEp] = useState<string | null>(null)
  const [episodeQuery, setEpisodeQuery] = useState('')
  const [error, setError] = useState<string | null>(null)
  const restoredRef = useRef<string | null>(null)

  const handlePlay = useCallback((ep: string) => {
    if (loadingEp === ep) return
    setLoadingEp(ep)
    setError(null)

    const translationType = getTranslationType()
    invokeLinks(anime.id, ep, translationType).then((res) => {
      setLoadingEp(null)
      if (res.success && Array.isArray(res.data) && res.data.length > 0) {
        const resumeSeconds =
          initialEpisode === ep && typeof initialResumeSeconds === 'number' && Number.isFinite(initialResumeSeconds)
            ? Math.max(0, initialResumeSeconds)
            : 0

        setPlayingLinks(res.data)
        setPlayingEp(ep)
        setPlayingTranslationType(translationType)
        addHistory({
          animeId: anime.id,
          animeName: anime.name,
          episode: ep,
          progressSeconds: resumeSeconds,
        })
      } else {
        setError(res.error || 'No working streams were found for this episode.')
      }
    }).catch((cause: unknown) => {
      setLoadingEp(null)
      setError(cause instanceof Error ? cause.message : 'Stream lookup failed. Please try another episode.')
    })
  }, [anime.id, anime.name, initialEpisode, initialResumeSeconds, loadingEp])

  useEffect(() => {
    invokeEpisodes(anime.id).then((res) => {
      if (res.success && Array.isArray(res.data)) {
        setEpisodes(res.data)
      } else {
        setError(res.error || 'Could not load the episode list.')
      }
      setLoading(false)
    }).catch((cause: unknown) => {
      setLoading(false)
      setError(cause instanceof Error ? cause.message : 'Could not load the episode list.')
    })
  }, [anime.id])

  useEffect(() => {
    if (!initialEpisode || loading) return
    if (!episodes.includes(initialEpisode)) return
    const key = `${anime.id}:${initialEpisode}`
    if (restoredRef.current === key) return
    restoredRef.current = key
    handlePlay(initialEpisode)
  }, [initialEpisode, episodes, loading, anime.id, handlePlay])

  const visibleEpisodes = episodeQuery.trim()
    ? episodes.filter((episode) => episode.includes(episodeQuery.trim()))
    : episodes

  return (
    <div className="flex-1 flex flex-col space-y-6">
      <div className="flex items-center gap-3 md:gap-4 mb-1">
        <button
          onClick={onBack}
          aria-label="Back to browse"
          className="icon-button"
        >
          <ArrowLeft size={22} />
        </button>
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.18em] font-bold text-m3-primary">Now browsing</p>
          <h2 className="truncate font-tempo text-2xl md:text-3xl font-bold">{anime.name}</h2>
        </div>
      </div>

      {error && (
        <div role="alert" className="flex items-start gap-3 rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">
          <AlertCircle className="mt-0.5 shrink-0" size={18} />
          <span className="flex-1">{error}</span>
          <button type="button" onClick={() => setError(null)} className="font-bold hover:underline">Dismiss</button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4 lg:gap-5 flex-1 min-h-0">
        <aside className="m3-card p-4 md:p-5 flex flex-col min-h-[300px] lg:min-h-0 lg:max-h-[calc(100vh-210px)]">
          <h3 className="text-base md:text-lg font-bold mb-4 border-b border-m3-outline/20 pb-3 flex items-center justify-between">
            <span>Episodes</span>
            <span className="text-xs bg-m3-primary/10 text-m3-primary px-2.5 py-1 rounded-full">{episodes.length || anime.episodes}</span>
          </h3>

          {!loading && episodes.length > 12 && (
            <div className="relative mb-3">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-m3-outline" />
              <input type="search" inputMode="decimal" value={episodeQuery} onChange={(event) => setEpisodeQuery(event.target.value)} placeholder="Find episode" aria-label="Find episode" className="w-full rounded-xl border border-m3-outline/20 bg-m3-surface/45 py-2 pl-9 pr-3 text-sm outline-none focus:border-m3-primary/60" />
            </div>
          )}

          {loading ? (
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
                    <span>Ep {ep}</span>
                    {loadingEp === ep ? <Loader2 size={13} className="animate-spin" /> : isActive && <span className="hidden lg:inline text-[10px] opacity-80">Playing</span>}
                  </button>
                )
              })}
              {visibleEpisodes.length === 0 && <p className="col-span-full py-8 text-center text-sm text-m3-on-surface-variant">No matching episode.</p>}
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
            />
          ) : (
            <div className="m3-card flex-1 min-h-[280px] flex flex-col items-center justify-center text-center px-6">
              <span className="flex size-16 items-center justify-center rounded-2xl bg-m3-primary/10 text-m3-primary"><MonitorPlay size={28} /></span>
              <p className="mt-4 font-bold">Ready when you are</p>
              <p className="mt-1 text-sm text-m3-on-surface-variant">Choose an episode. AniPlay will gather every available server before playback starts.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
