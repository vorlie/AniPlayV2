import type { WatchTogetherMessage } from '../watch-together-types'

export function countUnreadMessages(messages: WatchTogetherMessage[], lastReadMessageId: string | null): number {
  if (messages.length === 0) return 0
  if (!lastReadMessageId) return 1
  const lastReadIndex = messages.findIndex((message) => message.id === lastReadMessageId)
  if (lastReadIndex < 0) return 1
  return Math.max(0, messages.length - lastReadIndex - 1)
}
