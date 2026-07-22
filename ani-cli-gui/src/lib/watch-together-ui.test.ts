import { describe, expect, it } from 'vitest'
import type { WatchTogetherMessage } from '../watch-together-types'
import { countUnreadMessages } from './watch-together-ui'

const messages: WatchTogetherMessage[] = ['one', 'two', 'three'].map((id, index) => ({
  id,
  authorId: 'guest',
  authorName: 'Guest',
  body: id,
  createdAt: new Date(index).toISOString(),
}))

describe('watch together companion state', () => {
  it('counts messages after the last message the user read', () => {
    expect(countUnreadMessages(messages, 'one')).toBe(2)
    expect(countUnreadMessages(messages, 'three')).toBe(0)
  })

  it('uses a bounded notification when history was replaced or not initialized', () => {
    expect(countUnreadMessages(messages, null)).toBe(1)
    expect(countUnreadMessages(messages, 'missing')).toBe(1)
    expect(countUnreadMessages([], null)).toBe(0)
  })
})
