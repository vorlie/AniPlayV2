import { Search, History, Settings, Radio, Download, UserRound, type LucideIcon } from 'lucide-react'
import type { CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'

const baseTabs: Array<{ id: string; labelKey: string; icon: LucideIcon }> = [
  { id: 'anilist', labelKey: 'nav.anilist', icon: UserRound },
  { id: 'search', labelKey: 'nav.search', icon: Search },
  { id: 'history', labelKey: 'nav.history', icon: History },
  { id: 'downloads', labelKey: 'nav.downloads', icon: Download },
  { id: 'settings', labelKey: 'nav.settings', icon: Settings },
]

export function Navigation({
  activeTab,
  setActiveTab,
  hasActivePlayer = false,
  downloadCount = 0,
  className = '',
}: {
  activeTab: string
  setActiveTab: (value: string) => void
  hasActivePlayer?: boolean
  downloadCount?: number
  className?: string
}) {
  const { t } = useTranslation()
  return (
    <nav
      aria-label={t('nav.primary')}
      className={`primary-navigation fixed z-40 bottom-3 left-3 right-3 flex gap-1 rounded-2xl border border-m3-outline/20 bg-m3-surface-container/95 p-1.5 shadow-2xl backdrop-blur-2xl md:static md:w-auto md:shadow-lg ${className}`}
      style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
    >
      {[...baseTabs, ...(hasActivePlayer ? [{ id: 'player', labelKey: 'nav.player', icon: Radio }] : [])].map(({ id, labelKey, icon: Icon }) => {
        const active = activeTab === id
        return (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            aria-current={active ? 'page' : undefined}
            className={`primary-navigation-item min-w-0 flex-1 md:flex-none px-2 md:px-4 py-2 rounded-xl flex flex-col md:flex-row items-center justify-center gap-0.5 md:gap-1.5 text-[11px] md:text-sm font-semibold transition-all ${active ? 'bg-m3-primary text-m3-on-primary shadow-sm' : 'text-m3-on-surface-variant hover:bg-m3-on-surface/10 hover:text-m3-on-surface'} ${id === 'player' && !active ? 'text-m3-primary' : ''}`}
          >
            <span className="relative">
              <Icon aria-hidden="true" size={17} />
              {id === 'player' && <span className="absolute -right-1 -top-1 size-1.5 rounded-full bg-red-400 animate-pulse" />}
              {id === 'downloads' && downloadCount > 0 && <span className="absolute -right-2.5 -top-2 flex min-w-4 h-4 items-center justify-center rounded-full bg-m3-primary px-1 text-[9px] font-black text-m3-on-primary">{downloadCount > 9 ? '9+' : downloadCount}</span>}
            </span>
            <span>{t(labelKey)}</span>
          </button>
        )
      })}
    </nav>
  )
}
