// Sidebar component - AniPlay navigation sidebar
import { type LucideIcon } from 'lucide-react'

interface SidebarItem {
  id: string
  label: string
  icon: LucideIcon
  badge?: number
}

interface SidebarProps {
  items: SidebarItem[]
  activeId: string
  onItemClick: (id: string) => void
  className?: string
}

export function Sidebar({ items, activeId, onItemClick, className = '' }: SidebarProps) {
  return (
    <aside className={`sidebar ${className}`}>
      <nav aria-label="Main navigation">
        <ul className="sidebar-nav">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onItemClick(item.id)}
                aria-current={activeId === item.id ? 'page' : undefined}
                className={`sidebar-item ${activeId === item.id ? 'sidebar-item-active' : ''}`}
              >
                <item.icon size={18} />
                <span>{item.label}</span>
                {item.badge && <span className="sidebar-badge">{item.badge}</span>}
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  )
}

export type { SidebarItem, SidebarProps }
