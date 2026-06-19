import { useEffect, useState } from 'react'
import { Flame, Loader2, Sparkles, TrendingUp } from 'lucide-react'
import { invokeSearch } from '../lib/api'

interface SearchResult {
  id: string
  name: string
  episodes: number
}

interface HomePageProps {
  setSearchQuery: (val: string) => void
  setResults: (val: SearchResult[]) => void
  onSelectAnime: (anime: SearchResult) => void
}

interface AniListTitle {
  romaji?: string | null
  english?: string | null
  native?: string | null
}

interface AniListCoverImage {
  large?: string | null
  color?: string | null
}

interface AniListMedia {
  id: number
  title: AniListTitle
  episodes?: number | null
  coverImage?: AniListCoverImage | null
  nextAiringEpisode?: {
    episode?: number | null
    airingAt?: number | null
  } | null
}

interface HomeItem {
  id: number
  title: string
  episodesLabel: string
  coverUrl: string
  accentColor: string
  sourceLabel: string
}

interface AniListResponse {
  data?: {
    latest?: {
      media?: AniListMedia[]
    }
    trending?: {
      media?: AniListMedia[]
    }
  }
  errors?: Array<{ message?: string }>
}

interface SearchInvokeResponse {
  success: boolean
  data?: SearchResult[]
  error?: string
}

declare global {
  interface Window {
    ipcRenderer?: {
      invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
    }
  }
}

const ANILIST_API = 'https://graphql.anilist.co'
const FEED_QUERY = `
  query HomeFeed($latestPage: Int!, $latestPerPage: Int!, $trendingPage: Int!, $trendingPerPage: Int!) {
    latest: Page(page: $latestPage, perPage: $latestPerPage) {
      media(type: ANIME, status: RELEASING, sort: UPDATED_AT_DESC, isAdult: false) {
        id
        title {
          romaji
          english
          native
        }
        episodes
        nextAiringEpisode {
          episode
          airingAt
        }
        coverImage {
          large
          color
        }
      }
    }
    trending: Page(page: $trendingPage, perPage: $trendingPerPage) {
      media(type: ANIME, status: RELEASING, sort: TRENDING_DESC, isAdult: false) {
        id
        title {
          romaji
          english
          native
        }
        episodes
        nextAiringEpisode {
          episode
          airingAt
        }
        coverImage {
          large
          color
        }
      }
    }
  }
`

function pickTitle(title: AniListTitle) {
  return title.english?.trim() || title.romaji?.trim() || title.native?.trim() || 'Untitled'
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

function buildEpisodeLabel(media: AniListMedia) {
  const total = media.episodes ?? null
  const nextEpisode = media.nextAiringEpisode?.episode ?? null

  if (nextEpisode != null) {
    const current = Math.max(1, nextEpisode - 1)
    return total != null ? `Ep ${current} / ${total}` : `Ep ${current} / ?`
  }

  if (total != null) {
    return `Episodes ${total}`
  }

  return 'Ongoing'
}

function mapMedia(media: AniListMedia[], sourceLabel: string): HomeItem[] {
  return media.map((entry) => ({
    id: entry.id,
    title: pickTitle(entry.title),
    episodesLabel: buildEpisodeLabel(entry),
    coverUrl: entry.coverImage?.large || '',
    accentColor: entry.coverImage?.color || '#D0BCFF',
    sourceLabel,
  }))
}

function pickBestResult(query: string, results: SearchResult[]) {
  if (results.length === 0) return null

  const normalizedQuery = normalizeText(query)
  const exactMatch = results.find((result) => normalizeText(result.name) === normalizedQuery)
  if (exactMatch) return exactMatch

  const includesMatch = results.find((result) => {
    const candidate = normalizeText(result.name)
    return candidate.includes(normalizedQuery) || normalizedQuery.includes(candidate)
  })
  if (includesMatch) return includesMatch

  return results[0]
}

function isSearchInvokeResponse(value: unknown): value is SearchInvokeResponse {
  return typeof value === 'object' && value !== null && 'success' in value
}

export function HomePage({
  setSearchQuery,
  setResults,
  onSelectAnime,
}: HomePageProps) {
  const [latest, setLatest] = useState<HomeItem[]>([])
  const [trending, setTrending] = useState<HomeItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [openingTitle, setOpeningTitle] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState('Pick something new to jump straight into its page.')
  const [actionError, setActionError] = useState<string | null>(null)

  const hasElectronSearch = true

  useEffect(() => {
    const controller = new AbortController()

    async function loadFeed() {
      setLoading(true)
      setError(null)

      try {
        const response = await fetch(ANILIST_API, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          signal: controller.signal,
          body: JSON.stringify({
            query: FEED_QUERY,
            variables: {
              latestPage: 1,
              latestPerPage: 8,
              trendingPage: 1,
              trendingPerPage: 8,
            },
          }),
        })

        const json = (await response.json()) as AniListResponse

        if (!response.ok) {
          throw new Error(`AniList request failed (${response.status})`)
        }

        if (json.errors?.length) {
          throw new Error(json.errors[0].message || 'AniList returned an error')
        }

        const latestMedia = json.data?.latest?.media ?? []
        const trendingMedia = json.data?.trending?.media ?? []

        setLatest(mapMedia(latestMedia, 'Latest'))
        setTrending(mapMedia(trendingMedia, 'Trending'))
      } catch (err) {
        if (controller.signal.aborted) return
        setError(err instanceof Error ? err.message : 'Failed to load AniList feed')
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      }
    }

    void loadFeed()
    return () => controller.abort()
  }, [])

  const handleOpenAnime = async (title: string) => {
    setActionError(null)
    setActionMessage(`Searching "${title}"...`)
    setOpeningTitle(title)
    setSearchQuery(title)

    try {
      const response = await invokeSearch(title)
      if (!isSearchInvokeResponse(response) || !response.success) {
        throw new Error(isSearchInvokeResponse(response) && response.error ? response.error : 'Search failed')
      }

      const results = Array.isArray(response.data) ? response.data : []
      setResults(results)

      const bestMatch = pickBestResult(title, results)
      if (!bestMatch) {
        setActionError(`No search results found for "${title}".`)
        setActionMessage('Try another title from AniList.')
        return
      }

      onSelectAnime(bestMatch)
      setActionMessage(`Opening "${bestMatch.name}"...`)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to open anime')
      setActionMessage('Search pipeline failed.')
    } finally {
      setOpeningTitle(null)
    }
  }

  const renderCardGrid = (items: HomeItem[], emptyLabel: string) => {
    if (loading) {
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-28 rounded-2xl border border-m3-outline/15 bg-m3-surface/40 p-2.5 flex gap-3 animate-pulse">
              <div className="w-16 shrink-0 rounded-xl bg-m3-surface-variant/30" />
              <div className="min-w-0 flex-1 space-y-2 py-1">
                <div className="h-4 w-4/5 rounded bg-m3-surface-variant/30" />
                <div className="h-3 w-2/3 rounded bg-m3-surface-variant/20" />
                <div className="h-3 w-1/2 rounded bg-m3-surface-variant/20" />
              </div>
            </div>
          ))}
        </div>
      )
    }

    if (items.length === 0) {
      return (
        <div className="rounded-2xl border border-dashed border-m3-outline/20 bg-m3-surface/30 px-4 py-6 text-center text-sm text-m3-on-surface-variant">
          {emptyLabel}
        </div>
      )
    }

    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {items.map((item) => {
          const isOpening = openingTitle === item.title
          return (
            <button
              key={item.id}
              type="button"
              disabled={isOpening}
              onClick={() => void handleOpenAnime(item.title)}
              className={`group relative flex h-28 overflow-hidden rounded-2xl border border-m3-outline/15 bg-m3-surface/50 text-left transition-all hover:-translate-y-0.5 hover:border-m3-primary/40 hover:shadow-md ${isOpening ? 'opacity-70 cursor-wait' : ''}`}
            >
              <div className="relative w-20 shrink-0 overflow-hidden bg-m3-surface-variant/20">
                {item.coverUrl ? (
                  <img
                    src={item.coverUrl}
                    alt={item.title}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    loading="lazy"
                  />
                ) : (
                  <div
                    className="flex h-full w-full items-center justify-center"
                    style={{ backgroundColor: item.accentColor }}
                  >
                    <Sparkles className="text-black/70" size={22} />
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1 px-3 py-2.5 flex flex-col justify-between gap-2">
                <div className="flex items-start justify-between gap-2">
                  <span className="inline-flex max-w-full rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
                    {item.sourceLabel}
                  </span>
                  <span className="shrink-0 rounded-full bg-m3-primary px-2 py-0.5 text-[10px] font-black text-m3-on-primary shadow-sm">
                    {item.episodesLabel}
                  </span>
                </div>

                <div className="min-w-0">
                  <h3 className="truncate text-sm font-black text-m3-on-surface group-hover:text-m3-primary transition-colors">
                    {item.title}
                  </h3>
                  <p className="truncate text-xs text-m3-on-surface-variant mt-0.5">
                    Click to open
                  </p>
                </div>
              </div>

              {isOpening && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/30 backdrop-blur-[1px]">
                  <div className="flex items-center gap-2 rounded-full bg-m3-surface-container px-3 py-2 text-sm font-semibold text-m3-on-surface shadow-lg">
                    <Loader2 className="animate-spin" size={16} />
                    Opening
                  </div>
                </div>
              )}
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col gap-4">
      <section className="m3-card p-4 md:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-m3-primary/20 bg-m3-primary/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.2em] text-m3-primary">
              <Flame size={14} />
              Home
            </div>
            <h2 className="mt-2 font-tempo text-3xl md:text-4xl font-bold text-m3-on-surface">
              Discover anime faster.
            </h2>
            <p className="mt-1.5 max-w-xl text-sm md:text-base text-m3-on-surface-variant">
              Browse latest releases and trending picks from AniList, then jump directly into the existing search and playback flow with one click.
            </p>
          </div>

          <div className="rounded-2xl border border-m3-outline/15 bg-m3-surface/40 px-3 py-2.5">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-m3-on-surface-variant">
              Discovery mode
            </p>
            <p className="mt-1 text-sm font-semibold text-m3-on-surface">
              {actionMessage}
            </p>
            {!hasElectronSearch && (
              <p className="mt-1 text-xs text-m3-on-surface-variant">
                Search actions are disabled outside Electron.
              </p>
            )}
          </div>
        </div>

        {actionError && (
          <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {actionError}
          </div>
        )}
      </section>

      {error ? (
        <section className="m3-card flex-1 min-h-60 p-6 flex items-center justify-center text-center">
          <div className="max-w-lg space-y-2">
            <p className="text-lg font-bold text-m3-on-surface">AniList feed unavailable</p>
            <p className="text-sm text-m3-on-surface-variant">{error}</p>
          </div>
        </section>
      ) : (
        <>
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles size={18} className="text-m3-primary" />
              <h3 className="text-lg md:text-xl font-black text-m3-on-surface">Latest releases</h3>
            </div>
            {renderCardGrid(latest, 'No latest releases found right now.')}
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <TrendingUp size={18} className="text-m3-primary" />
              <h3 className="text-lg md:text-xl font-black text-m3-on-surface">Trending now</h3>
            </div>
            {renderCardGrid(trending, 'No trending anime found right now.')}
          </section>
        </>
      )}
    </div>
  )
}
