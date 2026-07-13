import type { StreamLink } from '../scrape'

export function isCdaEmbedUrl(value: string): boolean {
  try {
    const url = new URL(value)
    const host = url.hostname.toLowerCase()
    return host === 'ebd.cda.pl' || host.endsWith('.ebd.cda.pl')
  } catch {
    return false
  }
}

export function cdaEmbedLink(url: string, provider: string): StreamLink {
  return {
    url,
    resolution: 'Embed',
    hls: false,
    provider,
    downloadable: false,
    embed: true,
  }
}
