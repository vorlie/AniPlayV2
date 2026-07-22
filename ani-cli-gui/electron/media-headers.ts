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
