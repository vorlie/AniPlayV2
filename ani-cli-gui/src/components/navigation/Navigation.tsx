import {
  Search,
  History,
  Settings,
  Radio,
  Download,
  UserRound,
  type LucideIcon,
} from 'lucide-react'
import type { CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'

const baseTabs: Array<{
  id: string
  labelKey: string
  icon: LucideIcon
}> = [
  { id: 'anilist', labelKey: 'nav.anilist', icon: UserRound },
  { id: 'search', labelKey: 'nav.search', icon: Search },
  { id: 'history', labelKey: 'nav.history', icon: History },
  { id: 'downloads', labelKey: 'nav.downloads', icon: Download },
  { id: 'settings', labelKey: 'nav.settings', icon: Settings },
]

interface NavigationProps {
  activeTab: string
  setActiveTab: (value: string) => void
  hasActivePlayer?: boolean
  downloadCount?: number
  className?: string
}

export function Navigation({
  activeTab,
  setActiveTab,
  hasActivePlayer = false,
  downloadCount = 0,
  className = '',
}: NavigationProps) {
  const { t } = useTranslation()

  const tabs = [
    ...baseTabs,
    ...(hasActivePlayer
      ? [
          {
            id: 'player',
            labelKey: 'nav.player',
            icon: Radio,
          },
        ]
      : []),
  ]

  return (
    <nav
      aria-label={t('nav.primary')}
      className={`
        flex
        items-center
        justify-center
        gap-1
        rounded-2xl
        px-2
        py-1
        ${className}
      `}
      style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
    >
      {tabs.map(({ id, labelKey, icon: Icon }) => {
        const active = activeTab === id

        return (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            aria-current={active ? 'page' : undefined}
            className={`
              group
              relative
              isolate
              flex
              items-center
              gap-2
              rounded-xl
              px-4
              py-2.5
              text-sm
              font-semibold
              transition-all
              duration-200

              ${
                active
                  ? 'bg-m3-primary/10 text-m3-primary shadow-[inset_0_0_0_1px_rgba(208,188,255,0.18)]'
                  : 'text-m3-on-surface-variant hover:text-m3-on-surface hover:bg-white/5'
              }

              ${id === 'player' && !active ? 'text-m3-primary' : ''}
            `}
          >
            {/* Icon */}
            <span className="relative flex items-center justify-center">
              <Icon
                size={18}
                className={`transition-transform duration-200 ${
                  active ? 'scale-110' : 'group-hover:scale-105'
                }`}
              />

              {/* Player indicator */}
              {id === 'player' && (
                <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-red-400 animate-pulse" />
              )}

              {/* Downloads badge */}
              {id === 'downloads' && downloadCount > 0 && (
                <span className="absolute -right-3 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-m3-primary px-1 text-[9px] font-black text-black shadow-lg">
                  {downloadCount > 9 ? '9+' : downloadCount}
                </span>
              )}
            </span>

            {/* Label */}
            <span className="relative whitespace-nowrap">
              {t(labelKey)}
            </span>

            {/* Active underline */}
            <span
              className={`
                absolute
                bottom-0
                left-3
                right-3
                h-[2px]
                rounded-full
                transition-all
                duration-300

                ${
                  active
                    ? 'opacity-100 bg-m3-primary nav-active-line'
                    : 'opacity-0 group-hover:opacity-40 bg-white'
                }
              `}
            />
          </button>
        )
      })}
    </nav>
  )
}
