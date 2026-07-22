const MEGAPLAY_MEDIA_DOMAINS = [
  'megaplay.buzz',
  'mewstream.buzz',
  'lostproject.club',
  'voltara.click',
  'kotocdn.site',
] as const

export const MEGAPLAY_MEDIA_URL_PATTERNS = MEGAPLAY_MEDIA_DOMAINS.flatMap((domain) => [
  `*://${domain}/*`,
  `*://*.${domain}/*`,
])

function isDomainOrSubdomain(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`)
}

export function isMegaPlayMediaHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/\.$/, '')
  return MEGAPLAY_MEDIA_DOMAINS.some((domain) => isDomainOrSubdomain(normalized, domain))
}

export function correctedMegaPlayContentType(url: string, current?: string): string | undefined {
  try {
    const parsed = new URL(url)
    if (!isMegaPlayMediaHost(parsed.hostname)) return current
    const pathname = parsed.pathname.toLowerCase()
    if (pathname.endsWith('.vtt')) return 'text/vtt; charset=utf-8'
    if (pathname.endsWith('.m3u8')) return 'application/vnd.apple.mpegurl'
    return current
  } catch {
    return current
  }
}

function isAppRendererUrl(value: string, devServerUrl?: string): boolean {
  try {
    const url = new URL(value)
    if (url.protocol === 'file:') return true
    return Boolean(devServerUrl && url.origin === new URL(devServerUrl).origin)
  } catch {
    return false
  }
}

export function isProviderOwnedFrameRequest(resourceType: string, parentFrameUrl?: string, devServerUrl?: string): boolean {
  if (!parentFrameUrl) return false
  return resourceType !== 'subFrame' || !isAppRendererUrl(parentFrameUrl, devServerUrl)
}
