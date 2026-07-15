import type { AniListProfile } from '../anilist-types'
import { EMPTY_VIEWING_SUMMARY, type ViewingSummary } from '../viewing-types'

export type AchievementCategory = 'library' | 'episodes' | 'completed' | 'time' | 'discovery' | 'activity'

export interface ProfileAchievement {
  id: string
  category: AchievementCategory
  current: number
  target: number
  earned: boolean
  progress: number
}

type Metric = 'library' | 'episodes' | 'completed' | 'days' | keyof AniListProfile['achievementFacts'] | 'fillerEpisodes' | 'weekHours' | 'weekendHours' | 'nightHours' | 'streakDays'

const CATALOG: Array<{ id: string; category: AchievementCategory; target: number; metric: Metric }> = [
  { id: 'library10', category: 'library', target: 10, metric: 'library' }, { id: 'library50', category: 'library', target: 50, metric: 'library' },
  { id: 'library100', category: 'library', target: 100, metric: 'library' }, { id: 'library250', category: 'library', target: 250, metric: 'library' }, { id: 'library500', category: 'library', target: 500, metric: 'library' },
  { id: 'episodes100', category: 'episodes', target: 100, metric: 'episodes' }, { id: 'episodes500', category: 'episodes', target: 500, metric: 'episodes' },
  { id: 'episodes1000', category: 'episodes', target: 1000, metric: 'episodes' }, { id: 'episodes2500', category: 'episodes', target: 2500, metric: 'episodes' }, { id: 'episodes5000', category: 'episodes', target: 5000, metric: 'episodes' },
  { id: 'completed1', category: 'completed', target: 1, metric: 'completed' }, { id: 'completed10', category: 'completed', target: 10, metric: 'completed' },
  { id: 'completed50', category: 'completed', target: 50, metric: 'completed' }, { id: 'completed100', category: 'completed', target: 100, metric: 'completed' }, { id: 'completed250', category: 'completed', target: 250, metric: 'completed' },
  { id: 'days1', category: 'time', target: 1, metric: 'days' }, { id: 'days7', category: 'time', target: 7, metric: 'days' },
  { id: 'days30', category: 'time', target: 30, metric: 'days' }, { id: 'days100', category: 'time', target: 100, metric: 'days' }, { id: 'days365', category: 'time', target: 365, metric: 'days' },
  { id: 'trendsetter', category: 'discovery', target: 50, metric: 'currentlyAiring' }, { id: 'hiddenGemHunter', category: 'discovery', target: 10, metric: 'hiddenGems' },
  { id: 'marathonRunner', category: 'completed', target: 1, metric: 'completedLong50' }, { id: 'longRunningLegend', category: 'completed', target: 1, metric: 'completedLong100' },
  { id: 'shortAndSweet', category: 'completed', target: 20, metric: 'completedShort12' }, { id: 'shounenRegular', category: 'completed', target: 10, metric: 'completedShounen' },
  { id: 'sliceOfLife', category: 'episodes', target: 1000, metric: 'sliceOfLifeEpisodes' }, { id: 'fillerSkipper', category: 'episodes', target: 1000, metric: 'fillerEpisodes' },
  { id: 'bingeMaster', category: 'activity', target: 24, metric: 'weekHours' }, { id: 'weekendWarrior', category: 'activity', target: 12, metric: 'weekendHours' },
  { id: 'nightOwl', category: 'activity', target: 100, metric: 'nightHours' }, { id: 'goldenWeek', category: 'activity', target: 7, metric: 'streakDays' },
]

export function createAchievements(stats: AniListProfile['stats'], facts?: AniListProfile['achievementFacts'], viewing: ViewingSummary = EMPTY_VIEWING_SUMMARY): ProfileAchievement[] {
  const completed = stats.statuses.find((item) => item.label === 'COMPLETED')?.count ?? 0
  const dropped = stats.statuses.find((item) => item.label === 'DROPPED')?.count ?? 0
  const values: Record<Metric, number> = {
    library: stats.count, episodes: stats.episodesWatched, completed, days: stats.minutesWatched / 1440,
    currentlyAiring: facts?.currentlyAiring ?? 0, hiddenGems: facts?.hiddenGems ?? 0,
    completedLong50: facts?.completedLong50 ?? 0, completedLong100: facts?.completedLong100 ?? 0,
    completedShort12: facts?.completedShort12 ?? 0, completedShounen: facts?.completedShounen ?? 0,
    sliceOfLifeEpisodes: facts?.sliceOfLifeEpisodes ?? 0, fillerEpisodes: dropped === 0 ? stats.episodesWatched : 0,
    weekHours: viewing.maxSevenDaySeconds / 3600, weekendHours: viewing.maxWeekendSeconds / 3600,
    nightHours: viewing.nightSeconds / 3600, streakDays: viewing.longestCompletionStreakDays,
  }
  return CATALOG.map((definition) => {
    const current = values[definition.metric]
    return { ...definition, current, earned: current >= definition.target, progress: Math.min(100, current / definition.target * 100) }
  })
}
