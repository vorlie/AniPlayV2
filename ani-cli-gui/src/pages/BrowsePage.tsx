import { useState } from 'react'
import { ArrowRight, Grid2X2, List, Loader2, Search, Tv2 } from 'lucide-react'
import { CATALOG_PROVIDER_KEY, getAniListFirstSearch, getCatalogProvider, getTranslationType, invokeSearch, type AnimeSearchResult, type CatalogProvider } from '../lib/api'

interface BrowsePageProps {
  searchQuery: string
  setSearchQuery: (value: string) => void
  results: AnimeSearchResult[]
  setResults: (value: AnimeSearchResult[]) => void
  onSelectAnime: (anime: AnimeSearchResult) => void
}

type SearchViewMode = 'compact' | 'posters'
const SEARCH_VIEW_MODE_KEY = 'search.resultViewMode'

function getSearchViewMode(): SearchViewMode {
  try {
    return localStorage.getItem(SEARCH_VIEW_MODE_KEY) === 'posters' ? 'posters' : 'compact'
  } catch {
    return 'compact'
  }
}

export function BrowsePage({ searchQuery, setSearchQuery, results, setResults, onSelectAnime }: BrowsePageProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasSearched, setHasSearched] = useState(results.length > 0)
  const [catalogProvider, setCatalogProvider] = useState<CatalogProvider>(getCatalogProvider)
  const [viewMode, setViewMode] = useState<SearchViewMode>(getSearchViewMode)
  const translationType = getTranslationType()
  const aniListFirstSearch = getAniListFirstSearch()

  const search = async () => {
    const query = searchQuery.trim()
    if (!query || loading) return
    setLoading(true)
    setError(null)
    setHasSearched(true)
    try {
      const response = await invokeSearch(query, catalogProvider)
      if (!response.success) throw new Error(response.error || 'Search failed. Please try again.')
      setResults(response.data ?? [])
    } catch (cause: unknown) {
      setResults([])
      setError(cause instanceof Error ? cause.message : 'Search failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const selectCatalog = (provider: CatalogProvider) => {
    setCatalogProvider(provider)
    localStorage.setItem(CATALOG_PROVIDER_KEY, provider)
    setResults([])
    setHasSearched(false)
    setError(null)
  }

  const providerDescription = catalogProvider === 'desu'
    ? 'Searching Desu Online for Polish-subtitled anime.'
    : catalogProvider === 'miruro'
      ? 'Searching Miruro for English sub and dub anime.'
      : catalogProvider === 'anikoto'
        ? aniListFirstSearch ? 'Searching AniList first, then Anikoto provider matches.' : 'Searching Anikoto for English sub and dub anime.'
        : `Searching the ${translationType === 'dub' ? 'dubbed' : 'subbed'} AllAnime catalog.`

  const providerLabel = (provider: CatalogProvider) => {
    if (provider === 'allanime') return `AllAnime · ${translationType.toUpperCase()}`
    if (provider === 'desu') return 'Desu · PL SUB'
    if (provider === 'miruro') return 'Miruro · EN'
    return 'Anikoto · EN'
  }

  const resultMeta = (anime: AnimeSearchResult) => {
    if (anime.catalogProvider === 'desu') return 'Polish subtitles'
    if (anime.catalogProvider === 'miruro') return `${anime.episodes || '—'} episodes · English`
    if (anime.catalogProvider === 'anikoto') return `${anime.episodes || '—'} episodes · English`
    return `${anime.episodes || '—'} episodes`
  }

  const selectViewMode = (mode: SearchViewMode) => {
    setViewMode(mode)
    localStorage.setItem(SEARCH_VIEW_MODE_KEY, mode)
  }

  const fallbackIndex = (index: number, className = 'size-12') => (
    <span className={`flex ${className} shrink-0 items-center justify-center rounded-xl bg-m3-primary/10 text-sm font-black text-m3-primary`}>
      {String(index + 1).padStart(2, '0')}
    </span>
  )

  return (
    <div className="flex-1 flex flex-col gap-4 md:gap-5">
      <section className="m3-card overflow-hidden p-5 md:p-7">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
          <div>
            <p className="section-label"><Search size={14} /> Library search</p>
            <h2 className="mt-2 text-3xl md:text-4xl font-black tracking-tight">What do you want to watch?</h2>
            <p className="mt-1 text-sm text-m3-on-surface-variant">{providerDescription}</p>
          </div>
          <div className="self-start inline-flex rounded-xl border border-m3-outline/30 p-1" role="group" aria-label="Catalog provider">
            {(['allanime', 'desu', 'miruro', 'anikoto'] as const).map((provider) => <button key={provider} type="button" onClick={() => selectCatalog(provider)} aria-pressed={catalogProvider === provider} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${catalogProvider === provider ? 'bg-m3-primary text-m3-on-primary' : 'hover:bg-m3-on-surface/10'}`}>{providerLabel(provider)}</button>)}
          </div>
        </div>

        <div className="mt-5 flex items-stretch gap-2 rounded-2xl border border-m3-outline/25 bg-m3-surface/55 p-1.5 focus-within:border-m3-primary/60 focus-within:ring-4 focus-within:ring-m3-primary/10 transition-all">
          <Search aria-hidden="true" className="ml-3 self-center text-m3-outline" size={20} />
          <label htmlFor="anime-search" className="sr-only">Anime title</label>
          <input
            id="anime-search"
            type="search"
            autoFocus
            placeholder="Try Cowboy Bebop, Frieren, One Piece…"
            className="min-w-0 flex-1 bg-transparent px-2 py-3 text-m3-on-surface outline-none placeholder:text-m3-on-surface-variant/55"
            value={searchQuery}
            onKeyDown={(event) => { if (event.key === 'Enter') void search() }}
            onChange={(event) => setSearchQuery(event.target.value)}
            aria-describedby={error ? 'search-error' : undefined}
          />
          <button type="button" onClick={() => void search()} disabled={!searchQuery.trim() || loading} className="primary-action px-4 md:px-6">
            {loading ? <Loader2 className="animate-spin" size={18} /> : <Search size={18} />}
            <span className="hidden sm:inline">{loading ? 'Searching' : 'Search'}</span>
          </button>
        </div>
        {error && <p id="search-error" role="alert" className="mt-3 rounded-xl border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-300">{error}</p>}
      </section>

      <section className="m3-card p-4 md:p-6 flex-1 min-h-[340px]">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-xl font-black">Results</h3>
            <p className="text-xs text-m3-on-surface-variant mt-0.5">{results.length ? `${results.length} titles found` : 'Matching titles appear here'}</p>
          </div>
          <div className="inline-flex rounded-xl border border-m3-outline/30 p-1" role="group" aria-label="Search result view">
            <button type="button" onClick={() => selectViewMode('compact')} aria-pressed={viewMode === 'compact'} title="Compact view" className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${viewMode === 'compact' ? 'bg-m3-primary text-m3-on-primary' : 'hover:bg-m3-on-surface/10'}`}>
              <List size={14} /> Compact
            </button>
            <button type="button" onClick={() => selectViewMode('posters')} aria-pressed={viewMode === 'posters'} title="Poster grid" className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${viewMode === 'posters' ? 'bg-m3-primary text-m3-on-primary' : 'hover:bg-m3-on-surface/10'}`}>
              <Grid2X2 size={14} /> Posters
            </button>
          </div>
        </div>
        {results.length > 0 ? (
          viewMode === 'posters' ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
            {results.map((anime, index) => (
              <button type="button" key={`${anime.catalogProvider}:${anime.id}`} className="group overflow-hidden rounded-2xl border border-m3-outline/15 bg-m3-surface/40 text-left hover:-translate-y-0.5 hover:border-m3-primary/40 hover:bg-m3-primary/5 transition-all" onClick={() => onSelectAnime(anime)}>
                <span className="block aspect-[2/3] w-full overflow-hidden bg-m3-surface-variant/30">
                  {anime.coverUrl ? <img src={anime.coverUrl} alt="" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" loading="lazy" /> : <span className="flex h-full w-full items-center justify-center text-2xl font-black text-m3-primary">{String(index + 1).padStart(2, '0')}</span>}
                </span>
                <span className="block p-3">
                  <span className="line-clamp-2 min-h-[2.5rem] text-sm font-black group-hover:text-m3-primary transition-colors">{anime.name}</span>
                  <span className="mt-1 block truncate text-xs text-m3-on-surface-variant">{resultMeta(anime)}</span>
                </span>
              </button>
            ))}
          </div>
          ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
            {results.map((anime, index) => (
              <button type="button" key={`${anime.catalogProvider}:${anime.id}`} className="group rounded-2xl border border-m3-outline/15 bg-m3-surface/40 p-3.5 text-left flex items-center gap-3 hover:-translate-y-0.5 hover:border-m3-primary/40 hover:bg-m3-primary/5 transition-all" onClick={() => onSelectAnime(anime)}>
                {anime.coverUrl ? (
                  <span className="size-12 shrink-0 overflow-hidden rounded-xl bg-m3-surface-variant/30">
                    <img src={anime.coverUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                  </span>
                ) : fallbackIndex(index)}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold group-hover:text-m3-primary transition-colors">{anime.name}</span>
                  <span className="block mt-0.5 text-xs text-m3-on-surface-variant">{resultMeta(anime)}</span>
                </span>
                <ArrowRight size={18} className="shrink-0 text-m3-outline transition-transform group-hover:translate-x-1 group-hover:text-m3-primary" />
              </button>
            ))}
          </div>
          )
        ) : (
          <div className="min-h-[240px] flex flex-col items-center justify-center text-center">
            <span className="flex size-14 items-center justify-center rounded-2xl bg-m3-primary/10 text-m3-primary"><Tv2 size={25} /></span>
            <p className="mt-4 font-bold">{loading ? 'Searching the catalog…' : hasSearched && !error ? 'No matching titles' : 'Start with a title'}</p>
            <p className="mt-1 max-w-sm text-sm text-m3-on-surface-variant">{hasSearched ? 'Check the spelling or try a shorter title.' : 'Enter an anime name above. You can choose an episode and server on the next screen.'}</p>
          </div>
        )}
      </section>
    </div>
  )
}
