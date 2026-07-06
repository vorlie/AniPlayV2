import { useCallback, useEffect, useState } from 'react'
import { CalendarClock, ChevronLeft, Flame, ListPlus, Loader2, LogIn, LogOut, Play, Sparkles, Star, TrendingUp, UserRound } from 'lucide-react'
import { getTranslationType, invokeSearch, type AnimeSearchResult } from '../lib/api'
import { readHistory, type HistoryEntry } from '../lib/history'
import type { AnimeDetails, AnimeSummary, AniListStatus, CatalogCandidate, DashboardData, ListUpdateInput } from '../anilist-types'

interface HomePageProps {
  setSearchQuery: (val: string) => void
  setResults: (val: AnimeSearchResult[]) => void
  onSelectAnime: (anime: AnimeSearchResult) => void
  onResume: (item: HistoryEntry) => void
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

function DetailsView({ id, onBack, onWatch, onChanged }: { id: number; onBack: () => void; onWatch: (media: AnimeSummary) => void; onChanged: () => void }) {
  const [media, setMedia] = useState<AnimeDetails | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<AniListStatus>('PLANNING')
  const [progress, setProgress] = useState(0)
  const [score, setScore] = useState(0)
  const [repeat, setRepeat] = useState(0)

  useEffect(() => {
    void window.aniPlay!.aniList.media.get(id).then((item) => { setMedia(item); setStatus(item.listState?.status ?? 'PLANNING'); setProgress(item.listState?.progress ?? 0); setScore(item.listState?.score ?? 0); setRepeat(item.listState?.repeat ?? 0) }).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Could not load anime'))
  }, [id])

  const save = async () => {
    if (!media) return; setSaving(true); setError(null)
    try { const input: ListUpdateInput = { mediaId: media.id, status, progress, score, repeat }; const listState = await window.aniPlay!.aniList.list.update(input); setMedia({ ...media, listState }); onChanged() }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not update AniList') } finally { setSaving(false) }
  }
  const remove = async () => {
    if (!media?.listState) return; setSaving(true)
    try { await window.aniPlay!.aniList.list.delete(media.listState.id); setMedia({ ...media, listState: undefined }); onChanged() } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not remove list entry') } finally { setSaving(false) }
  }

  if (error && !media) return <div className="m3-card p-6"><button onClick={onBack} className="icon-button"><ChevronLeft /></button><p className="mt-4 text-red-300">{error}</p></div>
  if (!media) return <div className="m3-card min-h-80 flex items-center justify-center"><Loader2 className="animate-spin text-m3-primary" /></div>
  return <div className="space-y-4">
    <section className="m3-card overflow-hidden relative"><div className="absolute inset-0 bg-cover bg-center opacity-35" style={media.bannerUrl ? { backgroundImage: `url(${media.bannerUrl})` } : { backgroundColor: media.accentColor }} /><div className="absolute inset-0 bg-gradient-to-b from-m3-surface/20 via-m3-surface/65 to-m3-surface" /><div className="relative p-5 md:p-7 flex flex-col md:flex-row gap-5 pt-24">
      <img src={media.coverUrl} alt="" className="w-36 h-52 object-cover rounded-2xl shadow-xl self-center md:self-end" />
      <div className="flex-1 self-end"><button onClick={onBack} className="mb-3 inline-flex items-center gap-1 text-sm font-bold text-m3-primary"><ChevronLeft size={18}/> Dashboard</button><h2 className="text-3xl font-black">{media.title}</h2><div className="mt-2 flex flex-wrap gap-2 text-xs text-m3-on-surface-variant"><span>{media.format}</span><span>{media.season} {media.seasonYear}</span><span>{media.status}</span><span>{media.episodes ?? '?'} episodes</span>{media.averageScore ? <span>★ {media.averageScore}%</span> : null}</div><div className="mt-4 flex flex-wrap items-center gap-3"><button onClick={() => onWatch(media)} className="primary-action px-5 py-2.5"><Play size={17}/> Watch</button><button onClick={() => void window.aniPlay!.aniList.mapping.forget(media.id)} className="text-xs text-m3-on-surface-variant hover:text-m3-primary">Reset playback match</button></div></div>
    </div></section>
    {error ? <p role="alert" className="rounded-xl bg-red-500/10 p-3 text-sm text-red-300">{error}</p> : null}
    <div className="grid lg:grid-cols-[1fr_360px] gap-4"><section className="m3-card p-5"><h3 className="font-black">About</h3><p className="mt-3 whitespace-pre-line text-sm leading-6 text-m3-on-surface-variant">{media.description}</p><div className="mt-4 flex flex-wrap gap-2">{media.genres.map((genre) => <span key={genre} className="rounded-full bg-m3-primary/10 px-3 py-1 text-xs text-m3-primary">{genre}</span>)}</div></section>
      <aside className="m3-card p-5"><h3 className="flex items-center gap-2 font-black"><ListPlus size={18}/> My AniList</h3><div className="mt-4 grid gap-3"><label className="text-xs text-m3-on-surface-variant">Status<select value={status} onChange={(e) => setStatus(e.target.value as AniListStatus)} className="mt-1 w-full rounded-xl bg-m3-surface p-2.5 text-m3-on-surface">{['CURRENT','PLANNING','COMPLETED','PAUSED','DROPPED','REPEATING'].map((item) => <option key={item}>{item}</option>)}</select></label><div className="grid grid-cols-3 gap-2">{[['Progress', progress, setProgress], ['Score', score, setScore], ['Repeats', repeat, setRepeat]].map(([label, value, setter]) => <label key={String(label)} className="text-xs text-m3-on-surface-variant">{String(label)}<input type="number" min="0" max={label === 'Score' ? 100 : undefined} value={value as number} onChange={(e) => (setter as (n: number) => void)(Number(e.target.value))} className="mt-1 w-full rounded-xl bg-m3-surface p-2.5 text-m3-on-surface" /></label>)}</div><button disabled={saving} onClick={() => void save()} className="primary-action justify-center py-2.5">{saving ? <Loader2 className="animate-spin" size={16}/> : null} Save</button>{media.listState ? <button disabled={saving} onClick={() => void remove()} className="text-xs text-red-300 hover:underline">Remove from AniList</button> : null}</div></aside></div>
    <Section title="Recommendations" icon={<Sparkles size={18} className="text-m3-primary"/>} items={media.recommendations} onSelect={(item) => { window.scrollTo({ top: 0, behavior: 'smooth' }); setMedia(null); window.aniPlay!.aniList.media.get(item.id).then(setMedia).catch(() => setError('Could not load recommendation')) }} />
  </div>
}

export function HomePage({ setSearchQuery, setResults, onSelectAnime, onResume }: HomePageProps) {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [authBusy, setAuthBusy] = useState(false)
  const [candidates, setCandidates] = useState<{ media: AnimeSummary; items: CatalogCandidate[] } | null>(null)

  const load = useCallback(() => { setLoading(true); setError(null); void window.aniPlay!.aniList.dashboard.get().then(setDashboard).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'AniList is unavailable')).finally(() => setLoading(false)) }, [])
  useEffect(() => { void window.aniPlay!.aniList.dashboard.get().then(setDashboard).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'AniList is unavailable')).finally(() => setLoading(false)) }, [])
  const signIn = async () => { setAuthBusy(true); setError(null); try { await window.aniPlay!.aniList.auth.start(); load() } catch (cause) { setError(cause instanceof Error ? cause.message : 'Sign-in failed') } finally { setAuthBusy(false) } }
  const logout = async () => { await window.aniPlay!.aniList.auth.logout(); load() }

  const openMapped = (media: AnimeSummary, anime: AnimeSearchResult) => {
    const selection = { ...anime, aniListMediaId: media.id, coverUrl: media.coverUrl || undefined }
    setSearchQuery(anime.name); setResults([selection]); onSelectAnime(selection)
  }
  const watch = async (media: AnimeSummary) => {
    setError(null)
    try {
      const queries = [...new Set([media.titleEnglish, media.titleRomaji, media.title, ...media.synonyms].filter((item): item is string => Boolean(item)))].slice(0, 3)
      let results: AnimeSearchResult[] = []
      for (const query of queries) { const response = await invokeSearch(query); if (response.success && response.data?.length) { results = response.data; break } }
      const resolution = await window.aniPlay!.aniList.mapping.resolve(media, results, getTranslationType())
      if (resolution.mapping) { openMapped(media, { id: resolution.mapping.scraperId, name: resolution.mapping.scraperName, episodes: resolution.mapping.episodes }); return }
      if (!resolution.candidates.length) throw new Error(`No playable catalog result found for “${media.title}”.`)
      setCandidates({ media, items: resolution.candidates.slice(0, 8) })
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not find this anime in the playback catalog') }
  }
  const choose = async (media: AnimeSummary, anime: AnimeSearchResult) => { await window.aniPlay!.aniList.mapping.confirm(media.id, anime, getTranslationType()); setCandidates(null); openMapped(media, anime) }

  if (selectedId) return <DetailsView id={selectedId} onBack={() => setSelectedId(null)} onWatch={(media) => void watch(media)} onChanged={load} />
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
    {candidates ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"><div className="m3-card w-full max-w-xl p-5"><h3 className="text-xl font-black">Choose the playback match</h3><p className="mt-1 text-sm text-m3-on-surface-variant">AniList title: {candidates.media.title}. Your choice will be remembered.</p><div className="mt-4 max-h-96 space-y-2 overflow-y-auto">{candidates.items.map((item) => <button key={item.anime.id} onClick={() => void choose(candidates.media, item.anime)} className="w-full rounded-xl border border-m3-outline/20 p-3 text-left hover:border-m3-primary"><p className="font-bold">{item.anime.name}</p><p className="text-xs text-m3-on-surface-variant">{item.anime.episodes || '?'} episodes · {Math.round(item.confidence * 100)}% match · {item.reasons.join(', ') || 'title candidate'}</p></button>)}</div><button onClick={() => setCandidates(null)} className="mt-4 text-sm text-m3-on-surface-variant hover:text-m3-on-surface">Cancel</button></div></div> : null}
  </div>
}
