import { useState } from 'react'
import { Search, MonitorPlay } from 'lucide-react'
import { invokeSearch, type AnimeSearchResult } from '../lib/api'

interface BrowsePageProps {
  searchQuery: string
  setSearchQuery: (value: string) => void
  results: AnimeSearchResult[]
  setResults: (value: AnimeSearchResult[]) => void
  onSelectAnime: (anime: AnimeSearchResult) => void
}

export function BrowsePage({
  searchQuery,
  setSearchQuery,
  results,
  setResults,
  onSelectAnime,
}: BrowsePageProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasSearched, setHasSearched] = useState(results.length > 0)

  const search = async () => {
    const query = searchQuery.trim()
    if (!query || loading) return

    setLoading(true)
    setError(null)
    setHasSearched(true)
    try {
      const response = await invokeSearch(query)
      if (!response.success) {
        setResults([])
        setError(response.error || 'Search failed. Please try again.')
        return
      }
      setResults(response.data ?? [])
    } catch (cause: unknown) {
      setResults([])
      setError(cause instanceof Error ? cause.message : 'Search failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex-1 flex flex-col space-y-6">
      <div className="m3-card p-6 flex flex-col space-y-4">
        <h2 className="font-sans font-bold text-2xl text-m3-on-surface">Find Anime</h2>
        <div className="relative">
          <label htmlFor="anime-search" className="sr-only">Anime title</label>
          <input
            id="anime-search"
            type="search"
            placeholder="Search an anime title..."
            className="w-full bg-m3-on-surface/5 border border-m3-outline/20 rounded-2xl pl-12 pr-4 py-3 text-m3-on-surface focus:outline-none focus:ring-2 focus:ring-m3-primary/30 focus:border-m3-primary/50 transition-all font-sans"
            value={searchQuery}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void search()
            }}
            onChange={(event) => setSearchQuery(event.target.value)}
            aria-describedby={error ? 'search-error' : undefined}
          />
          <Search aria-hidden="true" className="absolute left-4 top-1/2 transform -translate-y-1/2 text-m3-outline" size={20} />
        </div>
        <button
          type="button"
          onClick={() => void search()}
          disabled={!searchQuery.trim() || loading}
          className="bg-m3-primary text-m3-on-primary font-black rounded-full px-6 py-3 shadow-sm hover:shadow-md transition-all self-start flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <MonitorPlay aria-hidden="true" size={20} />
          <span>{loading ? 'Searching…' : 'Search'}</span>
        </button>
        {error && <p id="search-error" role="alert" className="text-sm text-red-400">{error}</p>}
      </div>

      <div className="m3-card p-6 flex-1 min-h-[300px]">
        <h3 className="text-xl font-bold mb-4 opacity-80 border-b border-m3-outline/20 pb-2">
          Results{results.length > 0 ? ` (${results.length})` : ''}
        </h3>
        {results.length > 0 ? (
          <div className="flex flex-col space-y-2 overflow-y-auto max-h-[500px] pr-2">
            {results.map((anime) => (
              <button
                type="button"
                key={anime.id}
                className="w-full p-3 m3-card-hover rounded-xl border border-transparent text-left flex justify-between items-center group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-m3-primary"
                onClick={() => onSelectAnime(anime)}
              >
                <span className="font-bold text-m3-on-surface group-hover:text-m3-primary transition-colors">{anime.name}</span>
                <span className="text-sm bg-m3-primary/10 text-m3-primary px-3 py-1 rounded-full">{anime.episodes} eps</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-m3-on-surface-variant">
            <p>{loading ? 'Searching…' : hasSearched && !error ? 'No matching anime found.' : 'Enter a search query to load anime.'}</p>
          </div>
        )}
      </div>
    </div>
  )
}
