import { describe, expect, it } from 'vitest'
import { normalizeRemoteNoticeDocument } from './remote-notices'

const now = new Date('2026-07-07T15:00:00Z')

describe('remote notice normalization', () => {
  it('normalizes active notices and drops unsafe links', () => {
    const state = normalizeRemoteNoticeDocument({
      version: 1,
      updatedAt: '2026-07-07T12:00:00Z',
      notices: [
        {
          id: 'allanime-outage-2026-07-07',
          severity: 'warning',
          title: 'AllAnime is currently broken',
          message: 'AllAnime changed their backend.',
          providers: ['allanime', 'docchi', 'invalid'],
          minVersion: '1.9.0',
          startsAt: '2026-07-07T12:00:00Z',
          dismissible: true,
          link: 'https://github.com/pystardust/ani-cli/issues/1763',
        },
        {
          id: 'unsafe-link',
          severity: 'info',
          title: 'Unsafe link',
          message: 'This link should be removed.',
          link: 'javascript:alert(1)',
        },
      ],
    }, '1.9.2', {}, now)

    expect(state.sourceUpdatedAt).toBe('2026-07-07T12:00:00.000Z')
    expect(state.notices).toHaveLength(2)
    expect(state.notices[0]).toMatchObject({
      id: 'allanime-outage-2026-07-07',
      severity: 'warning',
      providers: ['allanime', 'docchi'],
      link: 'https://github.com/pystardust/ani-cli/issues/1763',
    })
    expect(state.notices[1].link).toBeUndefined()
  })

  it('filters dismissed, inactive, and version-mismatched notices', () => {
    const state = normalizeRemoteNoticeDocument({
      version: 1,
      notices: [
        { id: 'dismissed', severity: 'warning', title: 'Dismissed', message: 'Hidden.' },
        { id: 'future', severity: 'warning', title: 'Future', message: 'Hidden.', startsAt: '2026-07-08T00:00:00Z' },
        { id: 'expired', severity: 'warning', title: 'Expired', message: 'Hidden.', endsAt: '2026-07-07T14:00:00Z' },
        { id: 'too-new', severity: 'warning', title: 'Too new', message: 'Hidden.', minVersion: '2.0.0' },
        { id: 'too-old', severity: 'warning', title: 'Too old', message: 'Hidden.', maxVersion: '1.9.1' },
        { id: 'active', severity: 'critical', title: 'Active', message: 'Visible.' },
      ],
    }, '1.9.2', { dismissed: '2026-07-07T13:00:00Z' }, now)

    expect(state.notices.map((notice) => notice.id)).toEqual(['active'])
  })

  it('rejects unsupported document versions', () => {
    expect(() => normalizeRemoteNoticeDocument({ version: 2, notices: [] }, '1.9.2')).toThrow('Unsupported remote notice document version')
  })
})
