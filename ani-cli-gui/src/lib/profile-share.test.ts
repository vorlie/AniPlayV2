import { describe, expect, it } from 'vitest'
import { createProfileShareSvg } from './profile-share'
import type { ProfileSharePayload } from '../profile-share-types'

const payload: ProfileSharePayload = {
  style: 'hero',
  username: 'A&B <Fan>',
  animeCount: 120,
  completed: 80,
  episodesWatched: 2400,
  daysWatched: 42.5,
  meanScore: 84.2,
  genres: [{ label: 'Action & Adventure', count: 50 }],
  milestone: 'Century Club',
  labels: { profile: 'AniList profile', anime: 'Anime', completed: 'Completed', episodes: 'Episodes', days: 'Days', meanScore: 'Mean score', topGenres: 'Top genres' },
}

describe('profile share cards', () => {
  it('creates a fixed-size hero card and escapes profile text', () => {
    const svg = createProfileShareSvg(payload)
    expect(svg).toContain('width="1200" height="630"')
    expect(svg).toContain("font-family: 'Google Sans'")
    expect(svg).toContain('rx="48"')
    expect(svg).toContain('A&amp;B &lt;Fan&gt;')
    expect(svg).not.toContain('A&B <Fan>')
  })

  it('creates the stats layout with genre bars', () => {
    const svg = createProfileShareSvg({ ...payload, style: 'stats' })
    expect(svg).toContain('Top genres')
    expect(svg).toContain('fill="#4f378b"')
    expect(svg).toContain('Action &amp; Adventure')
  })
})
