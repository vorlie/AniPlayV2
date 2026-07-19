import { useCallback, useState } from 'react'
import { ArrowLeft, ArrowRight, ChevronRight, Compass, Library, UserRound } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { HomePage } from './HomePage'
import { ProfilePage } from './ProfilePage'
import type { AnimeSearchResult } from '../catalog-types'
import type { AnimeSummary } from '../anilist-types'
import type { HistoryEntry } from '../lib/history'

type AniListSection = 'overview' | 'discover' | 'library'

type AniListRoute =
  | { view: AniListSection }
  | { view: 'media'; id: number; title?: string; parent: AniListSection; originLabel?: string }

interface RouteEntry {
  route: AniListRoute
  scrollY: number
}

interface AniListPageProps {
  setSearchQuery: (value: string) => void
  setResults: (value: AnimeSearchResult[]) => void
  onSelectAnime: (anime: AnimeSearchResult, options?: { episode?: string | null; resumeSeconds?: number | null }) => void
  onResume: (item: HistoryEntry) => void
  initialSelectedId?: number | null
}

const sections = [
  { id: 'overview' as const, labelKey: 'anilistWorkspace.overview', descriptionKey: 'anilistWorkspace.overviewTabDescription', icon: UserRound },
  { id: 'discover' as const, labelKey: 'anilistWorkspace.discover', descriptionKey: 'anilistWorkspace.discoverTabDescription', icon: Compass },
  { id: 'library' as const, labelKey: 'anilistWorkspace.library', descriptionKey: 'anilistWorkspace.libraryTabDescription', icon: Library },
]

function routeSection(route: AniListRoute): AniListSection {
  return route.view === 'media' ? route.parent : route.view
}

export function AniListPage({ setSearchQuery, setResults, onSelectAnime, onResume, initialSelectedId = null }: AniListPageProps) {
  const { t } = useTranslation()
  const [routeHistory, setRouteHistory] = useState<RouteEntry[]>(() => initialSelectedId
    ? [{ route: { view: 'discover' }, scrollY: 0 }, { route: { view: 'media', id: initialSelectedId, parent: 'discover' }, scrollY: 0 }]
    : [{ route: { view: 'overview' }, scrollY: 0 }])
  const [historyIndex, setHistoryIndex] = useState(() => initialSelectedId ? 1 : 0)
  const [lastCollectionSection, setLastCollectionSection] = useState<'discover' | 'library'>('discover')
  const currentRoute = routeHistory[historyIndex].route
  const visibleSection = routeSection(currentRoute)
  const collectionSection = visibleSection === 'discover' || visibleSection === 'library' ? visibleSection : lastCollectionSection

  const restoreScroll = (scrollY: number) => window.requestAnimationFrame(() => window.scrollTo({ top: scrollY, behavior: 'auto' }))

  const pushRoute = (route: AniListRoute) => {
    const nextHistory = routeHistory.slice(0, historyIndex + 1)
    nextHistory[historyIndex] = { ...nextHistory[historyIndex], scrollY: window.scrollY }
    nextHistory.push({ route, scrollY: 0 })
    setRouteHistory(nextHistory)
    setHistoryIndex(nextHistory.length - 1)
    const section = routeSection(route)
    if (section === 'discover' || section === 'library') setLastCollectionSection(section)
    window.scrollTo({ top: 0, behavior: 'auto' })
  }

  const goBack = () => {
    if (historyIndex <= 0) return
    const targetIndex = historyIndex - 1
    const nextHistory = routeHistory.map((entry, index) => index === historyIndex ? { ...entry, scrollY: window.scrollY } : entry)
    setRouteHistory(nextHistory)
    setHistoryIndex(targetIndex)
    restoreScroll(nextHistory[targetIndex].scrollY)
  }

  const goForward = () => {
    if (historyIndex >= routeHistory.length - 1) return
    const targetIndex = historyIndex + 1
    const nextHistory = routeHistory.map((entry, index) => index === historyIndex ? { ...entry, scrollY: window.scrollY } : entry)
    setRouteHistory(nextHistory)
    setHistoryIndex(targetIndex)
    restoreScroll(nextHistory[targetIndex].scrollY)
  }

  const openMedia = (media: Pick<AnimeSummary, 'id' | 'title'>, parent: AniListSection = visibleSection, originLabel?: string) => {
    pushRoute({ view: 'media', id: media.id, title: media.title, parent, originLabel })
  }

  const resolveMediaTitle = useCallback((media: AnimeSummary) => {
    setRouteHistory((entries) => entries.map((entry) => entry.route.view === 'media' && entry.route.id === media.id
      ? { ...entry, route: { ...entry.route, title: media.title } }
      : entry))
  }, [])

  const sectionLabel = (section: AniListSection) => t(`anilistWorkspace.${section}`)
  const selectSection = (section: AniListSection) => {
    if (currentRoute.view === section) return
    pushRoute({ view: section })
  }

  return <div className="flex flex-1 flex-col gap-4">
    <section className="m3-card overflow-hidden p-2">
      <div className="flex min-w-0 items-center gap-1 px-1 pb-2">
        <button type="button" disabled={historyIndex === 0} onClick={goBack} className="icon-button !size-8 shrink-0 disabled:opacity-35" aria-label={t('anilistWorkspace.goBack')} title={t('anilistWorkspace.goBack')}><ArrowLeft size={16}/></button>
        <button type="button" disabled={historyIndex >= routeHistory.length - 1} onClick={goForward} className="icon-button !size-8 shrink-0 disabled:opacity-35" aria-label={t('anilistWorkspace.goForward')} title={t('anilistWorkspace.goForward')}><ArrowRight size={16}/></button>
        <nav className="ml-1 flex min-w-0 items-center gap-1 overflow-hidden text-xs" aria-label={t('anilistWorkspace.breadcrumbs')}>
          <button type="button" onClick={() => currentRoute.view === 'overview' ? undefined : selectSection('overview')} aria-current={currentRoute.view === 'overview' ? 'page' : undefined} className={`shrink-0 rounded-lg px-2 py-1.5 font-bold ${currentRoute.view === 'overview' ? 'text-m3-on-surface' : 'text-m3-on-surface-variant hover:bg-m3-on-surface/10 hover:text-m3-on-surface'}`}>{t('nav.anilist')}</button>
          {currentRoute.view !== 'overview' ? <><ChevronRight className="shrink-0 text-m3-outline" size={14}/><button type="button" onClick={() => currentRoute.view === visibleSection ? undefined : selectSection(visibleSection)} aria-current={currentRoute.view === visibleSection ? 'page' : undefined} className={`shrink-0 rounded-lg px-2 py-1.5 font-bold ${currentRoute.view === visibleSection ? 'text-m3-on-surface' : 'text-m3-on-surface-variant hover:bg-m3-on-surface/10 hover:text-m3-on-surface'}`}>{sectionLabel(visibleSection)}</button></> : null}
          {currentRoute.view === 'media' && currentRoute.originLabel ? <><ChevronRight className="shrink-0 text-m3-outline" size={14}/><span className="hidden shrink-0 text-m3-on-surface-variant sm:inline">{currentRoute.originLabel}</span></> : null}
          {currentRoute.view === 'media' ? <><ChevronRight className="shrink-0 text-m3-outline" size={14}/><span className="truncate font-bold text-m3-primary">{currentRoute.title ?? t('anilistWorkspace.animeDetails')}</span></> : null}
        </nav>
      </div>
      <div className="grid grid-cols-3 gap-1 border-t border-m3-outline/10 pt-2" role="tablist" aria-label={t('anilistWorkspace.navigation')}>
        {sections.map(({ id, labelKey, descriptionKey, icon: Icon }) => {
          const active = visibleSection === id
          return <button key={id} type="button" role="tab" aria-selected={active} onClick={() => selectSection(id)} className={`group flex min-w-0 items-center justify-center gap-2 rounded-xl px-2 py-2.5 text-left transition-colors sm:justify-start sm:px-4 ${active ? 'bg-m3-primary text-m3-on-primary' : 'text-m3-on-surface-variant hover:bg-m3-on-surface/10 hover:text-m3-on-surface'}`}>
            <Icon className="shrink-0" size={18}/>
            <span className="min-w-0"><strong className="block truncate text-xs sm:text-sm">{t(labelKey)}</strong><span className={`hidden truncate text-[10px] lg:block ${active ? 'text-m3-on-primary/75' : 'text-m3-on-surface-variant'}`}>{t(descriptionKey)}</span></span>
          </button>
        })}
      </div>
    </section>

    <div className={currentRoute.view === 'overview' ? 'block' : 'hidden'} aria-hidden={currentRoute.view !== 'overview'}>
      <ProfilePage onOpenMedia={(media) => openMedia(media, 'overview')}/>
    </div>
    <div className={currentRoute.view === 'overview' ? 'hidden' : 'block'} aria-hidden={currentRoute.view === 'overview'}>
      <HomePage
        view={collectionSection}
        setSearchQuery={setSearchQuery}
        setResults={setResults}
        onSelectAnime={onSelectAnime}
        onResume={onResume}
        selectedMediaId={currentRoute.view === 'media' ? currentRoute.id : null}
        onOpenMedia={(media, originLabel) => openMedia(media, currentRoute.view === 'media' ? currentRoute.parent : collectionSection, originLabel)}
        onCloseMedia={goBack}
        onMediaResolved={resolveMediaTitle}
      />
    </div>
  </div>
}
