// Layout component - implements the new AniPlay application shell
import { type ReactNode } from 'react'
import { Sidebar, type SidebarProps } from './Sidebar'
import { AppHeader, type WindowControl, type BreadcrumbItem } from './AppHeader'
import { MainContent } from './MainContent'

interface LayoutProps {
  children: ReactNode
  sidebar?: SidebarProps
  header?: {
    title?: string
    logo?: ReactNode
    rightContent?: ReactNode
    windowControls?: WindowControl[]
    breadcrumbs?: BreadcrumbItem[]
  }
  className?: string
}

export function Layout({ children, sidebar, header, className = '' }: LayoutProps) {
  return (
    <div className={`layout ${className}`}>
      <div className="app-background" />
      <div className="app-background-overlay" />
      {header && (
        <AppHeader
          title={header.title}
          logo={header.logo}
          rightContent={header.rightContent}
          windowControls={header.windowControls}
          breadcrumbs={header.breadcrumbs}
        />
      )}
      <div className="layout-body">
        {sidebar && <Sidebar {...sidebar} />}
        <MainContent>{children}</MainContent>
      </div>
    </div>
  )
}

export type { LayoutProps }
