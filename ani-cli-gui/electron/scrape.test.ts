import { Buffer } from 'node:buffer'
import { describe, expect, it, vi } from 'vitest'
import { allAnimeMaterialCandidates } from './scrape'

vi.mock('electron', () => ({ app: { getPath: () => 'Z:/nonexistent-aniplay-test-data' } }))

describe('AllAnime crypto rollout candidates', () => {
  it('tries the discovered epoch, adjacent epochs, and bundled builds in order', () => {
    const candidates = allAnimeMaterialCandidates({
      epoch: 5000,
      buildId: '47',
      key: Buffer.alloc(32, 1),
      source: 'dynamic',
      partA: 'dynamic-mask',
      partB: 'dynamic-part',
      fetchedAt: '2026-07-20T00:00:00.000Z',
    })

    expect(candidates.map(({ epoch, buildId, source }) => ({ epoch, buildId, source }))).toEqual([
      { epoch: 5000, buildId: '47', source: 'dynamic' },
      { epoch: 4999, buildId: '47', source: 'dynamic' },
      { epoch: 5001, buildId: '47', source: 'dynamic' },
      { epoch: 6884, buildId: '48', source: 'fallback' },
      { epoch: 4128, buildId: '12', source: 'fallback' },
      { epoch: 4128, buildId: '9', source: 'fallback' },
    ])
    expect(candidates[3]?.key.toString('hex')).toBe('f34fa715e2958b8c1ebc6efa4d089acd8f196d8b83d4b6201586c00c8a52e4a8')
  })
})
