import { app, safeStorage, shell } from 'electron'
import { createServer, type Server } from 'node:http'
import { randomBytes } from 'node:crypto'
import fs from 'node:fs'
import { join } from 'node:path'
import type { AnimeSearchResult, CatalogProvider, TranslationType } from '../src/catalog-types'
import type { AnimeDetails, AnimeSummary, AniListSession, CatalogMapping, CatalogResolution, DashboardData, ListUpdateInput, MediaListState } from '../src/anilist-types'

const API = 'https://graphql.anilist.co'
const DEFAULT_CLIENT_ID = '45193'
const CALLBACK_PORT = 42819
const CALLBACK = `http://127.0.0.1:${CALLBACK_PORT}/anilist/callback`
const TOKEN_FILE = 'anilist-token.json'
const CACHE_FILE = 'anilist-cache.json'
const MAPPING_FILE = 'anilist-mappings.json'
const PUBLIC_TTL = 15 * 60_000
const PRIVATE_TTL = 2 * 60_000

type JsonObject = Record<string, unknown>
type CacheRecord = { expiresAt: number; value: unknown }

const DASHBOARD_QUERY = `query Dashboard($season: MediaSeason, $year: Int) {
  trending: Page(page: 1, perPage: 8) { media(type: ANIME, sort: TRENDING_DESC, isAdult: false) { ...Card } }
  seasonal: Page(page: 1, perPage: 8) { media(type: ANIME, season: $season, seasonYear: $year, sort: POPULARITY_DESC, isAdult: false) { ...Card } }
  airing: Page(page: 1, perPage: 8) { airingSchedules(notYetAired: true, sort: TIME) { episode airingAt media { ...Card } } }
}
fragment Card on Media { id title { english romaji userPreferred } synonyms coverImage { large color } bannerImage format seasonYear episodes averageScore nextAiringEpisode { episode airingAt } mediaListEntry { id status progress score repeat } }`

const PRIVATE_DASHBOARD_QUERY = `query PrivateDashboard($userId: Int!) {
  recommendations: Page(page: 1, perPage: 8) { recommendations(sort: RATING_DESC, onList: false) { mediaRecommendation { ...Card } } }
  lists: MediaListCollection(userId: $userId, type: ANIME) { lists { status entries { id status progress score repeat media { ...Card } } } }
}
fragment Card on Media { id title { english romaji userPreferred } synonyms coverImage { large color } bannerImage format seasonYear episodes averageScore nextAiringEpisode { episode airingAt } mediaListEntry { id status progress score repeat } }`

const DETAILS_QUERY = `query Details($id: Int!) { Media(id: $id, type: ANIME) { id title { english romaji userPreferred } synonyms coverImage { extraLarge large color } bannerImage description(asHtml: false) genres format season seasonYear status episodes averageScore nextAiringEpisode { episode airingAt } mediaListEntry { id status progress score repeat } recommendations(perPage: 8, sort: RATING_DESC) { nodes { mediaRecommendation { id title { english romaji userPreferred } synonyms coverImage { large color } bannerImage format seasonYear episodes averageScore nextAiringEpisode { episode airingAt } mediaListEntry { id status progress score repeat } } } } } }`
const SEARCH_QUERY = `query SearchMedia($search: String!) { Page(page: 1, perPage: 8) { media(search: $search, type: ANIME, isAdult: false, sort: SEARCH_MATCH) { id title { english romaji userPreferred } synonyms coverImage { extraLarge large color } bannerImage format seasonYear episodes averageScore } } }`

function record(value: unknown): JsonObject { return value && typeof value === 'object' ? value as JsonObject : {} }
function array(value: unknown): unknown[] { return Array.isArray(value) ? value : [] }
function text(value: unknown): string | undefined { return typeof value === 'string' && value.trim() ? value.trim() : undefined }
function number(value: unknown): number | undefined { return typeof value === 'number' && Number.isFinite(value) ? value : undefined }
function catalogProvider(value: unknown): CatalogProvider { return value === 'desu' || value === 'miruro' || value === 'anikoto' ? value : 'allanime' }

export function normalizeCatalogMapping(value: CatalogMapping): CatalogMapping {
  return { ...value, catalogProvider: catalogProvider(value.catalogProvider) }
}

export function descriptionToPlainText(value: unknown): string {
  const source = text(value)
  if (!source) return 'No description available.'

  const entities: Record<string, string> = {
    amp: '&', apos: "'", gt: '>', lt: '<', nbsp: ' ', quot: '"',
  }

  return source
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:div|p|li|blockquote|h[1-6])\s*>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
      if (entity.startsWith('#x') || entity.startsWith('#X')) {
        const codePoint = Number.parseInt(entity.slice(2), 16)
        return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match
      }
      if (entity.startsWith('#')) {
        const codePoint = Number.parseInt(entity.slice(1), 10)
        return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match
      }
      return entities[entity.toLowerCase()] ?? match
    })
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function normalizeMedia(value: unknown): AnimeSummary {
  const media = record(value)
  const title = record(media.title)
  const cover = record(media.coverImage)
  const airing = record(media.nextAiringEpisode)
  const list = normalizeList(media.mediaListEntry)
  return {
    id: number(media.id) ?? 0,
    title: text(title.english) ?? text(title.userPreferred) ?? text(title.romaji) ?? 'Untitled',
    titleEnglish: text(title.english), titleRomaji: text(title.romaji),
    synonyms: array(media.synonyms).filter((item): item is string => typeof item === 'string'),
    coverUrl: text(cover.extraLarge) ?? text(cover.large) ?? '', bannerUrl: text(media.bannerImage),
    accentColor: text(cover.color) ?? '#D0BCFF', format: text(media.format), seasonYear: number(media.seasonYear),
    episodes: number(media.episodes), averageScore: number(media.averageScore),
    nextAiringEpisode: number(airing.episode) && number(airing.airingAt) ? { episode: number(airing.episode)!, airingAt: number(airing.airingAt)! } : undefined,
    listState: list,
  }
}

function normalizeList(value: unknown): MediaListState | undefined {
  const item = record(value)
  const id = number(item.id); const status = text(item.status)
  if (!id || !status) return undefined
  return { id, status: status as MediaListState['status'], progress: number(item.progress) ?? 0, score: number(item.score) ?? 0, repeat: number(item.repeat) ?? 0 }
}

export function scoreCandidate(media: AnimeSummary, candidate: AnimeSearchResult): { confidence: number; reasons: string[] } {
  const normalize = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
  const candidateName = normalize(candidate.name)
  const titles = [media.title, media.titleEnglish, media.titleRomaji, ...media.synonyms].filter((x): x is string => Boolean(x)).map(normalize)
  let confidence = 0; const reasons: string[] = []
  if (titles.includes(candidateName)) { confidence += 0.82; reasons.push('exact title') }
  else if (titles.some((title) => title.includes(candidateName) || candidateName.includes(title))) { confidence += 0.58; reasons.push('partial title') }
  else {
    const words = new Set(candidateName.split(' ')); const best = Math.max(...titles.map((title) => title.split(' ').filter((word) => words.has(word)).length / Math.max(words.size, title.split(' ').length)), 0)
    confidence += best * 0.55; if (best > .5) reasons.push('similar title')
  }
  if (media.episodes && candidate.episodes) {
    if (media.episodes === candidate.episodes) { confidence += .14; reasons.push('episode count') }
    else if (Math.abs(media.episodes - candidate.episodes) > 2) confidence -= .12
  }
  return { confidence: Math.max(0, Math.min(1, confidence)), reasons }
}

export class AniListService {
  private token?: string
  private expiresAt?: number
  private user?: AniListSession['user']
  private cache = new Map<string, CacheRecord>()
  private pending = new Map<string, Promise<unknown>>()
  private mappings = new Map<number, CatalogMapping>()
  private authServer?: Server
  private readonly clientId = process.env.ANILIST_CLIENT_ID ?? process.env.VITE_ANILIST_CLIENT_ID ?? DEFAULT_CLIENT_ID
  private readonly basePath: string

  constructor(basePath = app.getPath('userData')) {
    this.basePath = basePath
  }

  initialize() { this.loadToken(); this.loadJsonCache(); this.loadMappings() }
  shutdown() { this.authServer?.close(); this.authServer = undefined }
  getSession(): AniListSession { return { authenticated: Boolean(this.token && this.user), configured: Boolean(this.clientId), user: this.user, expiresAt: this.expiresAt } }

  private path(name: string) { return join(this.basePath, name) }
  private loadToken() {
    try {
      const saved = JSON.parse(fs.readFileSync(this.path(TOKEN_FILE), 'utf8')) as { token: string; expiresAt: number; user?: AniListSession['user'] }
      if (saved.expiresAt <= Date.now() || !safeStorage.isEncryptionAvailable()) return
      this.token = safeStorage.decryptString(Buffer.from(saved.token, 'base64')); this.expiresAt = saved.expiresAt; this.user = saved.user
    } catch { /* signed out */ }
  }
  private saveToken() {
    if (!this.token || !this.expiresAt || !safeStorage.isEncryptionAvailable()) throw new Error('Secure credential storage is unavailable')
    fs.writeFileSync(this.path(TOKEN_FILE), JSON.stringify({ token: safeStorage.encryptString(this.token).toString('base64'), expiresAt: this.expiresAt, user: this.user }), 'utf8')
  }
  private loadJsonCache() { try { const saved = JSON.parse(fs.readFileSync(this.path(CACHE_FILE), 'utf8')) as Record<string, CacheRecord>; for (const [key, value] of Object.entries(saved)) this.cache.set(key, value) } catch { /* empty */ } }
  private saveCache() { const recent = [...this.cache.entries()].filter(([, item]) => item.expiresAt > Date.now() - 24 * 60 * 60_000).slice(-30); fs.writeFileSync(this.path(CACHE_FILE), JSON.stringify(Object.fromEntries(recent)), 'utf8') }
  private loadMappings() {
    try {
      const items = JSON.parse(fs.readFileSync(this.path(MAPPING_FILE), 'utf8')) as CatalogMapping[]
      items.forEach((item) => this.mappings.set(item.mediaId, normalizeCatalogMapping(item)))
    } catch { /* empty */ }
  }
  private saveMappings() { fs.writeFileSync(this.path(MAPPING_FILE), JSON.stringify([...this.mappings.values()]), 'utf8') }

  async validateSession() {
    if (!this.token) return this.getSession()
    try { const data = await this.request('query { Viewer { id name avatar { medium } } }', {}, true, false) as JsonObject; const viewer = record(data.Viewer); this.user = { id: number(viewer.id)!, name: text(viewer.name)!, avatar: text(record(viewer.avatar).medium) }; this.saveToken() }
    catch { this.logout() }
    return this.getSession()
  }

  async startAuth(): Promise<AniListSession> {
    if (!this.clientId) throw new Error('AniList sign-in is not configured. Set ANILIST_CLIENT_ID when building or launching AniPlay.')
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Secure credential storage is unavailable on this system')
    this.authServer?.close()
    const state = randomBytes(24).toString('hex')
    const result = new Promise<AniListSession>((resolve, reject) => {
      const timeout = setTimeout(() => { this.authServer?.close(); reject(new Error('AniList sign-in timed out')) }, 180_000)
      this.authServer = createServer((req, res) => {
        const url = new URL(req.url ?? '/', CALLBACK)
        if (req.method === 'GET' && url.pathname === '/anilist/callback') {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(`<!doctype html><meta charset="utf-8"><title>AniPlay sign-in</title><p id="status">Completing sign-in…</p><script>const p=new URLSearchParams(location.hash.slice(1));fetch('/anilist/token',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(Object.fromEntries(p))}).then(r=>r.json()).then(x=>{document.getElementById('status').textContent=x.ok?'Signed in. You may close this window.':(x.error||'Sign-in failed.')}).catch(()=>document.getElementById('status').textContent='Sign-in failed.');</script>`); return
        }
        if (req.method === 'POST' && url.pathname === '/anilist/token') {
          let body = ''; req.on('data', (chunk) => { if (body.length < 16_000) body += String(chunk) }); req.on('end', async () => {
            try { const payload = JSON.parse(body) as Record<string, string>; if (payload.state !== state) throw new Error('OAuth state mismatch'); if (!payload.access_token) throw new Error(payload.error_description || 'AniList did not return an access token'); this.token = payload.access_token; this.expiresAt = Date.now() + Number(payload.expires_in || 31_536_000) * 1000; await this.validateSession(); if (!this.token) throw new Error('AniList rejected the access token'); res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true })); clearTimeout(timeout); this.authServer?.close(); this.authServer = undefined; resolve(this.getSession()) } catch (error) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : 'Sign-in failed' })); clearTimeout(timeout); reject(error) }
          }); return
        }
        res.writeHead(404); res.end()
      })
      this.authServer.once('error', (error) => { clearTimeout(timeout); reject(new Error(`Cannot start AniList callback server: ${error.message}`)) })
      this.authServer.listen(CALLBACK_PORT, '127.0.0.1', async () => {
        const authorize = new URL('https://anilist.co/api/v2/oauth/authorize'); authorize.searchParams.set('client_id', this.clientId); authorize.searchParams.set('response_type', 'token'); authorize.searchParams.set('state', state)
        try { await shell.openExternal(authorize.toString()) } catch (error) { clearTimeout(timeout); this.authServer?.close(); reject(error) }
      })
    })
    return result
  }

  logout() { this.token = undefined; this.expiresAt = undefined; this.user = undefined; this.cache.clear(); try { fs.unlinkSync(this.path(TOKEN_FILE)) } catch { /* absent */ } return this.getSession() }

  private async request(query: string, variables: JsonObject, authenticated: boolean, cacheable = true, cacheKey?: string): Promise<unknown> {
    if (authenticated && !this.token) throw new Error('Sign in to AniList first')
    const key = cacheKey ?? JSON.stringify([query, variables, authenticated && this.user?.id])
    const cached = this.cache.get(key); if (cacheable && cached && cached.expiresAt > Date.now()) return cached.value
    const existing = this.pending.get(key); if (existing) return existing
    const operation = (async () => {
      const response = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(authenticated && this.token ? { Authorization: `Bearer ${this.token}` } : {}) }, body: JSON.stringify({ query, variables }), signal: AbortSignal.timeout(12_000) })
      const json = await response.json() as { data?: unknown; errors?: Array<{ message?: string }> }
      if (response.status === 401) { this.logout(); throw new Error('AniList session expired') }
      if (response.status === 429) throw new Error(`AniList rate limit reached. Retry in ${response.headers.get('Retry-After') ?? '60'} seconds.`)
      if (!response.ok || json.errors?.length) throw new Error(json.errors?.[0]?.message ?? `AniList request failed (${response.status})`)
      if (cacheable) { this.cache.set(key, { value: json.data, expiresAt: Date.now() + (authenticated ? PRIVATE_TTL : PUBLIC_TTL) }); this.saveCache() }
      return json.data
    })().finally(() => this.pending.delete(key))
    this.pending.set(key, operation); return operation
  }

  async dashboard(): Promise<DashboardData> {
    const now = new Date(); const seasons = ['WINTER', 'SPRING', 'SUMMER', 'FALL']; const season = seasons[Math.floor(now.getMonth() / 3)]
    let publicData: JsonObject; let stale = false
    try { publicData = record(await this.request(DASHBOARD_QUERY, { season, year: now.getFullYear() }, false, true, 'dashboard:public')) }
    catch (error) { const cached = this.cache.get('dashboard:public'); if (!cached) throw error; publicData = record(cached.value); stale = true }
    let privateData: JsonObject = {}
    if (this.token && this.user) { try { privateData = record(await this.request(PRIVATE_DASHBOARD_QUERY, { userId: this.user.id }, true, true, `dashboard:user:${this.user.id}`)) } catch { const cached = this.cache.get(`dashboard:user:${this.user.id}`); if (cached) { privateData = record(cached.value); stale = true } } }
    const listGroups = array(record(privateData.lists).lists).map(record)
    const list = (status: string) => listGroups.filter((group) => group.status === status).flatMap((group) => array(group.entries).map((entry) => normalizeMedia(record(entry).media)))
    return { session: this.getSession(), trending: array(record(publicData.trending).media).map(normalizeMedia), seasonal: array(record(publicData.seasonal).media).map(normalizeMedia), airing: array(record(publicData.airing).airingSchedules).map((value) => { const item = record(value); return { episode: number(item.episode) ?? 0, airingAt: number(item.airingAt) ?? 0, media: normalizeMedia(item.media) } }), recommendations: array(record(privateData.recommendations).recommendations).map((value) => normalizeMedia(record(value).mediaRecommendation)).filter((item) => item.id), current: list('CURRENT'), planning: list('PLANNING'), completed: list('COMPLETED'), stale }
  }

  async details(id: number): Promise<AnimeDetails> {
    const data = record(await this.request(DETAILS_QUERY, { id }, Boolean(this.token), true, `details:${id}:${this.user?.id ?? 'public'}`)); const media = record(data.Media); const summary = normalizeMedia(media)
    return { ...summary, description: descriptionToPlainText(media.description), genres: array(media.genres).filter((x): x is string => typeof x === 'string'), status: text(media.status), season: text(media.season), recommendations: array(record(media.recommendations).nodes).map((node) => normalizeMedia(record(node).mediaRecommendation)).filter((item) => item.id) }
  }

  async updateList(input: ListUpdateInput): Promise<MediaListState> {
    const data = record(await this.request('mutation Save($mediaId: Int!, $status: MediaListStatus!, $progress: Int, $score: Float, $repeat: Int) { SaveMediaListEntry(mediaId: $mediaId, status: $status, progress: $progress, score: $score, repeat: $repeat) { id status progress score repeat } }', { ...input }, true, false)); this.cache.clear(); return normalizeList(data.SaveMediaListEntry)!
  }
  async deleteList(entryId: number) { await this.request('mutation Delete($id: Int!) { DeleteMediaListEntry(id: $id) { deleted } }', { id: entryId }, true, false); this.cache.clear(); return true }
  resolveMapping(media: AnimeSummary, candidates: AnimeSearchResult[], translationType: TranslationType): CatalogResolution {
    const activeProvider = candidates[0]?.catalogProvider
    const saved = this.mappings.get(media.id)
    if (saved && saved.translationType === translationType && (!activeProvider || saved.catalogProvider === activeProvider)) return { mapping: saved, candidates: [], autoMatched: true }
    const ranked = candidates.map((anime) => ({ anime, ...scoreCandidate(media, anime) })).sort((a, b) => b.confidence - a.confidence)
    const first = ranked[0]; const second = ranked[1]; const auto = Boolean(first && first.confidence >= .86 && (!second || first.confidence - second.confidence >= .12))
    if (auto) { const mapping = this.confirmMapping(media.id, first.anime, translationType); return { mapping, candidates: ranked, autoMatched: true } }
    return { candidates: ranked, autoMatched: false }
  }
  async resolveAniListMetadata(scraperAnime: AnimeSearchResult, translationType: TranslationType): Promise<AnimeSummary | null> {
    const saved = [...this.mappings.values()].find((mapping) => mapping.scraperId === scraperAnime.id && mapping.translationType === translationType && mapping.catalogProvider === scraperAnime.catalogProvider)
    if (saved) {
      try { return await this.details(saved.mediaId) } catch { /* fall through to title search */ }
    }

    const data = record(await this.request(SEARCH_QUERY, { search: scraperAnime.name }, false, true, `media-search:${scraperAnime.name.toLowerCase()}`))
    const ranked = array(record(data.Page).media)
      .map(normalizeMedia)
      .filter((media) => media.id)
      .map((media) => ({ media, ...scoreCandidate(media, scraperAnime) }))
      .sort((a, b) => b.confidence - a.confidence)
    const first = ranked[0]
    const second = ranked[1]
    if (!first || first.confidence < .8 || (second && first.confidence - second.confidence < .12)) return null
    this.confirmMapping(first.media.id, scraperAnime, translationType)
    return first.media
  }
  confirmMapping(mediaId: number, anime: AnimeSearchResult, translationType: TranslationType) { const mapping: CatalogMapping = { mediaId, scraperId: anime.id, scraperName: anime.name, episodes: anime.episodes, catalogProvider: anime.catalogProvider, translationType, confirmedAt: Date.now() }; this.mappings.set(mediaId, mapping); this.saveMappings(); return mapping }
  forgetMapping(mediaId: number) { const removed = this.mappings.delete(mediaId); this.saveMappings(); return removed }
}
