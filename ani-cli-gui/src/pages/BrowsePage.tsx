import { useState } from 'react'
import { AlertCircle, Grid2X2, List, Loader2, Magnet, Play, Search, Tv2, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { CATALOG_PROVIDER_KEY, getAniListFirstSearch, getCatalogProvider, invokeSearch, type AnimeSearchResult, type CatalogProvider } from '../lib/api'
import { buildTorrentSearchQuery } from '../lib/torrent-search'
import '../styles/browsepage.css'

interface BrowsePageProps {
  searchQuery: string
  setSearchQuery: (value: string) => void
  results: AnimeSearchResult[]
  setResults: (value: AnimeSearchResult[]) => void
  onSelectAnime: (anime: AnimeSearchResult) => void
  onSelectTorrent: (anime: AnimeSearchResult, episode: string, query: string) => void
  onOpenAniListMedia: (id: number) => void
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

export function BrowsePage({ searchQuery, setSearchQuery, results, setResults, onSelectAnime, onSelectTorrent, onOpenAniListMedia }: BrowsePageProps) {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasSearched, setHasSearched] = useState(results.length > 0)
  const [catalogProvider, setCatalogProvider] = useState<CatalogProvider>(getCatalogProvider)
  const [viewMode, setViewMode] = useState<SearchViewMode>(getSearchViewMode)
  const [torrentTarget, setTorrentTarget] = useState<AnimeSearchResult | null>(null)
  const [torrentEpisode, setTorrentEpisode] = useState('1')
  const [torrentSeason, setTorrentSeason] = useState('')
  const aniListFirstSearch = getAniListFirstSearch()
  const providerGroups: Array<{ label: string; providers: CatalogProvider[] }> = [
    { label: t('browse.polishSources'), providers: ['desu', 'docchi'] },
    { label: t('browse.englishSources'), providers: ['anikoto', 'anikoto2', 'anidb'] },
  ]

  const search = async () => {
    const query = searchQuery.trim()
    if (!query || loading) return
    setLoading(true)
    setError(null)
    setHasSearched(true)
    try {
      const response = await invokeSearch(query, catalogProvider)
      if (!response.success) throw new Error(response.error || t('browse.searchFailed'))
      setResults(response.data ?? [])
    } catch (cause: unknown) {
      setResults([])
      setError(cause instanceof Error ? cause.message : t('browse.searchFailed'))
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
    ? t('browse.providerDescriptions.desu')
    : catalogProvider === 'docchi'
      ? t('browse.providerDescriptions.docchi')
      : catalogProvider === 'anidb'
        ? t('browse.providerDescriptions.anidb')
        : catalogProvider === 'anikoto'
          ? aniListFirstSearch ? t('browse.providerDescriptions.anikotoFirst') : t('browse.providerDescriptions.anikoto')
          : t('browse.providerDescriptions.anikoto2')

  const providerLabel = (provider: CatalogProvider) => {
    if (provider === 'desu') return 'Desu · PL SUB'
    if (provider === 'docchi') return 'Docchi · PL'
    if (provider === 'anidb') return 'AniDB.app · EN'
    if (provider === 'anikoto2') return 'Anikoto 2 · CZ'
    return 'Anikoto 1 · EN'
  }

  const resultMeta = (anime: AnimeSearchResult) => {
    if (anime.catalogProvider === 'desu' || anime.catalogProvider === 'docchi') return t('browse.polishSubtitles')
    if (anime.catalogProvider === 'anidb') return `${anime.episodes ? t('browse.episodes', { count: anime.episodes }) : t('browse.noEpisodes')} · ${t('browse.english')}`
    if (anime.catalogProvider === 'anikoto' || anime.catalogProvider === 'anikoto2') return `${anime.episodes ? t('browse.episodes', { count: anime.episodes }) : t('browse.noEpisodes')} · ${t('browse.english')}`
    return anime.episodes ? t('browse.episodes', { count: anime.episodes }) : t('browse.noEpisodes')
  }

  const selectViewMode = (mode: SearchViewMode) => {
    setViewMode(mode)
    localStorage.setItem(SEARCH_VIEW_MODE_KEY, mode)
  }

  const selectResult = (anime: AnimeSearchResult) => {
    if (aniListFirstSearch && anime.aniListMediaId) {
      onOpenAniListMedia(anime.aniListMediaId)
      return
    }
    onSelectAnime(anime)
  }

  const openTorrent = (anime: AnimeSearchResult) => {
    setTorrentTarget(anime)
    setTorrentEpisode('1')
    setTorrentSeason('')
  }

  const submitTorrent = () => {
    const episode = torrentEpisode.trim()
    const season = torrentSeason.trim()
    if (!torrentTarget || !/^\d+(?:\.\d+)?$/.test(episode) || (season && (!/^\d+$/.test(season) || Number(season) <= 0))) return
    const target = torrentTarget
    setTorrentTarget(null)
    onSelectTorrent(target, String(Number(episode)), buildTorrentSearchQuery(target.name, torrentSeason))
  }

  return (
    <div className="browse-page">
      <header className="browse-header">
        <div>
          <div className="browse-eyebrow">
            {t('browse.sectionLabel')}
          </div>

          <h1 className="browse-title">
            {t('browse.heading')}
          </h1>

          <p className="browse-subtitle">
            {providerDescription}
          </p>
        </div>
      </header>

      {error && (
        <div className="browse-error" role="alert">
          <AlertCircle size={18} />
          <div>
            <p className="browse-error-title">
              {t('browse.searchFailed')}
            </p>
            <p className="browse-error-message">
              {error}
            </p>
          </div>
        </div>
      )}

      <div className="browse-controls">
        <div className="browse-search">
          <Search className="browse-search-icon" size={18} />
          <label htmlFor="anime-search" className="sr-only">{t('browse.animeTitle')}</label>
          <input
            id="anime-search"
            type="search"
            autoFocus
            placeholder={t('browse.placeholder')}
            value={searchQuery}
            onKeyDown={(event) => { if (event.key === 'Enter') void search() }}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
          <button
            type="button"
            onClick={() => void search()}
            disabled={!searchQuery.trim() || loading}
            className="browse-provider-button active"
          >
            {loading ? <Loader2 className="animate-spin" size={16} /> : <Search size={16} />}
          </button>
        </div>

        <div className="browse-provider-group">
          <span className="browse-provider-label">{t('browse.providerGroup')}</span>
          {providerGroups.map((group) => (
            group.providers.map((provider) => (
              <button
                key={provider}
                type="button"
                onClick={() => selectCatalog(provider)}
                className={`browse-provider-button ${catalogProvider === provider ? 'active' : ''}`}
              >
                {providerLabel(provider)}
                {provider === 'docchi' ? <span className="ml-1 opacity-75">{t('browse.experimental')}</span> : null}
              </button>
            ))
          ))}
        </div>

        <div className="browse-view-toggle">
          <button
            type="button"
            onClick={() => selectViewMode('compact')}
            className={`browse-view-button ${viewMode === 'compact' ? 'active' : ''}`}
            title={t('browse.compactView')}
          >
            <List size={14} />
          </button>
          <button
            type="button"
            onClick={() => selectViewMode('posters')}
            className={`browse-view-button ${viewMode === 'posters' ? 'active' : ''}`}
            title={t('browse.posterGrid')}
          >
            <Grid2X2 size={14} />
          </button>
        </div>
      </div>

      <section className="browse-section">
        <div className="browse-section-header">
          <h2>{t('browse.results')}</h2>
          <span>{results.length}</span>
        </div>

        {loading ? (
          viewMode === 'posters' ? (
            <div className="browse-grid">
              {Array.from({ length: 12 }).map((_, index) => (
                <div key={`skeleton-${index}`} className="browse-poster">
                  <div className="browse-poster-image">
                    <div className="browse-skeleton browse-poster-skeleton" />
                  </div>
                  <div className="browse-poster-info">
                    <div className="browse-skeleton browse-title-skeleton" />
                    <div className="browse-skeleton browse-meta-skeleton" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="browse-list">
              {Array.from({ length: 8 }).map((_, index) => (
                <div key={`skeleton-${index}`} className="browse-item">
                  <div className="browse-item-cover">
                    <div className="browse-skeleton browse-poster-skeleton" />
                  </div>
                  <div className="browse-item-main">
                    <div className="browse-skeleton browse-title-skeleton" />
                    <div className="browse-skeleton browse-meta-skeleton" />
                  </div>
                </div>
              ))}
            </div>
          )
        ) : results.length > 0 ? (
          viewMode === 'posters' ? (
            <div className="browse-grid">
              {results.map((anime, index) => (
                <div key={`${anime.catalogProvider}:${anime.id}`} className="browse-poster">
                  <button
                    type="button"
                    className="browse-poster-image"
                    onClick={() => selectResult(anime)}
                  >
                    {anime.coverUrl ? (
                      <img src={anime.coverUrl} alt="" loading="lazy" />
                    ) : (
                      <div className="browse-poster-placeholder">
                        {String(index + 1).padStart(2, '0')}
                      </div>
                    )}
                    <div className="browse-poster-overlay">
                      <div className="browse-poster-play">
                        <Play size={18} />
                      </div>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => openTorrent(anime)}
                    className="browse-poster-torrent"
                    title={t('torrent.fromSearch')}
                    aria-label={t('torrent.forTitle', { title: anime.name })}
                  >
                    <Magnet size={14} />
                  </button>
                  <div className="browse-poster-info">
                    <h3 className="browse-poster-title">{anime.name}</h3>
                    <p className="browse-poster-meta">{resultMeta(anime)}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="browse-list">
              {results.map((anime, index) => (
                <div key={`${anime.catalogProvider}:${anime.id}`} className="browse-item">
                  <div className="browse-item-cover">
                    {anime.coverUrl ? (
                      <img src={anime.coverUrl} alt="" loading="lazy" />
                    ) : (
                      <div className="browse-item-cover-placeholder">
                        {String(index + 1).padStart(2, '0')}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    className="browse-item-main"
                    onClick={() => selectResult(anime)}
                  >
                    <h3 className="browse-item-title">{anime.name}</h3>
                    <p className="browse-item-meta">{resultMeta(anime)}</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => openTorrent(anime)}
                    className="browse-item-torrent"
                    title={t('torrent.fromSearch')}
                    aria-label={t('torrent.forTitle', { title: anime.name })}
                  >
                    <Magnet size={16} />
                  </button>
                </div>
              ))}
            </div>
          )
        ) : (
          <div className="browse-empty">
            <div className="browse-empty-icon">
              <Tv2 size={24} />
            </div>
            <h3>
              {loading ? t('browse.searchingCatalog') : hasSearched && !error ? t('browse.noMatches') : t('browse.startWithTitle')}
            </h3>
            <p>
              {hasSearched ? t('browse.spellingHint') : t('browse.startHint')}
            </p>
          </div>
        )}
      </section>
      {torrentTarget ? (
        <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="torrent-episode-title" onKeyDown={(event) => { if (event.key === 'Escape') setTorrentTarget(null) }}>
          <form className="m3-card w-full max-w-md border border-m3-outline/20 p-5 shadow-2xl" onSubmit={(event) => { event.preventDefault(); submitTorrent() }}>
            <div className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-m3-primary/10 text-m3-primary"><Magnet size={20}/></span>
              <div className="min-w-0 flex-1">
                <h3 id="torrent-episode-title" className="text-xl font-black">{t('torrent.searchTitle')}</h3>
                <p className="mt-1 truncate text-sm text-m3-on-surface-variant">{torrentTarget.name}</p>
              </div>
              <button type="button" className="icon-button" onClick={() => setTorrentTarget(null)} aria-label={t('torrent.close')}><X size={19}/></button>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <label htmlFor="torrent-season" className="block text-sm font-bold">
                {t('torrent.seasonLabel')}
                <input id="torrent-season" autoFocus inputMode="numeric" placeholder={t('torrent.seasonPlaceholder')} value={torrentSeason} onChange={(event) => setTorrentSeason(event.target.value)} className="mt-2 w-full rounded-xl border border-m3-outline/25 bg-m3-surface/50 px-4 py-3 outline-none focus:border-m3-primary/60" />
              </label>
              <label htmlFor="torrent-episode" className="block text-sm font-bold">
                {t('torrent.episodeLabel')}
                <input id="torrent-episode" inputMode="decimal" value={torrentEpisode} onChange={(event) => setTorrentEpisode(event.target.value)} className="mt-2 w-full rounded-xl border border-m3-outline/25 bg-m3-surface/50 px-4 py-3 outline-none focus:border-m3-primary/60" />
              </label>
            </div>
            <p className="mt-2 text-xs text-m3-on-surface-variant">{t('torrent.searchHint')}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setTorrentTarget(null)} className="rounded-full px-4 py-2 text-sm font-bold text-m3-on-surface-variant hover:bg-m3-on-surface/10">{t('torrent.cancel')}</button>
              <button type="submit" disabled={!/^\d+(?:\.\d+)?$/.test(torrentEpisode.trim()) || Boolean(torrentSeason.trim() && (!/^\d+$/.test(torrentSeason.trim()) || Number(torrentSeason) <= 0))} className="primary-action px-5 py-2 disabled:opacity-40"><Magnet size={16}/>{t('torrent.findReleases')}</button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  )
}
