import { useEffect, useMemo, useState } from 'react'
import { Activity, Check, CheckCircle2, Clock3, Compass, Film, LibraryBig, Lock, Sparkles, Trophy, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { AniListProfile } from '../anilist-types'
import { createAchievements, type AchievementCategory, type ProfileAchievement } from '../lib/profile-achievements'
import type { ViewingSummary } from '../viewing-types'

type AchievementFilter = 'all' | 'earned' | 'locked'

function CategoryIcon({ category, size = 17 }: { category: AchievementCategory; size?: number }) {
  if (category === 'episodes') return <Film size={size}/>
  if (category === 'completed') return <CheckCircle2 size={size}/>
  if (category === 'time') return <Clock3 size={size}/>
  if (category === 'discovery') return <Compass size={size}/>
  if (category === 'activity') return <Activity size={size}/>
  return <LibraryBig size={size}/>
}

function AchievementCard({ achievement, compact = false }: { achievement: ProfileAchievement; compact?: boolean }) {
  const { t, i18n } = useTranslation()
  const format = useMemo(() => new Intl.NumberFormat(i18n.language, { maximumFractionDigits: achievement.category === 'time' || achievement.category === 'activity' ? 1 : 0 }), [achievement.category, i18n.language])
  const current = Math.min(achievement.target, achievement.current)
  const specialGoal = ['trendsetter', 'hiddenGemHunter', 'marathonRunner', 'longRunningLegend', 'shortAndSweet', 'shounenRegular', 'sliceOfLife', 'fillerSkipper', 'bingeMaster', 'weekendWarrior', 'nightOwl', 'goldenWeek'].includes(achievement.id)
  return <article className={`rounded-2xl border ${compact ? 'p-3' : 'p-4'} ${achievement.earned ? 'border-m3-primary/35 bg-m3-primary/10' : 'border-m3-outline/15 bg-m3-surface/35'}`}>
    <div className="flex items-start gap-3">
      <div className={`flex size-10 shrink-0 items-center justify-center rounded-full ${achievement.earned ? 'bg-m3-primary text-m3-on-primary' : 'bg-m3-surface-variant/45 text-m3-on-surface-variant'}`}>{achievement.earned ? <Check size={18}/> : <CategoryIcon category={achievement.category}/>}</div>
      <div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><div><p className="font-black">{t(`profile.achievements.items.${achievement.id}`)}</p>{compact ? null : <p className="mt-0.5 text-xs text-m3-on-surface-variant">{t(specialGoal ? `profile.achievements.specialGoals.${achievement.id}` : `profile.achievements.goals.${achievement.category}`, { target: achievement.target })}</p>}</div>{achievement.earned ? <span className="rounded-full bg-m3-primary/15 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-m3-primary">{t('profile.achievements.earned')}</span> : <Lock className="mt-1 shrink-0 text-m3-on-surface-variant" size={14}/>}</div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-m3-surface-variant/45"><div className="h-full rounded-full bg-m3-primary" style={{ width: `${achievement.progress}%` }}/></div>
        <p className="mt-1.5 text-right text-[11px] font-bold text-m3-on-surface-variant">{format.format(current)} / {format.format(achievement.target)}</p>
      </div>
    </div>
  </article>
}

export function AchievementsSection({ stats, facts, viewing }: { stats: AniListProfile['stats']; facts: AniListProfile['achievementFacts']; viewing: ViewingSummary }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState<AchievementFilter>('all')
  const [category, setCategory] = useState<AchievementCategory | 'all'>('all')
  const achievements = useMemo(() => createAchievements(stats, facts, viewing), [facts, stats, viewing])
  const earned = achievements.filter((item) => item.earned)
  const featured = [...earned.slice(-2).reverse(), ...achievements.filter((item) => !item.earned).sort((a, b) => b.progress - a.progress)].slice(0, 4)
  const visible = achievements.filter((item) => (filter === 'all' || (filter === 'earned') === item.earned) && (category === 'all' || category === item.category))

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open])

  return <>
    <section className="m3-card p-5"><div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><Trophy className="text-m3-primary" size={19}/><h2 className="text-lg font-black">{t('profile.achievements.title')}</h2></div><p className="mt-1 text-xs text-m3-on-surface-variant">{t('profile.achievements.summary', { earned: earned.length, total: achievements.length })}</p></div><button type="button" onClick={() => setOpen(true)} className="rounded-full border border-m3-primary/30 bg-m3-primary/10 px-3 py-1.5 text-xs font-black text-m3-primary hover:bg-m3-primary/20">{t('profile.achievements.browse')}</button></div><div className="mt-5 grid gap-3">{featured.map((achievement) => <AchievementCard key={achievement.id} achievement={achievement} compact/>)}</div></section>

    {open ? <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false) }}><section role="dialog" aria-modal="true" aria-labelledby="achievements-title" className="m3-card flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden !bg-m3-surface-container shadow-2xl">
      <header className="flex items-start justify-between gap-4 border-b border-m3-outline/10 p-5"><div><p className="section-label"><Sparkles size={13}/> {t('profile.achievements.collection')}</p><h2 id="achievements-title" className="mt-2 text-2xl font-black">{t('profile.achievements.browserTitle')}</h2><p className="mt-1 text-sm text-m3-on-surface-variant">{t('profile.achievements.summary', { earned: earned.length, total: achievements.length })}</p></div><button type="button" onClick={() => setOpen(false)} className="icon-button" aria-label={t('profile.achievements.close')}><X size={18}/></button></header>
      <div className="border-b border-m3-outline/10 px-5 py-4"><div className="flex flex-wrap gap-2">{(['all', 'earned', 'locked'] as AchievementFilter[]).map((item) => <button type="button" key={item} onClick={() => setFilter(item)} aria-pressed={filter === item} className={`rounded-full px-3 py-1.5 text-xs font-bold ${filter === item ? 'bg-m3-primary text-m3-on-primary' : 'bg-m3-surface-variant/35 text-m3-on-surface-variant'}`}>{t(`profile.achievements.filters.${item}`)}</button>)}</div><div className="mt-3 flex flex-wrap gap-2">{(['all', 'library', 'episodes', 'completed', 'time', 'discovery', 'activity'] as const).map((item) => <button type="button" key={item} onClick={() => setCategory(item)} aria-pressed={category === item} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold ${category === item ? 'border-m3-primary bg-m3-primary/10 text-m3-primary' : 'border-m3-outline/15 text-m3-on-surface-variant'}`}>{item === 'all' ? <Trophy size={14}/> : <CategoryIcon category={item} size={14}/>} {t(`profile.achievements.categories.${item}`)}</button>)}</div></div>
      <div className="overflow-y-auto p-5"><div className="grid gap-3 sm:grid-cols-2">{visible.map((achievement) => <AchievementCard key={achievement.id} achievement={achievement}/>)}</div>{visible.length ? null : <div className="py-16 text-center text-sm text-m3-on-surface-variant">{t('profile.achievements.empty')}</div>}</div>
    </section></div> : null}
  </>
}
