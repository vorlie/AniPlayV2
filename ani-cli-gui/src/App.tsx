import { lazy, Suspense, useState, type CSSProperties } from 'react'
import { BrowsePage } from './pages/BrowsePage'
import { HistoryPage } from './pages/HistoryPage'
import { AnimePage } from './pages/AnimePage'
import { HomePage } from './pages/HomePage'
import { Navigation } from './components/Navigation'
import type { HistoryEntry } from './lib/history'

interface AnimeSelection {
  id: string
  name: string
  episodes: number
}

const SettingsPage = lazy(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })))

function App() {
  const [activeTab, setActiveTab] = useState('home')
  const [searchQuery, setSearchQuery] = useState('')
  const [results, setResults] = useState<AnimeSelection[]>([])
  const [activeAnime, setActiveAnime] = useState<AnimeSelection | null>(null)
  const [resumeEpisode, setResumeEpisode] = useState<string | null>(null)
  const [resumeProgressSeconds, setResumeProgressSeconds] = useState<number | null>(null)

  const handleResumeFromHistory = (item: HistoryEntry) => {
    setActiveTab('player')
    setActiveAnime({
      id: item.animeId,
      name: item.animeName,
      episodes: 0,
    })
    setResumeEpisode(item.episode)
    setResumeProgressSeconds(item.progressSeconds)
  }

  const handleSelectAnime = (anime: AnimeSelection) => {
    setResumeEpisode(null)
    setResumeProgressSeconds(null)
    setActiveTab('player')
    setActiveAnime(anime)
  }

  return (
    <div className="min-h-screen bg-m3-surface text-m3-on-surface p-3 md:p-5 relative overflow-hidden flex flex-col">
      {/* Background Floats */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-m3-primary/10 blur-[120px] rounded-full animate-blob"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-[--custom-display-name-styles-dark-1-color] opacity-20 blur-[120px] rounded-full animate-blob animation-delay-2000"></div>
      </div>

      {/* Header */}
      <header className="relative z-10 w-full max-w-[1500px] mx-auto flex items-center justify-between gap-3 mb-4 md:mb-5 draggable" style={{ WebkitAppRegion: 'drag' } as CSSProperties}>
        <div className="effect-container items-center gap-3">
          <h1 className="effect-neon font-sakura text-3xl md:text-4xl tracking-wide select-none">
            <span className="glow-layer">ani-cli</span>
            <span className="text-layer">ani-cli</span>
          </h1>
          <span className="hidden lg:inline text-xs font-bold uppercase tracking-[0.18em] text-m3-on-surface-variant">watch without the clutter</span>
        </div>
        <Navigation activeTab={activeTab} setActiveTab={setActiveTab} hasActivePlayer={activeAnime !== null} />
      </header>

      {/* Main Content Area */}
      <main className="relative z-10 flex-1 flex flex-col w-full max-w-[1500px] mx-auto pb-20 md:pb-4">
        {activeTab === 'home' && (
          <HomePage
            setSearchQuery={setSearchQuery}
            setResults={setResults}
            onSelectAnime={handleSelectAnime}
          />
        )}

        {activeTab === 'search' && (
          <BrowsePage
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            results={results}
            setResults={setResults}
            onSelectAnime={handleSelectAnime}
          />
        )}

        {activeAnime && (
          <div className={activeTab === 'player' ? 'flex flex-1 flex-col' : 'hidden'} aria-hidden={activeTab !== 'player'}>
            <AnimePage
              key={activeAnime.id}
              anime={activeAnime}
              initialEpisode={resumeEpisode}
              initialResumeSeconds={resumeProgressSeconds}
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

    </div>
  )
}

export default App
