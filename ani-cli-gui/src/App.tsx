import { lazy, Suspense, useState } from 'react'
import { BrowsePage } from './pages/BrowsePage'
import { HistoryPage } from './pages/HistoryPage'
import { AnimePage } from './pages/AnimePage'
import { Navigation } from './components/Navigation'
import type { HistoryEntry } from './lib/history'

const SettingsPage = lazy(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })))

function App() {
  const [activeTab, setActiveTab] = useState('search')
  const [searchQuery, setSearchQuery] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [activeAnime, setActiveAnime] = useState<any>(null)
  const [resumeEpisode, setResumeEpisode] = useState<string | null>(null)

  const handleResumeFromHistory = (item: HistoryEntry) => {
    setActiveTab('search')
    setActiveAnime({
      id: item.animeId,
      name: item.animeName,
      episodes: 0
    })
    setResumeEpisode(item.episode)
  }

  const handleSelectAnime = (anime: any) => {
    setResumeEpisode(null)
    setActiveAnime(anime)
  }

  return (
    <div className="min-h-screen bg-m3-surface text-m3-on-surface p-4 md:p-5 relative overflow-hidden flex flex-col">
      {/* Background Floats */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-m3-primary/10 blur-[120px] rounded-full animate-blob"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-[--custom-display-name-styles-dark-1-color] opacity-20 blur-[120px] rounded-full animate-blob animation-delay-2000"></div>
      </div>

      {/* Header */}
      <header className="relative z-10 flex justify-between items-center mb-6 draggable" style={{ WebkitAppRegion: 'drag' } as any}>
        <div className="effect-container">
          <h1 className="effect-neon font-sakura text-4xl tracking-wide select-none">
            <span className="glow-layer">ani-cli</span>
            <span className="text-layer">ani-cli</span>
          </h1>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="relative z-10 flex-1 flex flex-col pb-20">
        {activeTab === 'search' && !activeAnime && (
          <BrowsePage 
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            results={results}
            setResults={setResults}
            onSelectAnime={handleSelectAnime}
          />
        )}

        {activeTab === 'search' && activeAnime && (
          <AnimePage 
            anime={activeAnime}
            initialEpisode={resumeEpisode}
            onBack={() => {
              setActiveAnime(null)
              setResumeEpisode(null)
            }}
          />
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

      <Navigation activeTab={activeTab} setActiveTab={setActiveTab} />
    </div>
  )
}

export default App
