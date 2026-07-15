import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, Clock3, Film, Gauge, ImageDown, Loader2, LogIn, LogOut, RefreshCw, Sparkles, Star, UserRound, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { AnimeSummary, AniListProfile, AniListSession } from '../anilist-types'
import type { ProfileShareStyle } from '../profile-share-types'
import { AchievementsSection } from '../components/AchievementBrowser'
import { createAchievements } from '../lib/profile-achievements'
import { EMPTY_VIEWING_SUMMARY, type ViewingSummary } from '../viewing-types'

interface ProfilePageProps {
  onOpenMedia: (id: number) => void
}

function StatCard({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: string; detail?: string }) {
  return <article className="m3-card p-5"><div className="flex items-center justify-between text-m3-primary">{icon}<span className="text-[10px] font-black uppercase tracking-[0.16em] text-m3-on-surface-variant">{label}</span></div><p className="mt-4 text-3xl font-black">{value}</p>{detail ? <p className="mt-1 text-xs text-m3-on-surface-variant">{detail}</p> : null}</article>
}

function FavouriteCard({ media, onOpen }: { media: AnimeSummary; onOpen: () => void }) {
  return <button type="button" onClick={onOpen} className="group relative aspect-[2/3] overflow-hidden rounded-2xl border border-m3-outline/15 bg-m3-surface-container text-left">
    {media.coverUrl ? <img src={media.coverUrl} alt="" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"/> : null}
    <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/80 to-transparent px-3 pb-3 pt-12 text-sm font-black text-white">{media.title}</span>
  </button>
}

export function ProfilePage({ onOpenMedia }: ProfilePageProps) {
  const { t, i18n } = useTranslation()
  const [session, setSession] = useState<AniListSession | null>(null)
  const [profile, setProfile] = useState<AniListProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [authBusy, setAuthBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [shareOpen, setShareOpen] = useState(false)
  const [shareStyle, setShareStyle] = useState<ProfileShareStyle>('hero')
  const [exporting, setExporting] = useState(false)
  const [shareMessage, setShareMessage] = useState<string | null>(null)
  const [viewingSummary, setViewingSummary] = useState<ViewingSummary>(EMPTY_VIEWING_SUMMARY)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const nextSession = await window.aniPlay!.aniList.auth.status()
      setSession(nextSession)
      if (nextSession.authenticated) {
        const [nextProfile, nextViewingSummary] = await Promise.all([window.aniPlay!.aniList.profile.get(), window.aniPlay!.viewing.getSummary()])
        setProfile(nextProfile); setViewingSummary(nextViewingSummary)
      } else { setProfile(null); setViewingSummary(EMPTY_VIEWING_SUMMARY) }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('profile.loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timer)
  }, [load])

  const signIn = async () => {
    setAuthBusy(true)
    setError(null)
    try { await window.aniPlay!.aniList.auth.start(); await load() }
    catch (cause) { setError(cause instanceof Error ? cause.message : t('profile.signInFailed')) }
    finally { setAuthBusy(false) }
  }

  const signOut = async () => {
    await window.aniPlay!.aniList.auth.logout()
    setProfile(null)
    setSession(await window.aniPlay!.aniList.auth.status())
  }

  const numberFormat = useMemo(() => new Intl.NumberFormat(i18n.language), [i18n.language])

  if (loading && !session) return <div className="m3-card flex min-h-80 flex-1 items-center justify-center"><Loader2 className="animate-spin text-m3-primary" size={28}/></div>

  if (!session?.authenticated || !profile) return <div className="m3-card flex min-h-[520px] flex-1 flex-col items-center justify-center overflow-hidden p-8 text-center">
    <div className="flex size-20 items-center justify-center rounded-full bg-m3-primary/15 text-m3-primary"><UserRound size={38}/></div>
    <p className="section-label mt-6">{t('profile.sectionLabel')}</p>
    <h1 className="mt-3 text-3xl font-black">{t('profile.signedOutTitle')}</h1>
    <p className="mt-2 max-w-lg text-sm leading-6 text-m3-on-surface-variant">{t('profile.signedOutBody')}</p>
    <button type="button" disabled={authBusy || !session?.configured} onClick={() => void signIn()} className="primary-action mt-6 px-5 py-3">{authBusy ? <Loader2 className="animate-spin" size={18}/> : <LogIn size={18}/>} {t('profile.signIn')}</button>
    {error ? <p role="alert" className="mt-4 text-sm text-red-300">{error}</p> : null}
  </div>

  const completed = profile.stats.statuses.find((item) => item.label === 'COMPLETED')?.count ?? 0
  const daysWatched = profile.stats.minutesWatched / 1440
  const maxGenreCount = Math.max(...profile.stats.genres.map((item) => item.count), 1)
  const exportProfile = async () => {
    setExporting(true)
    setShareMessage(null)
    setError(null)
    const earnedMilestone = [...createAchievements(profile.stats, profile.achievementFacts, viewingSummary)].reverse().find((achievement) => achievement.earned)
    try {
      const result = await window.aniPlay!.aniList.profile.export({
        style: shareStyle,
        username: profile.user.name,
        avatarUrl: profile.user.avatar,
        bannerUrl: profile.user.bannerImage,
        animeCount: profile.stats.count,
        completed,
        episodesWatched: profile.stats.episodesWatched,
        daysWatched,
        meanScore: profile.stats.meanScore,
        genres: profile.stats.genres.slice(0, 5).map(({ label, count }) => ({ label, count })),
        milestone: earnedMilestone ? t(`profile.achievements.items.${earnedMilestone.id}`) : undefined,
        labels: {
          profile: t('profile.share.profileLabel'), anime: t('profile.stats.anime'), completed: t('profile.share.completed'),
          episodes: t('profile.stats.episodes'), days: t('profile.share.daysWatched'), meanScore: t('profile.stats.meanScore'), topGenres: t('profile.share.topGenres'),
        },
      })
      if (result.saved) setShareMessage(t('profile.share.saved'))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('profile.share.failed'))
    } finally {
      setExporting(false)
    }
  }

  return <div className="flex flex-1 flex-col gap-5">
    <section className="m3-card relative min-h-64 overflow-hidden">
      {profile.user.bannerImage ? <img src={profile.user.bannerImage} alt="" className="absolute inset-0 h-full w-full object-cover opacity-55"/> : <div className="absolute inset-0 bg-gradient-to-br from-m3-primary/35 via-m3-surface-container to-[--custom-display-name-styles-dark-1-color] opacity-70"/>}
      <div className="absolute inset-0 bg-gradient-to-t from-m3-surface-container via-m3-surface-container/65 to-transparent"/>
      <div className="relative flex min-h-64 flex-col justify-end gap-4 p-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-end gap-4">{profile.user.avatar ? <img src={profile.user.avatar} alt="" className="size-24 rounded-3xl border-4 border-m3-surface-container object-cover shadow-xl"/> : <div className="flex size-24 items-center justify-center rounded-3xl bg-m3-primary text-m3-on-primary"><UserRound size={42}/></div>}<div><p className="section-label">{t('profile.sectionLabel')}</p><h1 className="mt-2 text-3xl font-black sm:text-4xl">{profile.user.name}</h1><p className="mt-1 text-sm text-m3-on-surface-variant">{t('profile.summary', { count: profile.stats.count, completed })}</p></div></div>
        <div className="flex gap-2"><button type="button" onClick={() => { setShareMessage(null); setShareOpen((open) => !open) }} className="primary-action px-4 py-2.5"><ImageDown size={18}/> {t('profile.share.button')}</button><button type="button" onClick={() => void load()} className="icon-button" title={t('profile.refresh')}><RefreshCw size={18}/></button><button type="button" onClick={() => void signOut()} className="icon-button" title={t('profile.signOut')}><LogOut size={18}/></button></div>
      </div>
    </section>

    {shareOpen ? <section className="m3-card p-5">
      <div className="flex items-start justify-between gap-4"><div><h2 className="flex items-center gap-2 text-lg font-black"><ImageDown className="text-m3-primary" size={19}/> {t('profile.share.title')}</h2><p className="mt-1 text-xs text-m3-on-surface-variant">{t('profile.share.description')}</p></div><button type="button" onClick={() => setShareOpen(false)} className="icon-button !size-9" aria-label={t('profile.share.close')}><X size={16}/></button></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {(['hero', 'stats'] as ProfileShareStyle[]).map((style) => <button type="button" key={style} onClick={() => { setShareStyle(style); setShareMessage(null) }} aria-pressed={shareStyle === style} className={`relative overflow-hidden rounded-2xl border p-4 text-left transition-colors ${shareStyle === style ? 'border-m3-primary bg-m3-primary/10' : 'border-m3-outline/15 bg-m3-surface/35 hover:border-m3-primary/40'}`}>
          <div className={`mb-3 aspect-[1200/630] overflow-hidden rounded-xl ${style === 'hero' ? 'bg-gradient-to-br from-fuchsia-950 via-purple-900 to-m3-surface' : 'bg-m3-surface'}`}><div className={`h-full ${style === 'hero' ? 'bg-gradient-to-t from-black/85 to-transparent' : 'grid grid-cols-2 gap-2 p-3'}`}>{style === 'stats' ? <><div className="rounded-lg bg-white/10"/><div className="grid gap-1.5 py-2">{[80, 60, 95, 45].map((width) => <span key={width} className="h-1.5 rounded-full bg-m3-primary" style={{ width: `${width}%` }}/>)}</div></> : null}</div></div>
          <div className="flex items-center justify-between"><div><p className="font-black">{t(`profile.share.styles.${style}.title`)}</p><p className="mt-0.5 text-xs text-m3-on-surface-variant">{t(`profile.share.styles.${style}.description`)}</p></div>{shareStyle === style ? <span className="flex size-7 items-center justify-center rounded-full bg-m3-primary text-m3-on-primary"><Check size={15}/></span> : null}</div>
        </button>)}
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-m3-on-surface-variant">{t('profile.share.dimensions')}</p><div className="flex items-center gap-3">{shareMessage ? <span className="text-xs font-bold text-emerald-300">{shareMessage}</span> : null}<button type="button" disabled={exporting} onClick={() => void exportProfile()} className="primary-action px-5 py-2.5">{exporting ? <Loader2 className="animate-spin" size={17}/> : <ImageDown size={17}/>} {exporting ? t('profile.share.exporting') : t('profile.share.export')}</button></div></div>
    </section> : null}

    {error ? <p role="alert" className="rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</p> : null}

    <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard icon={<Film size={21}/>} label={t('profile.stats.anime')} value={numberFormat.format(profile.stats.count)} detail={t('profile.stats.completed', { count: completed })}/>
      <StatCard icon={<Sparkles size={21}/>} label={t('profile.stats.episodes')} value={numberFormat.format(profile.stats.episodesWatched)}/>
      <StatCard icon={<Clock3 size={21}/>} label={t('profile.stats.time')} value={t('profile.stats.days', { count: Number(daysWatched.toFixed(1)) })} detail={t('profile.stats.hours', { count: numberFormat.format(Math.round(profile.stats.minutesWatched / 60)) })}/>
      <StatCard icon={<Gauge size={21}/>} label={t('profile.stats.meanScore')} value={profile.stats.meanScore ? `${profile.stats.meanScore.toFixed(1)}` : '—'} detail={t('profile.stats.outOf100')}/>
    </section>

    <div className="grid gap-5 lg:grid-cols-[1.35fr_1fr]">
      <section className="m3-card p-5"><div className="flex items-center gap-2"><Star className="text-m3-primary" size={19}/><h2 className="text-lg font-black">{t('profile.dna.title')}</h2></div><p className="mt-1 text-xs text-m3-on-surface-variant">{t('profile.dna.description')}</p><div className="mt-5 grid gap-3">{profile.stats.genres.length ? profile.stats.genres.map((genre) => <div key={genre.label}><div className="mb-1.5 flex items-center justify-between text-xs"><span className="font-bold">{genre.label}</span><span className="text-m3-on-surface-variant">{t('profile.dna.titles', { count: genre.count })}{genre.meanScore ? ` · ${genre.meanScore.toFixed(1)}` : ''}</span></div><div className="h-2 overflow-hidden rounded-full bg-m3-surface-variant/40"><div className="h-full rounded-full bg-gradient-to-r from-m3-primary to-[--custom-display-name-styles-main-color]" style={{ width: `${Math.max(4, genre.count / maxGenreCount * 100)}%` }}/></div></div>) : <p className="text-sm text-m3-on-surface-variant">{t('profile.dna.empty')}</p>}</div></section>

      <AchievementsSection stats={profile.stats} facts={profile.achievementFacts} viewing={viewingSummary}/>
    </div>

    {profile.favourites.length ? <section className="space-y-3"><div className="flex items-center gap-2"><Star className="text-m3-primary" size={19}/><h2 className="text-lg font-black">{t('profile.favourites')}</h2></div><div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-8">{profile.favourites.map((media) => <FavouriteCard key={media.id} media={media} onOpen={() => onOpenMedia(media.id)}/>)}</div></section> : null}
    {profile.user.about ? <section className="m3-card p-5"><h2 className="text-lg font-black">{t('profile.about')}</h2><p className="mt-3 whitespace-pre-line text-sm leading-6 text-m3-on-surface-variant">{profile.user.about}</p></section> : null}
  </div>
}
