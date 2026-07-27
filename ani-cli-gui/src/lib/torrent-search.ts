export function buildTorrentSearchQuery(title: string, season: string): string {
  const normalizedTitle = title.trim()
  const normalizedSeason = season.trim()
  if (!normalizedSeason) return normalizedTitle
  const seasonNumber = Number(normalizedSeason)
  if (!Number.isInteger(seasonNumber) || seasonNumber <= 0) return normalizedTitle
  const existingSeason = new RegExp(`(?:\\bseason\\s*0?${seasonNumber}\\b|\\bs0?${seasonNumber}\\b|\\b${seasonNumber}(?:st|nd|rd|th)\\s+season\\b)`, 'i')
  return existingSeason.test(normalizedTitle) ? normalizedTitle : `${normalizedTitle} Season ${seasonNumber}`
}
