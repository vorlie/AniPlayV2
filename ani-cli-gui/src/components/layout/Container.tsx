// Container component - structural wrapper for content
import { type ReactNode } from 'react'

interface ContainerProps {
  children: ReactNode
  className?: string
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full'
}

export function Container({ children, className = '', size = 'lg' }: ContainerProps) {
  const sizeStyles = {
    sm: 'max-w-md',
    md: 'max-w-lg', 
    lg: 'max-w-4xl',
    xl: 'max-w-6xl',
    full: 'max-w-full'
  }
  
  return (
    <div className={`container mx-auto ${sizeStyles[size]} ${className}`}>
      {children}
    </div>
  )
}

export type { ContainerProps }
