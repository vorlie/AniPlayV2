import type { ProfileSharePayload } from '../profile-share-types'

const WIDTH = 1200
const HEIGHT = 630

function xml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]!)
}

function defs() {
  return `<defs>
    <style>@import url('https://fonts.googleapis.com/css2?family=Google+Sans:opsz,wght@17..18,400..700&amp;display=swap'); text { font-family: 'Google Sans', 'Roboto', 'Segoe UI', sans-serif; }</style>
    <linearGradient id="surface" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#211f26"/><stop offset="1" stop-color="#141218"/></linearGradient>
    <linearGradient id="primary" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#d0bcff"/><stop offset="1" stop-color="#efb8c8"/></linearGradient>
    <linearGradient id="heroShade" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#141218" stop-opacity="0.08"/><stop offset="0.48" stop-color="#141218" stop-opacity="0.58"/><stop offset="1" stop-color="#141218" stop-opacity="0.98"/></linearGradient>
    <clipPath id="heroFrame"><rect x="24" y="24" width="1152" height="582" rx="48"/></clipPath>
    <clipPath id="heroAvatar"><circle cx="126" cy="220" r="70"/></clipPath>
    <clipPath id="statsAvatar"><circle cx="104" cy="110" r="56"/></clipPath>
    <filter id="level2"><feDropShadow dx="0" dy="5" stdDeviation="8" flood-color="#000" flood-opacity="0.32"/></filter>
  </defs>`
}

function brandPill(x: number, y: number, dark = false) {
  const fill = dark ? '#211f26' : '#d0bcff'
  const text = dark ? '#d0bcff' : '#381e72'
  return `<rect x="${x}" y="${y}" width="142" height="44" rx="22" fill="${fill}" fill-opacity="${dark ? '.88' : '1'}"/><text x="${x + 71}" y="${y + 29}" text-anchor="middle" fill="${text}" font-size="19" font-weight="700">AniPlay</text>`
}

function heroStat(x: number, value: string, label: string, emphasized = false) {
  const fill = emphasized ? '#4f378b' : '#2b2930'
  const valueColor = emphasized ? '#eaddff' : '#e6e1e5'
  return `<rect x="${x}" y="414" width="250" height="142" rx="28" fill="${fill}" fill-opacity=".94" stroke="#938f99" stroke-opacity=".18"/><text x="${x + 24}" y="468" fill="${valueColor}" font-size="38" font-weight="700">${xml(value)}</text><text x="${x + 24}" y="511" fill="#cac4d0" font-size="16" font-weight="500">${xml(label)}</text>`
}

function hero(payload: ProfileSharePayload, avatarDataUrl?: string, bannerDataUrl?: string) {
  const banner = bannerDataUrl ? `<image href="${bannerDataUrl}" x="24" y="24" width="1152" height="582" preserveAspectRatio="xMidYMid slice" clip-path="url(#heroFrame)"/>` : '<rect x="24" y="24" width="1152" height="582" rx="48" fill="url(#surface)"/>'
  const avatar = avatarDataUrl ? `<image href="${avatarDataUrl}" x="56" y="150" width="140" height="140" preserveAspectRatio="xMidYMid slice" clip-path="url(#heroAvatar)"/>` : '<circle cx="126" cy="220" r="70" fill="#d0bcff"/><text x="126" y="239" text-anchor="middle" fill="#381e72" font-size="52" font-weight="700">A</text>'
  const milestoneWidth = payload.milestone ? Math.min(390, 58 + payload.milestone.length * 9.5) : 0
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">${defs()}<rect width="1200" height="630" fill="#141218"/>${banner}<rect x="24" y="24" width="1152" height="582" rx="48" fill="url(#heroShade)"/>${brandPill(978, 56, true)}${avatar}<circle cx="126" cy="220" r="73" fill="none" stroke="#eaddff" stroke-width="6" filter="url(#level2)"/><text x="224" y="195" fill="#d0bcff" font-size="17" font-weight="700" letter-spacing="1.8">${xml(payload.labels.profile.toUpperCase())}</text><text x="224" y="250" fill="#fff" font-size="50" font-weight="700">${xml(payload.username.slice(0, 32))}</text>${payload.milestone ? `<rect x="224" y="274" width="${milestoneWidth}" height="42" rx="21" fill="#4f378b"/><circle cx="246" cy="295" r="7" fill="#d0bcff"/><text x="264" y="301" fill="#eaddff" font-size="16" font-weight="600">${xml(payload.milestone.slice(0, 34))}</text>` : ''}${heroStat(56, String(payload.animeCount), payload.labels.anime, true)}${heroStat(328, String(payload.completed), payload.labels.completed)}${heroStat(600, String(payload.episodesWatched), payload.labels.episodes)}${heroStat(872, payload.daysWatched.toFixed(1), payload.labels.days)}</svg>`
}

function statValue(x: number, y: number, value: string, label: string) {
  return `<text x="${x}" y="${y}" fill="#e6e1e5" font-size="38" font-weight="700">${xml(value)}</text><text x="${x}" y="${y + 34}" fill="#cac4d0" font-size="16" font-weight="500">${xml(label)}</text>`
}

function stats(payload: ProfileSharePayload, avatarDataUrl?: string) {
  const genres = payload.genres.slice(0, 5)
  const max = Math.max(...genres.map((genre) => genre.count), 1)
  const bars = genres.map((genre, index) => {
    const y = 302 + index * 58
    const width = Math.max(18, genre.count / max * 406)
    return `<text x="666" y="${y}" fill="#e6e1e5" font-size="17" font-weight="600">${xml(genre.label.slice(0, 24))}</text><text x="1122" y="${y}" text-anchor="end" fill="#cac4d0" font-size="15" font-weight="500">${genre.count}</text><rect x="666" y="${y + 14}" width="456" height="12" rx="6" fill="#49454f"/><rect x="666" y="${y + 14}" width="${width}" height="12" rx="6" fill="url(#primary)"/>`
  }).join('')
  const avatar = avatarDataUrl ? `<image href="${avatarDataUrl}" x="48" y="54" width="112" height="112" preserveAspectRatio="xMidYMid slice" clip-path="url(#statsAvatar)"/>` : '<circle cx="104" cy="110" r="56" fill="#d0bcff"/>'
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">${defs()}<rect width="1200" height="630" fill="#141218"/><rect x="24" y="24" width="1152" height="174" rx="44" fill="#4f378b"/>${avatar}<circle cx="104" cy="110" r="59" fill="none" stroke="#eaddff" stroke-width="5"/><text x="192" y="93" fill="#d0bcff" font-size="16" font-weight="700" letter-spacing="1.7">${xml(payload.labels.profile.toUpperCase())}</text><text x="192" y="143" fill="#fff" font-size="42" font-weight="700">${xml(payload.username.slice(0, 32))}</text>${brandPill(994, 89)}<rect x="24" y="222" width="596" height="384" rx="36" fill="#211f26"/><rect x="644" y="222" width="532" height="384" rx="36" fill="#211f26"/><rect x="48" y="246" width="261" height="142" rx="28" fill="#4f378b"/>${statValue(76, 301, String(payload.animeCount), payload.labels.anime)}<rect x="329" y="246" width="267" height="142" rx="28" fill="#2b2930"/>${statValue(357, 301, String(payload.completed), payload.labels.completed)}<rect x="48" y="408" width="261" height="142" rx="28" fill="#2b2930"/>${statValue(76, 463, String(payload.episodesWatched), payload.labels.episodes)}<rect x="329" y="408" width="267" height="142" rx="28" fill="#332d41"/>${statValue(357, 463, payload.daysWatched.toFixed(1), payload.labels.days)}<rect x="48" y="566" width="548" height="28" rx="14" fill="#332d41"/><text x="72" y="586" fill="#e8def8" font-size="14" font-weight="600">${xml(payload.labels.meanScore)} · ${payload.meanScore ? payload.meanScore.toFixed(1) : '—'}</text><text x="676" y="270" fill="#d0bcff" font-size="18" font-weight="700">${xml(payload.labels.topGenres)}</text>${bars}</svg>`
}

export function createProfileShareSvg(payload: ProfileSharePayload, assets: { avatarDataUrl?: string; bannerDataUrl?: string } = {}) {
  return payload.style === 'hero' ? hero(payload, assets.avatarDataUrl, assets.bannerDataUrl) : stats(payload, assets.avatarDataUrl)
}
