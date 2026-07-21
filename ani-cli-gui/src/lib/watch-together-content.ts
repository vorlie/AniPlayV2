import type { CatalogProvider, TranslationType } from '../catalog-types'
import type { WatchTogetherContent } from '../watch-together-types'

interface WatchTogetherAnimeLike {
  id: string
  name: string
  episodes?: number
  aniListMediaId?: number
  catalogProvider: CatalogProvider
}

export function buildWatchTogetherContent(
  anime: WatchTogetherAnimeLike,
  episode: string,
  translationType: TranslationType,
  streamUrl?: string,
  streamKind?: WatchTogetherContent['streamKind'],
): WatchTogetherContent {
  const content: WatchTogetherContent = {
    provider: anime.catalogProvider,
    showId: anime.id,
    animeName: anime.name,
    episode,
    translationType,
    aniListMediaId: anime.aniListMediaId,
  }

  if (streamUrl && (anime.catalogProvider === 'anikoto' || streamKind)) {
    content.streamUrl = streamUrl
    content.streamKind = streamKind ?? 'embed'
  }

  return content
}
