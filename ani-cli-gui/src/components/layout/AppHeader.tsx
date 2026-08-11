// AppHeader component - AniPlay application header with window controls
import { type CSSProperties, type ReactNode } from 'react'
import { type LucideIcon, ChevronRight } from 'lucide-react'

interface WindowControl {
  icon: LucideIcon
  label: string
  onClick: () => void
}

interface BreadcrumbItem {
  label: string
  active?: boolean
}

interface AppHeaderProps {
  title?: string
  logo?: ReactNode
  rightContent?: ReactNode
  windowControls?: WindowControl[]
  breadcrumbs?: BreadcrumbItem[]
  className?: string
}

export function AppHeader({ title, logo, rightContent, windowControls, breadcrumbs, className = '' }: AppHeaderProps) {
  return (
    <header 
      className={`app-header ${className}`} 
      style={{ WebkitAppRegion: "drag" } as CSSProperties}
      onDoubleClick={() => windowControls?.find(c => c.label === 'Maximize')?.onClick?.()}
    >
      <div className="app-header-left">
        {windowControls && (
          <div className="window-controls" style={{ WebkitAppRegion: "no-drag" } as CSSProperties}>
            {windowControls.map((control, index) => (
              <button
                key={index}
                type="button"
                onClick={control.onClick}
                aria-label={control.label}
                className="window-control"
              >
                <control.icon size={12} />
              </button>
            ))}
          </div>
        )}
        {logo && <div className="app-logo">{logo}</div>}
        {title && <h1 className="app-title">{title}</h1>}
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav className="app-header-breadcrumbs" aria-label="Breadcrumb">
            {breadcrumbs.map((item, index) => (
              <div key={index} className="flex items-center gap-1">
                {index > 0 && <ChevronRight size={12} className="text-[var(--text-dim)]" />}
                <span className={`text-xs ${item.active ? 'font-bold text-[var(--text)]' : 'text-[var(--text-secondary)]'}`}>
                  {item.label}
                </span>
              </div>
            ))}
          </nav>
        )}
      </div>
      {rightContent && <div className="app-header-right" style={{ WebkitAppRegion: "no-drag" } as CSSProperties}>{rightContent}</div>}
    </header>
  )
}

export type { AppHeaderProps, WindowControl, BreadcrumbItem }
