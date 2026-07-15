import { describe, expect, it } from 'vitest'
import { createAchievements } from '../lib/profile-achievements'
import type { AniListProfile } from '../anilist-types'
import { EMPTY_VIEWING_SUMMARY } from '../viewing-types'

function stats(overrides: Partial<AniListProfile['stats']> = {}): AniListProfile['stats'] {
  return { count: 0, episodesWatched: 0, minutesWatched: 0, meanScore: 0, statuses: [], genres: [], ...overrides }
}

describe('profile achievements', () => {
  it('calculates progress across all supported stat categories', () => {
    const achievements = createAchievements(stats({
      count: 120,
      episodesWatched: 1100,
      minutesWatched: 31 * 1440,
      statuses: [{ label: 'COMPLETED', count: 55 }],
    }))

    expect(achievements).toHaveLength(32)
    expect(achievements.find((item) => item.id === 'library100')?.earned).toBe(true)
    expect(achievements.find((item) => item.id === 'episodes2500')?.progress).toBe(44)
    expect(achievements.find((item) => item.id === 'completed50')?.earned).toBe(true)
    expect(achievements.find((item) => item.id === 'days30')?.earned).toBe(true)
  })

  it('caps earned achievement progress at one hundred percent', () => {
    const achievement = createAchievements(stats({ count: 999 })).find((item) => item.id === 'library10')
    expect(achievement?.progress).toBe(100)
  })

  it('combines AniList metadata facts with local viewing activity', () => {
    const facts: AniListProfile['achievementFacts'] = { currentlyAiring: 50, hiddenGems: 10, completedLong50: 1, completedLong100: 0, completedShort12: 20, completedShounen: 10, sliceOfLifeEpisodes: 1000 }
    const achievements = createAchievements(stats({ episodesWatched: 1000 }), facts, { ...EMPTY_VIEWING_SUMMARY, maxSevenDaySeconds: 24 * 3600, longestCompletionStreakDays: 7 })
    expect(achievements.find((item) => item.id === 'trendsetter')?.earned).toBe(true)
    expect(achievements.find((item) => item.id === 'longRunningLegend')?.earned).toBe(false)
    expect(achievements.find((item) => item.id === 'sliceOfLife')?.earned).toBe(true)
    expect(achievements.find((item) => item.id === 'bingeMaster')?.earned).toBe(true)
    expect(achievements.find((item) => item.id === 'goldenWeek')?.earned).toBe(true)
  })
})
