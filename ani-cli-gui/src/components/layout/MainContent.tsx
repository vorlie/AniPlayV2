// MainContent component - for future layout redesign
// This component is prepared for main content area wrapper but not currently implemented in the UI

import { type ReactNode } from 'react'

interface MainContentProps {
  children: ReactNode
  className?: string
  scrollable?: boolean
}

export function MainContent({ children, className = '', scrollable = true }: MainContentProps) {
  return (
    <main className={`main-content ${scrollable ? 'main-content-scrollable' : ''} ${className}`}>
      {children}
    </main>
  )
}

export type { MainContentProps }
