// Tabs component - preserves existing tab patterns
import { type ReactNode } from 'react'

interface TabItem {
  id: string
  label: string
  content?: ReactNode
}

interface TabsProps {
  items: TabItem[]
  activeId: string
  onChange: (id: string) => void
  label?: string
  variant?: 'default' | 'pill'
}

export function Tabs({ items, activeId, onChange, label, variant = 'default' }: TabsProps) {
  const containerStyles = variant === 'pill'
    ? 'flex max-w-full gap-1 overflow-x-auto rounded-[22px] border border-m3-outline/15 bg-m3-surface-container/45 p-1.5'
    : 'flex max-w-full gap-1 overflow-x-auto'
  
  const buttonStyles = variant === 'pill'
    ? (active: boolean) => `flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold transition-colors ${active ? 'bg-m3-primary text-m3-on-primary shadow-[0_8px_18px_rgba(208,188,255,0.25)]' : 'text-m3-on-surface-variant hover:bg-m3-on-surface/10 hover:text-m3-on-surface'}`
    : (active: boolean) => `whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold ${active ? 'bg-m3-primary text-m3-on-primary' : 'text-m3-on-surface-variant hover:bg-m3-on-surface/10'}`

  return (
    <div role="tablist" aria-label={label} className={containerStyles}>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={activeId === item.id}
          onClick={() => onChange(item.id)}
          className={buttonStyles(activeId === item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}
