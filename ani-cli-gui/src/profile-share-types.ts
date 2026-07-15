export type ProfileShareStyle = 'hero' | 'stats'

export interface ProfileSharePayload {
  style: ProfileShareStyle
  username: string
  avatarUrl?: string
  bannerUrl?: string
  animeCount: number
  completed: number
  episodesWatched: number
  daysWatched: number
  meanScore: number
  genres: Array<{ label: string; count: number }>
  milestone?: string
  labels: {
    profile: string
    anime: string
    completed: string
    episodes: string
    days: string
    meanScore: string
    topGenres: string
  }
}
