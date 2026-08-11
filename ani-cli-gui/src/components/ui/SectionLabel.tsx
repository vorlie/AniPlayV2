// SectionLabel component - preserves existing section-label pattern
import { type ReactNode } from 'react'
import { type LucideIcon } from 'lucide-react'

interface SectionLabelProps {
  children: ReactNode
  icon?: LucideIcon
}

export function SectionLabel({ children, icon: Icon }: SectionLabelProps) {
  return (
    <p className="section-label">
      {Icon && <Icon size={13} />} {children}
    </p>
  )
}
