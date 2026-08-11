// Card component - preserves existing m3-card pattern
import { type ReactNode } from 'react'

interface CardProps {
  children: ReactNode
  className?: string
  variant?: 'default' | 'hover'
}

export function Card({ children, className = '', variant = 'default' }: CardProps) {
  const baseStyles = 'm3-card'
  const variantStyles = variant === 'hover' 
    ? 'group transition-all hover:-translate-y-0.5 hover:border-m3-primary/30'
    : ''
  
  return (
    <div className={`${baseStyles} ${variantStyles} ${className}`}>
      {children}
    </div>
  )
}
