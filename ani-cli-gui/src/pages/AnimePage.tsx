import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, MonitorPlay } from 'lucide-react'
import { PlayerPage } from './PlayerPage'
import { addHistory } from '../lib/history'
import { invokeEpisodes, invokeLinks } from '../lib/api'

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
  const [loadingEp, setLoadingEp] = useState<string | null>(null)
  const restoredRef = useRef<string | null>(null)

  const handlePlay = (ep: string) => {
    if (loadingEp === ep) return
    setLoadingEp(ep)

    invokeLinks<StreamLink[]>(anime.id, ep).then((res) => {
      setLoadingEp(null)
      if (res.success && Array.isArray(res.data) && res.data.length > 0) {
        const resumeSeconds =
          initialEpisode === ep && typeof initialResumeSeconds === 'number' && Number.isFinite(initialResumeSeconds)
            ? Math.max(0, initialResumeSeconds)
            : 0

        setPlayingLinks(res.data)
        setPlayingEp(ep)
        addHistory({
          animeId: anime.id,
          animeName: anime.name,
          episode: ep,
          progressSeconds: resumeSeconds,
        })
      } else {
        alert('Failed to find streams for this episode.')
      }
    }).catch(() => {
      setLoadingEp(null)
      alert('Stream fetch failed.')
    })
  }

  useEffect(() => {
    invokeEpisodes<string[]>(anime.id).then((res) => {
      if (res.success && Array.isArray(res.data)) {
        setEpisodes(res.data)
      }
      setLoading(false)
    }).catch(() => {
      setLoading(false)
    })
  }, [anime.id])

  useEffect(() => {
    if (!initialEpisode || loading) return
    if (!episodes.includes(initialEpisode)) return
    const key = `${anime.id}:${initialEpisode}`
    if (restoredRef.current === key) return
    restoredRef.current = key
    handlePlay(initialEpisode)
  }, [initialEpisode, episodes, loading, anime.id])

  return (
    <div className="flex-1 flex flex-col space-y-6">
      <div className="flex items-center space-x-4 mb-2">
        <button
          onClick={onBack}
          className="p-3 rounded-full hover:bg-m3-on-surface/10 transition-colors text-m3-on-surface"
        >
          <ArrowLeft size={24} />
        </button>
        <h2 className="font-tempo text-3xl font-bold effect-neon">
          <span className="glow-layer">{anime.name}</span>
          <span className="text-layer">{anime.name}</span>
        </h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4 lg:gap-5 flex-1 min-h-0">
        <aside className="m3-card p-4 md:p-5 flex flex-col min-h-[320px] lg:min-h-0 lg:max-h-[calc(100vh-230px)]">
          <h3 className="text-base md:text-lg font-bold mb-4 border-b border-m3-outline/20 pb-3 flex items-center justify-between">
            <span>Episodes</span>
            <span className="text-xs bg-m3-primary/10 text-m3-primary px-2.5 py-1 rounded-full">{anime.episodes}</span>
          </h3>

          {loading ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="animate-m3-pulsate p-3 rounded-full bg-m3-primary/20">
                <MonitorPlay className="text-m3-primary animate-pulse" size={28} />
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto pr-1 space-y-2">
              {episodes.map((ep) => {
                const isActive = playingEp === ep
                return (
                  <button
                    key={ep}
                    disabled={loadingEp === ep}
                    className={`w-full px-3 py-2.5 rounded-xl border text-sm transition-all font-bold flex items-center justify-between ${isActive ? 'bg-m3-primary text-m3-on-primary border-transparent' : 'border-m3-outline/20 bg-m3-surface-container/40 hover:bg-m3-primary hover:text-m3-on-primary hover:border-transparent'} ${loadingEp === ep ? 'opacity-50 cursor-wait animate-pulse' : ''}`}
                    onClick={() => handlePlay(ep)}
                  >
                    <span>Ep {ep}</span>
                    {isActive && <span className="text-[10px] opacity-80">Playing</span>}
                  </button>
                )
              })}
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
              initialResumeSeconds={initialEpisode === playingEp ? initialResumeSeconds : null}
            />
          ) : (
            <div className="m3-card flex-1 min-h-[280px] flex items-center justify-center text-m3-on-surface-variant text-sm">
              Select an episode from the sidebar to start playback.
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
