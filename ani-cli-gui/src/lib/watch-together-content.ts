import type { CatalogProvider, TranslationType } from '../catalog-types'
import type { WatchTogetherContent } from '../watch-together-types'

interface WatchTogetherAnimeLike {
  id: string
  name: string
  episodes?: number
  aniListMediaId?: number
  catalogProvider: CatalogProvider
}

interface WatchTogetherStreamLike {
  embed?: boolean
}

export function hasControllableWatchTogetherSource(links: WatchTogetherStreamLike[]): boolean {
  return links.some((link) => !link.embed)
}

export function shouldWarnAboutUncontrollableAnikotoSource(
  provider: CatalogProvider,
  links: WatchTogetherStreamLike[],
): boolean {
  return provider === 'anikoto' && links.length > 0 && !hasControllableWatchTogetherSource(links)
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
