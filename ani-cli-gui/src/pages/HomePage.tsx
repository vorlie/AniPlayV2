import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarClock, ChevronLeft, Flame, ListPlus, Loader2, LogIn, LogOut, Play, RotateCcw, Search, Sparkles, Star, TrendingUp, UserRound } from 'lucide-react'
import { getCatalogProvider, getTranslationType, invokeSearch, type AnimeSearchResult, type CatalogProvider } from '../lib/api'
import { readHistory, type HistoryEntry } from '../lib/history'
import type { AnimeDetails, AnimeSummary, AniListStatus, CatalogCandidate, CatalogMapping, DashboardData, ListUpdateInput } from '../anilist-types'

interface HomePageProps {
  setSearchQuery: (val: string) => void
  setResults: (val: AnimeSearchResult[]) => void
  onSelectAnime: (anime: AnimeSearchResult, options?: { episode?: string | null; resumeSeconds?: number | null }) => void
  onResume: (item: HistoryEntry) => void
  initialSelectedId?: number | null
  onClearInitialSelection?: () => void
}

interface EpisodeSuggestion {
  episode: string
  resumeSeconds?: number
  label: string
}

interface PlaybackTarget {
  anime: AnimeSearchResult
  mapping?: CatalogMapping
}

interface CandidateDialog {
  media: AnimeSummary
  query: string
  items: CatalogCandidate[]
  loading: boolean
  error: string | null
}

function episodeLabel(media: AnimeSummary) {
  if (media.nextAiringEpisode) return `Ep ${Math.max(1, media.nextAiringEpisode.episode - 1)}${media.episodes ? ` / ${media.episodes}` : ''}`
  return media.episodes ? `${media.episodes} episodes` : media.format ?? 'Anime'
}

function timeUntil(timestamp: number) {
  const hours = Math.max(0, Math.round((timestamp * 1000 - Date.now()) / 3_600_000))
  if (hours < 24) return `in ${hours}h`
  return `in ${Math.round(hours / 24)}d`
}

function providerLabel(provider: CatalogProvider) {
  if (provider === 'allanime') return 'AllAnime'
  if (provider === 'desu') return 'Desu'
  if (provider === 'miruro') return 'Miruro'
  return 'Anikoto'
}

function queryCandidates(media: AnimeSummary) {
  return [...new Set([media.titleEnglish, media.titleRomaji, media.title, ...media.synonyms].filter((item): item is string => Boolean(item)))].slice(0, 3)
}

function suggestedEpisode(media: AnimeSummary): EpisodeSuggestion {
  const history = readHistory().find((item) => item.aniListMediaId === media.id)
  if (history) return { episode: history.episode, resumeSeconds: history.progressSeconds, label: `Continue episode ${history.episode}` }
  const progress = media.listState?.progress ?? 0
  const next = Math.max(1, progress + 1)
  const episode = media.episodes ? Math.min(next, media.episodes) : next
  return {
    episode: String(episode),
    label: progress > 0 ? `AniList progress suggests episode ${episode}` : 'Start from episode 1',
  }
}

function normalizeTitle(value: string) {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}

function scorePlaybackCandidate(media: AnimeSummary, anime: AnimeSearchResult): CatalogCandidate {
  const candidateName = normalizeTitle(anime.name)
  const titles = [media.title, media.titleEnglish, media.titleRomaji, ...media.synonyms].filter((item): item is string => Boolean(item)).map(normalizeTitle)
  let confidence = 0
  const reasons: string[] = []
  if (titles.includes(candidateName)) {
    confidence += 0.82
    reasons.push('exact title')
  } else if (titles.some((title) => title.includes(candidateName) || candidateName.includes(title))) {
    confidence += 0.58
    reasons.push('partial title')
  } else {
    const words = new Set(candidateName.split(' '))
    const best = Math.max(...titles.map((title) => title.split(' ').filter((word) => words.has(word)).length / Math.max(words.size, title.split(' ').length)), 0)
    confidence += best * 0.55
    if (best > .5) reasons.push('similar title')
  }
  if (media.episodes && anime.episodes) {
    if (media.episodes === anime.episodes) {
      confidence += .14
      reasons.push('episode count')
    } else if (Math.abs(media.episodes - anime.episodes) > 2) {
      confidence -= .12
    }
  }
  return { anime, confidence: Math.max(0, Math.min(1, confidence)), reasons }
}

function rankPlaybackCandidates(media: AnimeSummary, items: AnimeSearchResult[]) {
  return items.map((anime) => scorePlaybackCandidate(media, anime)).sort((a, b) => b.confidence - a.confidence)
}

function MediaCard({ media, label, onClick }: { media: AnimeSummary; label?: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="group flex h-32 overflow-hidden rounded-2xl border border-m3-outline/15 bg-m3-surface/50 text-left transition-all hover:-translate-y-0.5 hover:border-m3-primary/40">
      <div className="w-22 shrink-0 bg-m3-surface-variant/20">
        {media.coverUrl ? <img src={media.coverUrl} alt="" className="h-full w-full object-cover" loading="lazy" /> : <div className="h-full" style={{ backgroundColor: media.accentColor }} />}
      </div>
      <div className="min-w-0 flex-1 p-3 flex flex-col justify-between">
        <div><span className="text-[10px] font-bold uppercase tracking-wider text-m3-primary">{label ?? media.format ?? 'Anime'}</span><h4 className="mt-1 line-clamp-2 text-sm font-black group-hover:text-m3-primary">{media.title}</h4></div>
        <div className="flex gap-2 text-[11px] text-m3-on-surface-variant"><span>{episodeLabel(media)}</span>{media.averageScore ? <span>★ {media.averageScore}%</span> : null}</div>
      </div>
    </button>
  )
}

function Section({ title, icon, items, onSelect, label }: { title: string; icon: React.ReactNode; items: AnimeSummary[]; onSelect: (item: AnimeSummary) => void; label?: string }) {
  if (!items.length) return null
  return <section className="space-y-3"><div className="flex items-center gap-2 text-m3-on-surface">{icon}<h3 className="text-lg font-black">{title}</h3></div><div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">{items.map((item) => <MediaCard key={item.id} media={item} label={label} onClick={() => onSelect(item)} />)}</div></section>
}

function DetailsView({ id, onBack, onOpenAnime, onChanged }: { id: number; onBack: () => void; onOpenAnime: (media: AnimeSummary, anime: AnimeSearchResult, suggestion: EpisodeSuggestion) => void; onChanged: () => void }) {
  const [media, setMedia] = useState<AnimeDetails | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<AniListStatus>('PLANNING')
  const [progress, setProgress] = useState(0)
  const [score, setScore] = useState(0)
  const [repeat, setRepeat] = useState(0)
  const [target, setTarget] = useState<PlaybackTarget | null>(null)
  const [matchLoading, setMatchLoading] = useState(false)
  const [matchError, setMatchError] = useState<string | null>(null)
  const [candidateDialog, setCandidateDialog] = useState<CandidateDialog | null>(null)

  const provider = getCatalogProvider()
  const translationType = getTranslationType()
  const suggestion = useMemo(() => media ? suggestedEpisode(media) : null, [media])

  const searchForCandidates = useCallback(async (item: AnimeSummary, query: string) => {
    const response = await invokeSearch(query, provider)
    if (!response.success) throw new Error(response.error || 'Search failed. Please try again.')
    return rankPlaybackCandidates(item, response.data ?? [])
  }, [provider])

  const preparePlaybackTarget = useCallback(async (item: AnimeSummary) => {
    setMatchLoading(true)
    setMatchError(null)
    try {
      for (const query of queryCandidates(item)) {
        const response = await invokeSearch(query, provider)
        if (!response.success || !response.data?.length) continue
        const resolution = await window.aniPlay!.aniList.mapping.resolve(item, response.data, translationType)
        if (resolution.mapping) {
          setTarget({
            mapping: resolution.mapping,
            anime: {
              id: resolution.mapping.scraperId,
              name: resolution.mapping.scraperName,
              episodes: resolution.mapping.episodes,
              catalogProvider: resolution.mapping.catalogProvider,
            },
          })
          return
        }
        if (resolution.candidates.length) {
          setTarget(null)
          setCandidateDialog({ media: item, query, items: resolution.candidates.slice(0, 8), loading: false, error: null })
          return
        }
      }
      setTarget(null)
      setMatchError('No playback match found yet. Try a manual search.')
    } catch (cause) {
      setTarget(null)
      setMatchError(cause instanceof Error ? cause.message : 'Could not prepare playback.')
    } finally {
      setMatchLoading(false)
    }
  }, [provider, translationType])

  useEffect(() => {
    void window.aniPlay!.aniList.media.get(id).then((item) => {
      setMedia(item)
      setStatus(item.listState?.status ?? 'PLANNING')
      setProgress(item.listState?.progress ?? 0)
      setScore(item.listState?.score ?? 0)
      setRepeat(item.listState?.repeat ?? 0)
      void preparePlaybackTarget(item)
    }).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Could not load anime'))
  }, [id, preparePlaybackTarget])

  const save = async () => {
    if (!media) return; setSaving(true); setError(null)
    try { const input: ListUpdateInput = { mediaId: media.id, status, progress, score, repeat }; const listState = await window.aniPlay!.aniList.list.update(input); setMedia({ ...media, listState }); onChanged() }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not update AniList') } finally { setSaving(false) }
  }

  const remove = async () => {
    if (!media?.listState) return; setSaving(true)
    try { await window.aniPlay!.aniList.list.delete(media.listState.id); setMedia({ ...media, listState: undefined }); onChanged() } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not remove list entry') } finally { setSaving(false) }
  }

  const openCandidateSearch = async (query?: string) => {
    if (!media) return
    const nextQuery = query ?? queryCandidates(media)[0] ?? media.title
    setCandidateDialog({ media, query: nextQuery, items: [], loading: true, error: null })
    try {
      const items = await searchForCandidates(media, nextQuery)
      setCandidateDialog({ media, query: nextQuery, items: items.slice(0, 8), loading: false, error: null })
    } catch (cause) {
      setCandidateDialog({ media, query: nextQuery, items: [], loading: false, error: cause instanceof Error ? cause.message : 'Search failed. Please try again.' })
    }
  }

  const chooseCandidate = async (item: CatalogCandidate) => {
    if (!media) return
    const mapping = await window.aniPlay!.aniList.mapping.confirm(media.id, item.anime, translationType)
    setTarget({ anime: item.anime, mapping })
    setCandidateDialog(null)
    setMatchError(null)
  }

  const forgetMatch = async () => {
    if (!media) return
    await window.aniPlay!.aniList.mapping.forget(media.id)
    setTarget(null)
    setMatchError('Playback match cleared. Search again to choose a new match.')
  }

  if (error && !media) return <div className="m3-card p-6"><button onClick={onBack} className="icon-button"><ChevronLeft /></button><p className="mt-4 text-red-300">{error}</p></div>
  if (!media) return <div className="m3-card min-h-80 flex items-center justify-center"><Loader2 className="animate-spin text-m3-primary" /></div>

  return <div className="space-y-4">
    <section className="m3-card overflow-hidden relative"><div className="absolute inset-0 bg-cover bg-center opacity-35" style={media.bannerUrl ? { backgroundImage: `url(${media.bannerUrl})` } : { backgroundColor: media.accentColor }} /><div className="absolute inset-0 bg-gradient-to-b from-m3-surface/20 via-m3-surface/65 to-m3-surface" /><div className="relative p-5 md:p-7 flex flex-col md:flex-row gap-5 pt-24">
      <img src={media.coverUrl} alt="" className="w-36 h-52 object-cover rounded-2xl shadow-xl self-center md:self-end" />
      <div className="flex-1 self-end"><button onClick={onBack} className="mb-3 inline-flex items-center gap-1 text-sm font-bold text-m3-primary"><ChevronLeft size={18}/> Dashboard</button><h2 className="text-3xl font-black">{media.title}</h2><div className="mt-2 flex flex-wrap gap-2 text-xs text-m3-on-surface-variant"><span>{media.format}</span><span>{media.season} {media.seasonYear}</span><span>{media.status}</span><span>{media.episodes ?? '?'} episodes</span>{media.averageScore ? <span>★ {media.averageScore}%</span> : null}</div></div>
    </div></section>
    {error ? <p role="alert" className="rounded-xl bg-red-500/10 p-3 text-sm text-red-300">{error}</p> : null}
    <div className="grid lg:grid-cols-[1fr_360px] gap-4">
      <section className="space-y-4">
        <div className="m3-card p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <h3 className="font-black">Ready to watch</h3>
              <p className="mt-1 text-sm text-m3-on-surface-variant">AniPlay will use {providerLabel(provider)} with {translationType === 'dub' ? 'dubbed' : 'subbed'} playback.</p>
            </div>
            <button disabled={!target || !suggestion} onClick={() => target && suggestion && onOpenAnime(media, target.anime, suggestion)} className="primary-action justify-center px-5 py-2.5 disabled:opacity-50">
              <Play size={17}/> Play
            </button>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-m3-outline/20 bg-m3-surface-container/40 p-3">
              <p className="text-xs font-bold uppercase tracking-wider text-m3-on-surface-variant">Episode</p>
              <p className="mt-1 font-black">Episode {suggestion?.episode ?? '1'}</p>
              <p className="mt-1 text-xs text-m3-on-surface-variant">{suggestion?.label ?? 'Start from episode 1'}</p>
            </div>
            <div className="rounded-2xl border border-m3-outline/20 bg-m3-surface-container/40 p-3 md:col-span-2">
              <p className="text-xs font-bold uppercase tracking-wider text-m3-on-surface-variant">Playback match</p>
              {matchLoading ? <p className="mt-2 flex items-center gap-2 text-sm text-m3-on-surface-variant"><Loader2 size={14} className="animate-spin" /> Finding best match...</p> : target ? <>
                <p className="mt-1 truncate font-black">{target.anime.name}</p>
                <p className="mt-1 text-xs text-m3-on-surface-variant">{providerLabel(target.anime.catalogProvider)} · {target.anime.episodes || '?'} episodes</p>
              </> : <p className="mt-2 text-sm text-m3-on-surface-variant">{matchError ?? 'No playback match selected.'}</p>}
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={() => void openCandidateSearch()} className="rounded-xl border border-m3-outline/30 px-3 py-2 text-sm font-bold hover:bg-m3-on-surface/10"><Search size={14} className="inline mr-1" /> {target ? 'Change match' : 'Search again'}</button>
            <button disabled={!target} onClick={() => void forgetMatch()} className="rounded-xl border border-m3-outline/30 px-3 py-2 text-sm font-bold hover:bg-m3-on-surface/10 disabled:opacity-50"><RotateCcw size={14} className="inline mr-1" /> Forget match</button>
          </div>
        </div>
        <div className="m3-card p-5"><h3 className="font-black">About</h3><p className="mt-3 whitespace-pre-line text-sm leading-6 text-m3-on-surface-variant">{media.description}</p><div className="mt-4 flex flex-wrap gap-2">{media.genres.map((genre) => <span key={genre} className="rounded-full bg-m3-primary/10 px-3 py-1 text-xs text-m3-primary">{genre}</span>)}</div></div>
      </section>
      <aside className="m3-card p-5"><h3 className="flex items-center gap-2 font-black"><ListPlus size={18}/> My AniList</h3><div className="mt-4 grid gap-3"><label className="text-xs text-m3-on-surface-variant">Status<select value={status} onChange={(e) => setStatus(e.target.value as AniListStatus)} className="mt-1 w-full rounded-xl bg-m3-surface p-2.5 text-m3-on-surface">{['CURRENT','PLANNING','COMPLETED','PAUSED','DROPPED','REPEATING'].map((item) => <option key={item}>{item}</option>)}</select></label><div className="grid grid-cols-3 gap-2">{[['Progress', progress, setProgress], ['Score', score, setScore], ['Repeats', repeat, setRepeat]].map(([label, value, setter]) => <label key={String(label)} className="text-xs text-m3-on-surface-variant">{String(label)}<input type="number" min="0" max={label === 'Score' ? 100 : undefined} value={value as number} onChange={(e) => (setter as (n: number) => void)(Number(e.target.value))} className="mt-1 w-full rounded-xl bg-m3-surface p-2.5 text-m3-on-surface" /></label>)}</div><button disabled={saving} onClick={() => void save()} className="primary-action justify-center py-2.5">{saving ? <Loader2 className="animate-spin" size={16}/> : null} Save</button>{media.listState ? <button disabled={saving} onClick={() => void remove()} className="text-xs text-red-300 hover:underline">Remove from AniList</button> : null}</div></aside>
    </div>
    <Section title="Recommendations" icon={<Sparkles size={18} className="text-m3-primary"/>} items={media.recommendations} onSelect={(item) => { window.scrollTo({ top: 0, behavior: 'smooth' }); setMedia(null); window.aniPlay!.aniList.media.get(item.id).then((next) => { setMedia(next); void preparePlaybackTarget(next) }).catch(() => setError('Could not load recommendation')) }} />
    {candidateDialog ? <CandidateModal key={`${candidateDialog.media.id}:${candidateDialog.query}`} dialog={candidateDialog} setDialog={setCandidateDialog} onRetry={(query) => void openCandidateSearch(query)} onChoose={(item) => void chooseCandidate(item)} /> : null}
  </div>
}

function CandidateModal({ dialog, setDialog, onRetry, onChoose }: { dialog: CandidateDialog; setDialog: (dialog: CandidateDialog | null) => void; onRetry: (query: string) => void; onChoose: (item: CatalogCandidate) => void }) {
  const [query, setQuery] = useState(dialog.query)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="m3-card w-full max-w-2xl p-5">
        <h3 className="text-xl font-black">Choose the playback match</h3>
        <p className="mt-1 text-sm text-m3-on-surface-variant">AniList title: {dialog.media.title}</p>
        <div className="mt-4 flex gap-2 rounded-2xl border border-m3-outline/25 bg-m3-surface/55 p-1.5">
          <Search aria-hidden="true" className="ml-2 self-center text-m3-outline" size={18} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && query.trim()) onRetry(query.trim()) }} className="min-w-0 flex-1 bg-transparent px-2 py-2 text-m3-on-surface outline-none" />
          <button disabled={!query.trim() || dialog.loading} onClick={() => onRetry(query.trim())} className="primary-action px-4 py-2 disabled:opacity-50">{dialog.loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />} Retry</button>
        </div>
        {dialog.error ? <p role="alert" className="mt-3 rounded-xl bg-red-500/10 p-3 text-sm text-red-300">{dialog.error}</p> : null}
        <div className="mt-4 max-h-96 space-y-2 overflow-y-auto">
          {dialog.loading ? <div className="flex min-h-32 items-center justify-center text-m3-on-surface-variant"><Loader2 className="animate-spin" /></div> : dialog.items.length ? dialog.items.map((item) => (
            <button key={`${item.anime.catalogProvider}:${item.anime.id}`} onClick={() => onChoose(item)} className="w-full rounded-xl border border-m3-outline/20 p-3 text-left hover:border-m3-primary">
              <div className="flex items-start justify-between gap-3"><p className="font-bold">{item.anime.name}</p><span className="rounded-full bg-m3-primary/15 px-2 py-1 text-xs font-black text-m3-primary">{Math.round(item.confidence * 100)}%</span></div>
              <p className="mt-1 text-xs text-m3-on-surface-variant">{providerLabel(item.anime.catalogProvider)} · {item.anime.episodes || '?'} episodes · {item.reasons.join(', ') || 'title candidate'}</p>
            </button>
          )) : <div className="rounded-2xl border border-m3-outline/20 p-6 text-center text-sm text-m3-on-surface-variant">No matches found for this query. Try a shorter title or alternate romanization.</div>}
        </div>
        <button onClick={() => setDialog(null)} className="mt-4 text-sm text-m3-on-surface-variant hover:text-m3-on-surface">Cancel</button>
      </div>
    </div>
  )
}

export function HomePage({ setSearchQuery, setResults, onSelectAnime, onResume, initialSelectedId = null, onClearInitialSelection }: HomePageProps) {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(() => initialSelectedId)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [authBusy, setAuthBusy] = useState(false)

  const load = useCallback(() => { setLoading(true); setError(null); void window.aniPlay!.aniList.dashboard.get().then(setDashboard).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'AniList is unavailable')).finally(() => setLoading(false)) }, [])
  useEffect(() => { void window.aniPlay!.aniList.dashboard.get().then(setDashboard).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'AniList is unavailable')).finally(() => setLoading(false)) }, [])
  const signIn = async () => { setAuthBusy(true); setError(null); try { await window.aniPlay!.aniList.auth.start(); load() } catch (cause) { setError(cause instanceof Error ? cause.message : 'Sign-in failed') } finally { setAuthBusy(false) } }
  const logout = async () => { await window.aniPlay!.aniList.auth.logout(); load() }

  const openMapped = (media: AnimeSummary, anime: AnimeSearchResult, suggestion: EpisodeSuggestion) => {
    const selection = { ...anime, aniListMediaId: media.id, coverUrl: media.coverUrl || undefined }
    setSearchQuery(anime.name)
    setResults([selection])
    onSelectAnime(selection, { episode: suggestion.episode, resumeSeconds: suggestion.resumeSeconds ?? null })
  }

  if (selectedId) return <DetailsView id={selectedId} onBack={() => { setSelectedId(null); onClearInitialSelection?.() }} onOpenAnime={openMapped} onChanged={load} />
  const history = readHistory().slice(0, 4)
  return <div className="flex-1 flex flex-col gap-5">
    <section className="m3-card p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4"><div><p className="section-label"><Flame size={14}/> AniList discovery</p><h2 className="mt-2 text-3xl md:text-4xl font-black">Your anime dashboard.</h2><p className="mt-1 text-sm text-m3-on-surface-variant">Discover, track, and open titles in AniPlay’s playback catalog.</p></div>{dashboard?.session.authenticated ? <div className="flex items-center gap-3"><div className="text-right"><p className="text-xs text-m3-on-surface-variant">Signed in as</p><p className="font-bold">{dashboard.session.user?.name}</p></div>{dashboard.session.user?.avatar ? <img src={dashboard.session.user.avatar} className="size-10 rounded-full" alt=""/> : <UserRound/>}<button onClick={() => void logout()} className="icon-button" title="Sign out"><LogOut size={18}/></button></div> : <button disabled={authBusy || !dashboard?.session.configured} onClick={() => void signIn()} className="primary-action px-4 py-2.5" title={dashboard?.session.configured ? undefined : 'Set ANILIST_CLIENT_ID to enable sign-in'}>{authBusy ? <Loader2 className="animate-spin" size={18}/> : <LogIn size={18}/>} Sign in with AniList</button>}</section>
    {dashboard?.stale ? <p className="rounded-xl bg-amber-500/10 px-4 py-2 text-xs text-amber-200">AniList is temporarily unavailable. Showing cached data.</p> : null}{error ? <p role="alert" className="rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</p> : null}
    {loading ? <div className="m3-card min-h-72 flex items-center justify-center"><Loader2 className="animate-spin text-m3-primary"/></div> : dashboard ? <>
      {history.length ? <section className="space-y-3"><h3 className="flex items-center gap-2 text-lg font-black"><Play size={18} className="text-m3-primary"/> Continue Watching</h3><div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2.5">{history.map((item) => <button key={`${item.animeId}:${item.episode}`} onClick={() => onResume(item)} className="m3-card p-4 text-left hover:border-m3-primary/40"><p className="truncate font-bold">{item.animeName}</p><p className="mt-1 text-xs text-m3-on-surface-variant">Episode {item.episode}</p></button>)}</div></section> : null}
      <Section title="Watching" icon={<Play size={18} className="text-m3-primary"/>} items={dashboard.current} onSelect={(item) => setSelectedId(item.id)} />
      <Section title="Planning" icon={<ListPlus size={18} className="text-m3-primary"/>} items={dashboard.planning} onSelect={(item) => setSelectedId(item.id)} />
      <Section title="Recommended for you" icon={<Star size={18} className="text-m3-primary"/>} items={dashboard.recommendations} onSelect={(item) => setSelectedId(item.id)} />
      {dashboard.airing.length ? <section className="space-y-3"><h3 className="flex items-center gap-2 text-lg font-black"><CalendarClock size={18} className="text-m3-primary"/> Airing soon</h3><div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2.5">{dashboard.airing.map((item) => <MediaCard key={`${item.media.id}:${item.episode}`} media={item.media} label={`Ep ${item.episode} ${timeUntil(item.airingAt)}`} onClick={() => setSelectedId(item.media.id)} />)}</div></section> : null}
      <Section title="Trending now" icon={<TrendingUp size={18} className="text-m3-primary"/>} items={dashboard.trending} onSelect={(item) => setSelectedId(item.id)} />
      <Section title="Popular this season" icon={<Sparkles size={18} className="text-m3-primary"/>} items={dashboard.seasonal} onSelect={(item) => setSelectedId(item.id)} />
      <Section title="Completed" icon={<Star size={18} className="text-m3-primary"/>} items={dashboard.completed} onSelect={(item) => setSelectedId(item.id)} />
    </> : null}
  </div>
}
