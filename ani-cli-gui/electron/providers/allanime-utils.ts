export interface WixQualityLink {
  url: string
  resolution: string
}

export function expandWixRepackagerUrl(link: string): WixQualityLink[] {
  const base = link
    .replace(/repackager\.wixmp\.com\//g, '')
    .replace(/\.urlset.*/, '')
  const qualities = link.match(/,([^/]*),\/mp4/)?.[1]
  if (!qualities) return [{ url: link, resolution: 'Auto' }]

  return qualities
    .split(',')
    .filter(Boolean)
    .map((resolution) => ({
      url: base.replace(/,[^/]*/g, resolution),
      resolution,
    }))
}
