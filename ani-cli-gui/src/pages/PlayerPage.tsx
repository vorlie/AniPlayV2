import { useState, useEffect, useRef } from 'react'
import Hls from 'hls.js'
import { ArrowLeft, Server, Sparkles } from 'lucide-react'

interface StreamLink {
  url: string
  resolution: string
  hls: boolean
  provider: string
}

export function PlayerPage({
  links,
  title,
  onBack,
  mode = 'overlay'
}: {
  links: StreamLink[],
  title: string,
  onBack: () => void,
  mode?: 'overlay' | 'embedded'
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  const [activeIdx, setActiveIdx] = useState(0)
  const [showServers, setShowServers] = useState(false)
  const [failed, setFailed] = useState<Set<number>>(new Set())

  const activeLink = links[activeIdx]

  useEffect(() => {
    setActiveIdx(0)
    setShowServers(false)
    setFailed(new Set())
  }, [links, title])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !activeLink) return
    setFailed(prev => {
      const next = new Set(prev)
      next.delete(activeIdx)
      return next
    })

    // Destroy any existing HLS instance
    if (hlsRef.current) {
      hlsRef.current.destroy()
      hlsRef.current = null
    }

    if (activeLink.hls && Hls.isSupported()) {
      const hls = new Hls()
      hlsRef.current = hls
      hls.loadSource(activeLink.url)
      hls.attachMedia(video)
      hls.on(Hls.Events.MANIFEST_PARSED, () => { video.play().catch(() => {}) })
    } else {
      video.src = activeLink.url
      video.load()
      video.play().catch(() => {})
    }

    return () => {
      if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null }
    }
  }, [activeIdx, activeLink])

  const tryNextServer = () => {
    setFailed(prev => {
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

  return (
    <div
      className={isOverlay ? 'fixed inset-0 bg-black z-50 flex flex-col' : 'm3-card p-4 md:p-6 flex flex-col gap-3'}
      style={{ WebkitAppRegion: 'no-drag' } as any}
    >

      {/* Top bar */}
      <div className={isOverlay ? 'p-4 flex items-center justify-between absolute top-0 left-0 w-full z-10 bg-gradient-to-b from-black/90 to-transparent' : 'flex items-center justify-between'}>
        <div className="flex items-center space-x-3">
          <button
            onClick={onBack}
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
              Persistent Player
            </span>
          )}
          <button
            onClick={() => setShowServers(s => !s)}
            className={`flex items-center space-x-2 px-4 py-2 rounded-full border transition-all text-sm font-bold ${showServers ? 'bg-m3-primary text-m3-on-primary border-transparent' : (isOverlay ? 'border-white/30 text-white hover:bg-white/10' : 'border-m3-outline/30 text-m3-on-surface hover:bg-m3-on-surface/10')}`}
          >
            <Server size={16} />
            <span>Servers ({links.length})</span>
          </button>
        </div>
      </div>

      {/* Video */}
      {isOverlay ? (
        <div className="flex-1 flex items-center justify-center bg-black">
          <video ref={videoRef} className="w-full h-full object-contain" controls autoPlay onError={tryNextServer} />
        </div>
      ) : (
        <div className="w-full mx-auto" style={{ maxWidth: 'min(100%, calc(62vh * 1.7778))' }}>
          <div className="aspect-video rounded-2xl overflow-hidden bg-black border border-m3-outline/20">
            <video ref={videoRef} className="w-full h-full object-contain" controls autoPlay onError={tryNextServer} />
          </div>
        </div>
      )}

      {/* Server panel - slides up from bottom */}
      {showServers && (
        <div className={isOverlay ? 'absolute bottom-0 left-0 right-0 bg-m3-surface/95 backdrop-blur-xl border-t border-m3-outline/20 p-4 z-20' : 'bg-m3-surface/70 rounded-2xl border border-m3-outline/20 p-4'}>
          <p className="text-xs text-m3-on-surface-variant mb-3 uppercase tracking-widest font-bold">Select Server</p>
          <div className="flex flex-wrap gap-2 max-h-[40vh] overflow-y-auto pr-1">
            {links.map((link, i) => (
              <button
                key={i}
                onClick={() => { setActiveIdx(i); setShowServers(false) }}
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
