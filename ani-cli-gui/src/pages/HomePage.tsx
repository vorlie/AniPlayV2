import { useCallback, useEffect, useMemo, useState } from 'react'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import { CalendarClock, ChevronLeft, Flame, ListPlus, Loader2, LogIn, LogOut, Minus, Play, Plus, RotateCcw, Search, Sparkles, TrendingUp, UserRound } from 'lucide-react'
import { getCatalogProvider, getTranslationType, invokeSearch, type AnimeSearchResult, type CatalogProvider } from '../lib/api'
import { readHistory, type HistoryEntry } from '../lib/history'
import type { AnimeDetails, AnimeRelation, AnimeSummary, AniListStatus, CatalogCandidate, CatalogMapping, DashboardData, ListUpdateInput } from '../anilist-types'

interface HomePageProps {
  setSearchQuery: (val: string) => void
  setResults: (val: AnimeSearchResult[]) => void
  onSelectAnime: (anime: AnimeSearchResult, options?: { episode?: string | null; resumeSeconds?: number | null }) => void
  onResume: (item: HistoryEntry) => void
  selectedMediaId?: number | null
  onOpenMedia?: (media: AnimeSummary, originLabel?: string) => void
  onCloseMedia?: () => void
  onMediaResolved?: (media: AnimeSummary) => void
  view?: 'dashboard' | 'discover' | 'library'
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

function episodeLabel(media: AnimeSummary, t: TFunction) {
  if (media.nextAiringEpisode) return `Ep ${Math.max(1, media.nextAiringEpisode.episode - 1)}${media.episodes ? ` / ${media.episodes}` : ''}`
  return media.episodes ? t('home.episodeCount', { count: media.episodes }) : media.format ?? t('home.animeFallback')
}

function timeUntil(timestamp: number, t: TFunction) {
  const hours = Math.max(0, Math.round((timestamp * 1000 - Date.now()) / 3_600_000))
  if (hours < 24) return t('home.inHours', { count: hours })
  return t('home.inDays', { count: Math.round(hours / 24) })
}

function providerLabel(provider: CatalogProvider) {
  if (provider === 'allanime') return 'AllAnime'
  if (provider === 'desu') return 'Desu'
  if (provider === 'docchi') return 'Docchi'
  if (provider === 'anidb') return 'AniDB.app'
  return 'Anikoto'
}

function queryCandidates(media: AnimeSummary) {
  return [...new Set([media.titleEnglish, media.titleRomaji, media.title, ...media.synonyms].filter((item): item is string => Boolean(item)))].slice(0, 3)
}

function suggestedEpisode(media: AnimeSummary, t: TFunction): EpisodeSuggestion {
  const history = readHistory().find((item) => item.aniListMediaId === media.id)
  if (history) return { episode: history.episode, resumeSeconds: history.progressSeconds, label: t('home.continueEpisode', { episode: history.episode }) }
  const progress = media.listState?.progress ?? 0
  const next = Math.max(1, progress + 1)
  const episode = media.episodes ? Math.min(next, media.episodes) : next
  return {
    episode: String(episode),
    label: progress > 0 ? t('home.progressSuggests', { episode }) : t('home.startEpisode'),
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
  const { t } = useTranslation()
  return (
    <button type="button" onClick={onClick} className="group flex h-32 overflow-hidden rounded-2xl border border-m3-outline/15 bg-m3-surface/50 text-left transition-all hover:-translate-y-0.5 hover:border-m3-primary/40">
      <div className="w-22 shrink-0 bg-m3-surface-variant/20">
        {media.coverUrl ? <img src={media.coverUrl} alt="" className="h-full w-full object-cover" loading="lazy" /> : <div className="h-full" style={{ backgroundColor: media.accentColor }} />}
      </div>
      <div className="min-w-0 flex-1 p-3 flex flex-col justify-between">
        <div><span className="text-[10px] font-bold uppercase tracking-wider text-m3-primary">{label ?? media.format ?? t('home.animeFallback')}</span><h4 className="mt-1 line-clamp-2 text-sm font-black group-hover:text-m3-primary">{media.title}</h4></div>
        <div className="flex gap-2 text-[11px] text-m3-on-surface-variant"><span>{episodeLabel(media, t)}</span>{media.averageScore ? <span>★ {media.averageScore}%</span> : null}</div>
      </div>
    </button>
  )
}

function Section({ title, icon, items, onSelect, label }: { title: string; icon: React.ReactNode; items: AnimeSummary[]; onSelect: (item: AnimeSummary) => void; label?: string }) {
  if (!items.length) return null
  return <section className="space-y-3"><div className="flex items-center gap-2 text-m3-on-surface">{icon}<h3 className="text-lg font-black">{title}</h3></div><div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">{items.map((item) => <MediaCard key={item.id} media={item} label={label} onClick={() => onSelect(item)} />)}</div></section>
}

function PosterCard({ media, onClick }: { media: AnimeSummary; onClick: () => void }) {
  const { t } = useTranslation()
  return (
    <button type="button" onClick={onClick} className="group min-w-0 text-left">
      <span className="relative block aspect-[2/3] overflow-hidden rounded-2xl border border-m3-outline/15 bg-m3-surface-variant/20">
        {media.coverUrl ? <img src={media.coverUrl} alt="" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" loading="lazy" /> : <span className="block h-full" style={{ backgroundColor: media.accentColor }} />}
        <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent px-2 pb-2 pt-7 text-[10px] font-black text-white">
          {episodeLabel(media, t)}
        </span>
      </span>
      <strong className="mt-2 block truncate text-xs group-hover:text-m3-primary">{media.title}</strong>
      <span className="mt-0.5 block truncate text-[10px] text-m3-on-surface-variant">{media.format ?? t('home.animeFallback')}{media.averageScore ? ` · ★ ${media.averageScore}%` : ''}</span>
    </button>
  )
}

interface ShelfTab {
  id: string
  label: string
  items: AnimeSummary[]
}

function DashboardShelf({ title, icon, tabs, onSelect }: { title: string; icon: React.ReactNode; tabs: ShelfTab[]; onSelect: (item: AnimeSummary) => void }) {
  const availableTabs = tabs.filter((tab) => tab.items.length)
  const [activeTab, setActiveTab] = useState(availableTabs[0]?.id ?? '')
  if (!availableTabs.length) return null
  const selected = availableTabs.find((tab) => tab.id === activeTab) ?? availableTabs[0]
  return (
    <section className="m3-card dashboard-shelf p-4 min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-black">{icon}{title}</h3>
        <div className="flex max-w-full gap-1 overflow-x-auto" role="tablist" aria-label={title}>
          {availableTabs.map((tab) => <button key={tab.id} type="button" role="tab" aria-selected={selected.id === tab.id} onClick={() => setActiveTab(tab.id)} className={`whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold ${selected.id === tab.id ? 'bg-m3-primary text-m3-on-primary' : 'text-m3-on-surface-variant hover:bg-m3-on-surface/10'}`}>{tab.label}</button>)}
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {selected.items.slice(0, 6).map((item) => <PosterCard key={item.id} media={item} onClick={() => onSelect(item)} />)}
      </div>
    </section>
  )
}

function CollectionTabs({ tabs, active, onChange, label }: { tabs: Array<{ id: string; label: string; count: number }>; active: string; onChange: (id: string) => void; label: string }) {
  return <div className="flex max-w-full gap-1 overflow-x-auto rounded-2xl border border-m3-outline/15 bg-m3-surface/35 p-1.5" role="tablist" aria-label={label}>
    {tabs.map((tab) => <button key={tab.id} type="button" role="tab" aria-selected={active === tab.id} onClick={() => onChange(tab.id)} className={`flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold transition-colors ${active === tab.id ? 'bg-m3-primary text-m3-on-primary' : 'text-m3-on-surface-variant hover:bg-m3-on-surface/10 hover:text-m3-on-surface'}`}><span>{tab.label}</span><span className={`rounded-full px-1.5 py-0.5 text-[10px] ${active === tab.id ? 'bg-m3-on-primary/15' : 'bg-m3-on-surface/8'}`}>{tab.count}</span></button>)}
  </div>
}

function CollectionGrid({ items, onSelect, empty }: { items: AnimeSummary[]; onSelect: (item: AnimeSummary) => void; empty: string }) {
  if (!items.length) return <div className="m3-card flex min-h-52 items-center justify-center p-6 text-center text-sm text-m3-on-surface-variant">{empty}</div>
  return <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{items.map((item) => <MediaCard key={item.id} media={item} onClick={() => onSelect(item)} />)}</div>
}

function RelationsSection({ items, onSelect, t }: { items: AnimeRelation[]; onSelect: (item: AnimeSummary) => void; t: TFunction }) {
  if (!items.length) return null
  return <section className="space-y-3"><div className="flex items-center gap-2 text-m3-on-surface"><ListPlus size={18} className="text-m3-primary"/><h3 className="text-lg font-black">{t('home.relations')}</h3></div><div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">{items.map((item) => <MediaCard key={`${item.relationType}:${item.media.id}`} media={item.media} label={t(`home.relationTypes.${item.relationType.toLowerCase()}`)} onClick={() => onSelect(item.media)} />)}</div></section>
}

const LIST_STATUSES: AniListStatus[] = ['CURRENT', 'PLANNING', 'COMPLETED', 'PAUSED', 'DROPPED', 'REPEATING']

function NumberStepper({ label, value, onChange, max }: { label: string; value: number; onChange: (value: number) => void; max?: number }) {
  const update = (next: number) => onChange(Math.max(0, max === undefined ? next : Math.min(max, next)))
  return (
    <div className="rounded-2xl border border-m3-outline/15 bg-m3-surface/45 p-3">
      <span className="text-[11px] font-bold uppercase tracking-wider text-m3-on-surface-variant">{label}</span>
      <div className="mt-2 flex items-center gap-2">
        <button type="button" onClick={() => update(value - 1)} disabled={value <= 0} className="icon-button !size-9" aria-label={`${label} -1`}><Minus size={15}/></button>
        <input type="number" min="0" max={max} value={value} onChange={(event) => update(Number(event.target.value) || 0)} className="min-w-0 flex-1 bg-transparent text-center text-xl font-black outline-none" aria-label={label}/>
        <button type="button" onClick={() => update(value + 1)} disabled={max !== undefined && value >= max} className="icon-button !size-9" aria-label={`${label} +1`}><Plus size={15}/></button>
      </div>
    </div>
  )
}

function DetailsView({ id, onBack, onOpenAnime, onChanged, onOpenLinkedMedia, onMediaResolved }: { id: number; onBack: () => void; onOpenAnime: (media: AnimeSummary, anime: AnimeSearchResult, suggestion: EpisodeSuggestion) => void; onChanged: () => void; onOpenLinkedMedia?: (media: AnimeSummary) => void; onMediaResolved?: (media: AnimeSummary) => void }) {
  const { t } = useTranslation()
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
  const suggestion = useMemo(() => media ? suggestedEpisode(media, t) : null, [media, t])
  const hasListChanges = Boolean(media && (!media.listState
    || status !== media.listState.status
    || progress !== media.listState.progress
    || score !== media.listState.score
    || repeat !== media.listState.repeat))

  const resetListDraft = () => {
    setStatus(media?.listState?.status ?? 'PLANNING')
    setProgress(media?.listState?.progress ?? 0)
    setScore(media?.listState?.score ?? 0)
    setRepeat(media?.listState?.repeat ?? 0)
  }

  const showMedia = useCallback((item: AnimeDetails) => {
    setMedia(item)
    onMediaResolved?.(item)
    setStatus(item.listState?.status ?? 'PLANNING')
    setProgress(item.listState?.progress ?? 0)
    setScore(item.listState?.score ?? 0)
    setRepeat(item.listState?.repeat ?? 0)
  }, [onMediaResolved])

  const searchForCandidates = useCallback(async (item: AnimeSummary, query: string) => {
    const response = await invokeSearch(query, provider)
    if (!response.success) throw new Error(response.error || t('browse.searchFailed'))
    return rankPlaybackCandidates(item, response.data ?? [])
  }, [provider, t])

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
      setMatchError(t('home.noMatchFound'))
    } catch (cause) {
      setTarget(null)
      setMatchError(cause instanceof Error ? cause.message : t('home.prepareFailed'))
    } finally {
      setMatchLoading(false)
    }
  }, [provider, translationType, t])

  useEffect(() => {
    void window.aniPlay!.aniList.media.get(id).then((item) => {
      showMedia(item)
      void preparePlaybackTarget(item)
    }).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : t('home.loadFailed')))
  }, [id, preparePlaybackTarget, showMedia, t])

  const save = async () => {
    if (!media) return; setSaving(true); setError(null)
    try { const input: ListUpdateInput = { mediaId: media.id, status, progress, score, repeat }; const listState = await window.aniPlay!.aniList.list.update(input); setMedia({ ...media, listState }); onChanged() }
    catch (cause) { setError(cause instanceof Error ? cause.message : t('home.updateFailed')) } finally { setSaving(false) }
  }

  const remove = async () => {
    if (!media?.listState) return; setSaving(true)
    try { await window.aniPlay!.aniList.list.delete(media.listState.id); setMedia({ ...media, listState: undefined }); setStatus('PLANNING'); setProgress(0); setScore(0); setRepeat(0); onChanged() } catch (cause) { setError(cause instanceof Error ? cause.message : t('home.removeFailed')) } finally { setSaving(false) }
  }

  const openLinkedMedia = (item: AnimeSummary) => {
    if (onOpenLinkedMedia) {
      onOpenLinkedMedia(item)
      return
    }
    window.scrollTo({ top: 0, behavior: 'smooth' })
    setMedia(null)
    setError(null)
    void window.aniPlay!.aniList.media.get(item.id).then((next) => {
      showMedia(next)
      void preparePlaybackTarget(next)
    }).catch(() => setError(t('home.linkedMediaFailed')))
  }

  const openCandidateSearch = async (query?: string) => {
    if (!media) return
    const nextQuery = query ?? queryCandidates(media)[0] ?? media.title
    setCandidateDialog({ media, query: nextQuery, items: [], loading: true, error: null })
    try {
      const items = await searchForCandidates(media, nextQuery)
      setCandidateDialog({ media, query: nextQuery, items: items.slice(0, 8), loading: false, error: null })
    } catch (cause) {
      setCandidateDialog({ media, query: nextQuery, items: [], loading: false, error: cause instanceof Error ? cause.message : t('browse.searchFailed') })
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
    setMatchError(t('home.matchCleared'))
  }

  if (error && !media) return <div className="m3-card p-6"><button onClick={onBack} className="icon-button"><ChevronLeft /></button><p className="mt-4 text-red-300">{error}</p></div>
  if (!media) return <div className="m3-card min-h-80 flex items-center justify-center"><Loader2 className="animate-spin text-m3-primary" /></div>

  return <div className="space-y-4">
    <section className="m3-card overflow-hidden relative"><div className="absolute inset-0 bg-cover bg-center opacity-35" style={media.bannerUrl ? { backgroundImage: `url(${media.bannerUrl})` } : { backgroundColor: media.accentColor }} /><div className="absolute inset-0 bg-gradient-to-b from-m3-surface/20 via-m3-surface/65 to-m3-surface" /><div className="relative p-5 md:p-7 flex flex-col md:flex-row gap-5 pt-24">
      <img src={media.coverUrl} alt="" className="w-36 h-52 object-cover rounded-2xl shadow-xl self-center md:self-end" />
      <div className="flex-1 self-end"><button onClick={onBack} className="mb-3 inline-flex items-center gap-1 text-sm font-bold text-m3-primary"><ChevronLeft size={18}/> {t('anilistWorkspace.back')}</button><h2 className="text-3xl font-black">{media.title}</h2><div className="mt-2 flex flex-wrap gap-2 text-xs text-m3-on-surface-variant"><span>{media.format}</span><span>{media.season} {media.seasonYear}</span><span>{media.status}</span><span>{media.episodes ? t('home.episodeCount', { count: media.episodes }) : '?'}</span>{media.averageScore ? <span>★ {media.averageScore}%</span> : null}</div></div>
    </div></section>
    {error ? <p role="alert" className="rounded-xl bg-red-500/10 p-3 text-sm text-red-300">{error}</p> : null}
    <div className="grid lg:grid-cols-[1fr_360px] gap-4">
      <section className="space-y-4">
        <div className="m3-card p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <h3 className="font-black">{t('home.readyTitle')}</h3>
              <p className="mt-1 text-sm text-m3-on-surface-variant">{t('home.readyDescription', { provider: providerLabel(provider), mode: translationType === 'dub' ? t('home.dubbed') : t('home.subbed') })}</p>
            </div>
            <button disabled={!target || !suggestion} onClick={() => target && suggestion && onOpenAnime(media, target.anime, suggestion)} className="primary-action justify-center px-5 py-2.5 disabled:opacity-50">
              <Play size={17}/> {t('home.play')}
            </button>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-m3-outline/20 bg-m3-surface-container/40 p-3">
              <p className="text-xs font-bold uppercase tracking-wider text-m3-on-surface-variant">{t('home.episode')}</p>
              <p className="mt-1 font-black">{t('downloads.episode', { episode: suggestion?.episode ?? '1' })}</p>
              <p className="mt-1 text-xs text-m3-on-surface-variant">{suggestion?.label ?? t('home.startEpisode')}</p>
            </div>
            <div className="rounded-2xl border border-m3-outline/20 bg-m3-surface-container/40 p-3 md:col-span-2">
              <p className="text-xs font-bold uppercase tracking-wider text-m3-on-surface-variant">{t('home.playbackMatch')}</p>
              {matchLoading ? <p className="mt-2 flex items-center gap-2 text-sm text-m3-on-surface-variant"><Loader2 size={14} className="animate-spin" /> {t('home.findingMatch')}</p> : target ? <>
                <p className="mt-1 truncate font-black">{target.anime.name}</p>
                <p className="mt-1 text-xs text-m3-on-surface-variant">{providerLabel(target.anime.catalogProvider)} · {target.anime.episodes ? t('home.episodeCount', { count: target.anime.episodes }) : '?'}</p>
              </> : <p className="mt-2 text-sm text-m3-on-surface-variant">{matchError ?? t('home.noMatch')}</p>}
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={() => void openCandidateSearch()} className="rounded-xl border border-m3-outline/30 px-3 py-2 text-sm font-bold hover:bg-m3-on-surface/10"><Search size={14} className="inline mr-1" /> {target ? t('home.changeMatch') : t('home.searchAgain')}</button>
            <button disabled={!target} onClick={() => void forgetMatch()} className="rounded-xl border border-m3-outline/30 px-3 py-2 text-sm font-bold hover:bg-m3-on-surface/10 disabled:opacity-50"><RotateCcw size={14} className="inline mr-1" /> {t('home.forgetMatch')}</button>
          </div>
        </div>
        <div className="m3-card p-5"><h3 className="font-black">{t('home.about')}</h3><p className="mt-3 whitespace-pre-line text-sm leading-6 text-m3-on-surface-variant">{media.description}</p><div className="mt-4 flex flex-wrap gap-2">{media.genres.map((genre) => <span key={genre} className="rounded-full bg-m3-primary/10 px-3 py-1 text-xs text-m3-primary">{genre}</span>)}</div></div>
      </section>
      <aside className="m3-card p-5">
        <div className="flex items-center justify-between gap-3"><h3 className="flex items-center gap-2 font-black"><ListPlus size={18}/> {t('home.myAniList')}</h3>{media.listState && hasListChanges ? <button type="button" disabled={saving} onClick={resetListDraft} className="text-xs font-bold text-m3-primary hover:underline">{t('home.resetChanges')}</button> : null}</div>
        <div className="mt-4 grid gap-4">
          <fieldset><legend className="text-[11px] font-bold uppercase tracking-wider text-m3-on-surface-variant">{t('home.status')}</legend><div className="mt-2 flex flex-wrap gap-2">{LIST_STATUSES.map((item) => <button type="button" key={item} onClick={() => setStatus(item)} aria-pressed={status === item} className={`rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${status === item ? 'border-m3-primary bg-m3-primary text-m3-on-primary' : 'border-m3-outline/20 bg-m3-surface/40 text-m3-on-surface-variant hover:border-m3-primary/50 hover:text-m3-on-surface'}`}>{t(`home.statuses.${item.toLowerCase()}`)}</button>)}</div></fieldset>
          <div className="grid grid-cols-2 gap-2"><NumberStepper label={t('home.progress')} value={progress} onChange={setProgress} max={media.episodes}/><NumberStepper label={t('home.repeats')} value={repeat} onChange={setRepeat}/></div>
          <label className="rounded-2xl border border-m3-outline/15 bg-m3-surface/45 p-3"><span className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-m3-on-surface-variant"><span>{t('home.score')}</span><strong className="text-base text-m3-on-surface">{score}</strong></span><input type="range" min="0" max="100" step="1" value={score} onChange={(event) => setScore(Number(event.target.value))} className="mt-3 w-full accent-m3-primary"/></label>
          <button disabled={saving || !hasListChanges} onClick={() => void save()} className="primary-action py-3">{saving ? <Loader2 className="animate-spin" size={16}/> : null} {media.listState ? t('home.saveChanges') : t('home.addToList')}</button>
          {media.listState ? <button disabled={saving} onClick={() => void remove()} className="rounded-xl py-2 text-xs font-bold text-red-300 transition-colors hover:bg-red-400/10">{t('home.remove')}</button> : null}
        </div>
      </aside>
    </div>
    <RelationsSection items={media.relations} onSelect={openLinkedMedia} t={t}/>
    <Section title={t('home.recommendations')} icon={<Sparkles size={18} className="text-m3-primary"/>} items={media.recommendations} onSelect={openLinkedMedia} />
    {candidateDialog ? <CandidateModal key={`${candidateDialog.media.id}:${candidateDialog.query}`} dialog={candidateDialog} setDialog={setCandidateDialog} onRetry={(query) => void openCandidateSearch(query)} onChoose={(item) => void chooseCandidate(item)} /> : null}
  </div>
}

function CandidateModal({ dialog, setDialog, onRetry, onChoose }: { dialog: CandidateDialog; setDialog: (dialog: CandidateDialog | null) => void; onRetry: (query: string) => void; onChoose: (item: CatalogCandidate) => void }) {
  const { t } = useTranslation()
  const [query, setQuery] = useState(dialog.query)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="m3-card w-full max-w-2xl p-5">
        <h3 className="text-xl font-black">{t('home.chooseMatch')}</h3>
        <p className="mt-1 text-sm text-m3-on-surface-variant">{t('home.aniListTitle', { title: dialog.media.title })}</p>
        <div className="mt-4 flex gap-2 rounded-2xl border border-m3-outline/25 bg-m3-surface/55 p-1.5">
          <Search aria-hidden="true" className="ml-2 self-center text-m3-outline" size={18} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && query.trim()) onRetry(query.trim()) }} className="min-w-0 flex-1 bg-transparent px-2 py-2 text-m3-on-surface outline-none" />
          <button disabled={!query.trim() || dialog.loading} onClick={() => onRetry(query.trim())} className="primary-action px-4 py-2 disabled:opacity-50">{dialog.loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />} {t('home.retry')}</button>
        </div>
        {dialog.error ? <p role="alert" className="mt-3 rounded-xl bg-red-500/10 p-3 text-sm text-red-300">{dialog.error}</p> : null}
        <div className="mt-4 max-h-96 space-y-2 overflow-y-auto">
          {dialog.loading ? <div className="flex min-h-32 items-center justify-center text-m3-on-surface-variant"><Loader2 className="animate-spin" /></div> : dialog.items.length ? dialog.items.map((item) => (
            <button key={`${item.anime.catalogProvider}:${item.anime.id}`} onClick={() => onChoose(item)} className="w-full rounded-xl border border-m3-outline/20 p-3 text-left hover:border-m3-primary">
              <div className="flex items-start justify-between gap-3"><p className="font-bold">{item.anime.name}</p><span className="rounded-full bg-m3-primary/15 px-2 py-1 text-xs font-black text-m3-primary">{Math.round(item.confidence * 100)}%</span></div>
              <p className="mt-1 text-xs text-m3-on-surface-variant">{providerLabel(item.anime.catalogProvider)} · {item.anime.episodes ? t('home.episodeCount', { count: item.anime.episodes }) : '?'} · {item.reasons.join(', ') || 'title candidate'}</p>
            </button>
          )) : <div className="rounded-2xl border border-m3-outline/20 p-6 text-center text-sm text-m3-on-surface-variant">{t('home.noMatches')}</div>}
        </div>
        <button onClick={() => setDialog(null)} className="mt-4 text-sm text-m3-on-surface-variant hover:text-m3-on-surface">{t('home.cancel')}</button>
      </div>
    </div>
  )
}

export function HomePage({ setSearchQuery, setResults, onSelectAnime, onResume, selectedMediaId, onOpenMedia, onCloseMedia, onMediaResolved, view = 'dashboard' }: HomePageProps) {
  const { t } = useTranslation()
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [localSelectedId, setLocalSelectedId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [authBusy, setAuthBusy] = useState(false)
  const [discoverTab, setDiscoverTab] = useState('trending')
  const [libraryTab, setLibraryTab] = useState('current')
  const [libraryQuery, setLibraryQuery] = useState('')
  const [aniListQuery, setAniListQuery] = useState('')
  const [searchResults, setSearchResults] = useState<AnimeSummary[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)

  const load = useCallback(() => { setLoading(true); setError(null); void window.aniPlay!.aniList.dashboard.get().then(setDashboard).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : t('home.unavailable'))).finally(() => setLoading(false)) }, [t])
  useEffect(() => { void window.aniPlay!.aniList.dashboard.get().then(setDashboard).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : t('home.unavailable'))).finally(() => setLoading(false)) }, [t])
  const signIn = async () => { setAuthBusy(true); setError(null); try { await window.aniPlay!.aniList.auth.start(); load() } catch (cause) { setError(cause instanceof Error ? cause.message : t('home.signInFailed')) } finally { setAuthBusy(false) } }
  const logout = async () => { await window.aniPlay!.aniList.auth.logout(); load() }

  const searchAniList = async () => {
    const query = aniListQuery.trim()
    if (!query || searching) return
    setSearching(true); setSearchError(null)
    try {
      const items = await window.aniPlay!.aniList.media.search(query)
      setSearchResults(items); setDiscoverTab('search')
    } catch (cause) {
      setSearchResults([]); setSearchError(cause instanceof Error ? cause.message : t('anilistWorkspace.searchFailed'))
    } finally { setSearching(false) }
  }

  const openMapped = (media: AnimeSummary, anime: AnimeSearchResult, suggestion: EpisodeSuggestion) => {
    const selection = { ...anime, aniListMediaId: media.id, coverUrl: media.coverUrl || undefined }
    setSearchQuery(anime.name)
    setResults([selection])
    onSelectAnime(selection, { episode: suggestion.episode, resumeSeconds: suggestion.resumeSeconds ?? null })
  }

  const selectedId = selectedMediaId !== undefined ? selectedMediaId : localSelectedId
  const openMedia = (media: AnimeSummary, originLabel?: string) => onOpenMedia ? onOpenMedia(media, originLabel) : setLocalSelectedId(media.id)
  const closeMedia = () => onCloseMedia ? onCloseMedia() : setLocalSelectedId(null)
  if (selectedId) return <DetailsView key={selectedId} id={selectedId} onBack={closeMedia} onOpenAnime={openMapped} onChanged={load} onOpenLinkedMedia={(media) => openMedia(media)} onMediaResolved={onMediaResolved} />
  const history = readHistory().slice(0, 4)
  const featured = dashboard?.current[0] ?? dashboard?.trending[0] ?? dashboard?.seasonal[0]
  const discoverCollections = dashboard ? {
    trending: dashboard.trending,
    seasonal: dashboard.seasonal,
    airing: [...new Map(dashboard.airing.map((item) => [item.media.id, item.media])).values()],
    recommended: dashboard.recommendations,
    search: searchResults,
  } : { trending: [], seasonal: [], airing: [], recommended: [], search: [] }
  const libraryCollections: Record<string, AnimeSummary[]> = dashboard ? {
    current: dashboard.current,
    planning: dashboard.planning,
    completed: dashboard.completed,
    paused: dashboard.paused,
    dropped: dashboard.dropped,
    repeating: dashboard.repeating,
  } : { current: [], planning: [], completed: [], paused: [], dropped: [], repeating: [] }
  const normalizedLibraryQuery = libraryQuery.trim().toLowerCase()
  const activeLibraryItems = (libraryCollections[libraryTab] ?? []).filter((item) => !normalizedLibraryQuery || [item.title, item.titleEnglish, item.titleRomaji, ...item.synonyms].some((title) => title?.toLowerCase().includes(normalizedLibraryQuery)))
  const workspaceTitle = view === 'discover' ? t('anilistWorkspace.discoverTitle') : view === 'library' ? t('anilistWorkspace.libraryTitle') : t('home.dashboardTitle')
  const workspaceDescription = view === 'discover' ? t('anilistWorkspace.discoverDescription') : view === 'library' ? t('anilistWorkspace.libraryDescription') : t('home.discovery')
  return <div className="home-dashboard flex-1 flex flex-col gap-4">
    <section className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><div><p className="section-label"><Flame size={14}/> {workspaceDescription}</p><h2 className="mt-2 text-2xl md:text-3xl font-black">{workspaceTitle}</h2></div>{dashboard?.session.authenticated ? <div className="flex items-center gap-3"><div className="text-right"><p className="text-xs text-m3-on-surface-variant">{t('home.signedInAs')}</p><p className="font-bold">{dashboard.session.user?.name}</p></div>{dashboard.session.user?.avatar ? <img src={dashboard.session.user.avatar} className="size-10 rounded-full" alt=""/> : <UserRound/>}<button onClick={() => void logout()} className="icon-button" title={t('home.signOut')}><LogOut size={18}/></button></div> : <button disabled={authBusy || !dashboard?.session.configured} onClick={() => void signIn()} className="primary-action px-4 py-2.5" title={dashboard?.session.configured ? undefined : t('home.signInUnavailable')}>{authBusy ? <Loader2 className="animate-spin" size={18}/> : <LogIn size={18}/>} {t('profile.signIn')}</button>}</section>
    {dashboard?.stale ? <p className="rounded-xl bg-amber-500/10 px-4 py-2 text-xs text-amber-200">{t('home.stale')}</p> : null}{error ? <p role="alert" className="rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</p> : null}
    {view === 'discover' && !loading && dashboard ? <>
      <form onSubmit={(event) => { event.preventDefault(); void searchAniList() }} className="m3-card flex flex-col gap-2 p-3 sm:flex-row">
        <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-m3-outline/20 bg-m3-surface/45 px-3"><Search size={17} className="shrink-0 text-m3-outline"/><input value={aniListQuery} onChange={(event) => setAniListQuery(event.target.value)} placeholder={t('anilistWorkspace.searchPlaceholder')} className="min-w-0 flex-1 bg-transparent py-3 text-sm outline-none"/></label>
        <button type="submit" disabled={!aniListQuery.trim() || searching} className="primary-action justify-center px-5 py-3 disabled:opacity-50">{searching ? <Loader2 size={17} className="animate-spin"/> : <Search size={17}/>} {t('anilistWorkspace.search')}</button>
      </form>
      {searchError ? <p role="alert" className="rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-300">{searchError}</p> : null}
      <CollectionTabs label={t('anilistWorkspace.discover')} active={discoverTab} onChange={setDiscoverTab} tabs={[
        { id: 'trending', label: t('home.trending'), count: dashboard.trending.length },
        { id: 'seasonal', label: t('home.seasonal'), count: dashboard.seasonal.length },
        { id: 'airing', label: t('home.airingSoon'), count: discoverCollections.airing.length },
        { id: 'recommended', label: t('home.recommended'), count: dashboard.recommendations.length },
        ...(searchResults.length || discoverTab === 'search' ? [{ id: 'search', label: t('anilistWorkspace.searchResults'), count: searchResults.length }] : []),
      ]}/>
      <CollectionGrid items={discoverCollections[discoverTab as keyof typeof discoverCollections] ?? []} onSelect={(item) => openMedia(item, discoverTab === 'search' ? t('anilistWorkspace.searchResults') : discoverTab === 'airing' ? t('home.airingSoon') : t(`home.${discoverTab}`))} empty={t('anilistWorkspace.noDiscoverResults')}/>
    </> : null}
    {view === 'library' && !loading && dashboard ? <>
      {history.length ? <section><h3 className="mb-2 flex items-center gap-2 font-black"><Play size={18} className="text-m3-primary"/> {t('home.continueWatching')}</h3><div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">{history.map((item) => <button key={`${item.animeId}:${item.episode}`} onClick={() => onResume(item)} className="m3-card flex items-center gap-3 p-3 text-left hover:border-m3-primary/40">{item.coverUrl ? <img src={item.coverUrl} alt="" className="h-14 w-10 rounded-lg object-cover"/> : null}<span className="min-w-0"><strong className="block truncate text-sm">{item.animeName}</strong><span className="mt-1 block text-xs text-m3-on-surface-variant">{t('downloads.episode', { episode: item.episode })}</span></span></button>)}</div></section> : null}
      {!dashboard.session.authenticated ? <div className="m3-card p-6 text-center"><ListPlus className="mx-auto text-m3-primary" size={30}/><h3 className="mt-3 text-xl font-black">{t('anilistWorkspace.librarySignInTitle')}</h3><p className="mx-auto mt-2 max-w-lg text-sm text-m3-on-surface-variant">{t('anilistWorkspace.librarySignInDescription')}</p></div> : <>
        <label className="m3-card flex items-center gap-2 px-4"><Search size={17} className="text-m3-outline"/><input value={libraryQuery} onChange={(event) => setLibraryQuery(event.target.value)} placeholder={t('anilistWorkspace.filterLibrary')} className="min-w-0 flex-1 bg-transparent py-3.5 text-sm outline-none"/></label>
        <CollectionTabs label={t('anilistWorkspace.library')} active={libraryTab} onChange={setLibraryTab} tabs={LIST_STATUSES.map((status) => ({ id: status.toLowerCase(), label: t(`home.statuses.${status.toLowerCase()}`), count: libraryCollections[status.toLowerCase()].length }))}/>
        <CollectionGrid items={activeLibraryItems} onSelect={(item) => openMedia(item, t(`home.statuses.${libraryTab}`))} empty={normalizedLibraryQuery ? t('anilistWorkspace.noLibraryMatches') : t('anilistWorkspace.emptyStatus')}/>
      </>}
    </> : null}
    {loading ? <div className="m3-card min-h-72 flex items-center justify-center"><Loader2 className="animate-spin text-m3-primary"/></div> : dashboard && view === 'dashboard' ? <>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        {featured ? <button type="button" onClick={() => openMedia(featured)} className="m3-card home-feature relative min-h-[300px] overflow-hidden text-left"><span className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${featured.bannerUrl || featured.coverUrl})` }} /><span className="absolute inset-0 bg-gradient-to-r from-m3-surface via-m3-surface/75 to-transparent"/><span className="relative flex min-h-[300px] max-w-xl flex-col justify-end p-6"><span className="section-label w-fit"><TrendingUp size={13}/> {t('home.trending')}</span><strong className="mt-3 text-3xl font-black md:text-4xl">{featured.title}</strong><span className="mt-2 text-sm text-m3-on-surface-variant">{episodeLabel(featured, t)}{featured.averageScore ? ` · ★ ${featured.averageScore}%` : ''}</span><span className="primary-action mt-5 w-fit px-5 py-2.5"><Play size={17}/> {t('home.viewDetails')}</span></span></button> : null}
        <aside className="m3-card min-w-0 overflow-hidden p-4"><h3 className="flex items-center gap-2 font-black"><CalendarClock size={18} className="shrink-0 text-m3-primary"/> {t('home.airingSoon')}</h3><div className="mt-3 grid min-w-0 gap-1.5">{dashboard.airing.slice(0, 6).map((item) => <button type="button" key={`${item.media.id}:${item.episode}`} onClick={() => openMedia(item.media)} className="flex w-full min-w-0 items-center gap-3 overflow-hidden rounded-xl p-2 text-left hover:bg-m3-on-surface/8">{item.media.coverUrl ? <img src={item.media.coverUrl} alt="" className="size-10 shrink-0 rounded-lg object-cover"/> : null}<span className="min-w-0 flex-1 overflow-hidden"><strong className="block max-w-full truncate text-xs">{item.media.title}</strong><span className="mt-0.5 block max-w-full truncate text-[10px] text-m3-on-surface-variant">{t('home.airingLabel', { episode: item.episode, time: timeUntil(item.airingAt, t) })}</span></span></button>)}</div></aside>
      </div>
      {history.length ? <section><h3 className="mb-2 flex items-center gap-2 font-black"><Play size={18} className="text-m3-primary"/> {t('home.continueWatching')}</h3><div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">{history.map((item) => <button key={`${item.animeId}:${item.episode}`} onClick={() => onResume(item)} className="m3-card flex items-center gap-3 p-3 text-left hover:border-m3-primary/40">{item.coverUrl ? <img src={item.coverUrl} alt="" className="h-14 w-10 rounded-lg object-cover"/> : null}<span className="min-w-0"><strong className="block truncate text-sm">{item.animeName}</strong><span className="mt-1 block text-xs text-m3-on-surface-variant">{t('downloads.episode', { episode: item.episode })}</span></span></button>)}</div></section> : null}
      <div className="grid items-start gap-4 xl:grid-cols-2">
        <DashboardShelf title={t('home.discover')} icon={<Sparkles size={18} className="text-m3-primary"/>} tabs={[{ id: 'trending', label: t('home.trending'), items: dashboard.trending }, { id: 'seasonal', label: t('home.seasonal'), items: dashboard.seasonal }, { id: 'recommended', label: t('home.recommended'), items: dashboard.recommendations }]} onSelect={(item) => openMedia(item)} />
        <DashboardShelf title={t('home.library')} icon={<ListPlus size={18} className="text-m3-primary"/>} tabs={[{ id: 'watching', label: t('home.watching'), items: dashboard.current }, { id: 'planning', label: t('home.planning'), items: dashboard.planning }, { id: 'completed', label: t('home.completed'), items: dashboard.completed }]} onSelect={(item) => openMedia(item)} />
      </div>
    </> : null}
  </div>
}
