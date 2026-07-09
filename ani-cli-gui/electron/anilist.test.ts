import { describe, expect, it } from 'vitest'
import { AniListService, descriptionToPlainText, normalizeCatalogMapping, normalizeMedia, scoreCandidate } from './anilist'
import type { CatalogMapping } from '../src/anilist-types'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

describe('AniList normalization', () => {
  it('prefers English titles and normalizes optional metadata', () => {
    const media = normalizeMedia({
      id: 1,
      title: { english: 'Frieren', romaji: 'Sousou no Frieren' },
      synonyms: ['Frieren at the Funeral'],
      coverImage: { large: 'cover.jpg', color: '#abc123' },
      nextAiringEpisode: { episode: 12, airingAt: 1_700_000_000 },
      mediaListEntry: { id: 4, status: 'CURRENT', progress: 10, score: 90, repeat: 0 },
    })
    expect(media).toMatchObject({ id: 1, title: 'Frieren', coverUrl: 'cover.jpg' })
    expect(media.nextAiringEpisode?.episode).toBe(12)
    expect(media.listState?.status).toBe('CURRENT')
  })

  it('converts description HTML into readable plain text', () => {
    expect(descriptionToPlainText('First line<br><br><i>Note: A &amp; B.</i>'))
      .toBe('First line\n\nNote: A & B.')
  })

  it('decodes numeric entities and preserves list boundaries', () => {
    expect(descriptionToPlainText('<ul><li>One</li><li>Two &#x26; three</li></ul>'))
      .toBe('• One\n• Two & three')
  })
})

describe('catalog candidate scoring', () => {
  it('ranks exact alternate titles above unrelated results', () => {
    const media = normalizeMedia({ id: 1, title: { english: 'Frieren', romaji: 'Sousou no Frieren' }, episodes: 28 })
    const exact = scoreCandidate(media, { id: 'a', name: 'Sousou no Frieren', episodes: 28, catalogProvider: 'allanime' })
    const unrelated = scoreCandidate(media, { id: 'b', name: 'One Piece', episodes: 1000, catalogProvider: 'allanime' })
    expect(exact.confidence).toBeGreaterThanOrEqual(.9)
    expect(exact.confidence).toBeGreaterThan(unrelated.confidence)
  })

  it('penalizes conflicting episode counts', () => {
    const media = normalizeMedia({ id: 1, title: { english: 'Example' }, episodes: 12 })
    const matching = scoreCandidate(media, { id: 'a', name: 'Example', episodes: 12, catalogProvider: 'allanime' })
    const conflicting = scoreCandidate(media, { id: 'b', name: 'Example', episodes: 120, catalogProvider: 'allanime' })
    expect(matching.confidence).toBeGreaterThan(conflicting.confidence)
  })
})

describe('catalog mapping providers', () => {
  it('normalizes old provider-less mappings to AllAnime', () => {
    const legacy = {
      mediaId: 1,
      scraperId: 'legacy-id',
      scraperName: 'Legacy',
      episodes: 12,
      translationType: 'sub',
      confirmedAt: 1,
    } as CatalogMapping

    expect(normalizeCatalogMapping(legacy).catalogProvider).toBe('allanime')
  })

  it('stores Anikoto mappings with provider metadata', () => {
    const service = new AniListService(mkdtempSync(join(tmpdir(), 'aniplay-anilist-')))
    const mapping = service.confirmMapping(1, { id: 'anikoto:test', name: 'Example', episodes: 12, catalogProvider: 'anikoto' }, 'sub')
    expect(mapping.catalogProvider).toBe('anikoto')
  })

  it('does not reuse a saved mapping for a different active provider', () => {
    const service = new AniListService(mkdtempSync(join(tmpdir(), 'aniplay-anilist-')))
    service.confirmMapping(1, { id: 'old-allanime-id', name: 'Example', episodes: 12, catalogProvider: 'allanime' }, 'sub')

    const media = normalizeMedia({ id: 1, title: { english: 'Example' }, episodes: 12 })
    const resolution = service.resolveMapping(media, [{ id: 'anikoto:test', name: 'Example', episodes: 12, catalogProvider: 'anikoto' }], 'sub')

    expect(resolution.mapping?.catalogProvider).toBe('anikoto')
  })
})
