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
): WatchTogetherContent {
  return {
    provider: anime.catalogProvider,
    showId: anime.id,
    animeName: anime.name,
    episode,
    translationType,
    aniListMediaId: anime.aniListMediaId,
  }
}
