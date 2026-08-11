// Badge component - preserves existing badge patterns
import { type ReactNode } from 'react'

interface BadgeProps {
  children: ReactNode
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'error'
  size?: 'sm' | 'md'
}

export function Badge({ children, variant = 'default', size = 'md' }: BadgeProps) {
  const variantStyles = {
    default: 'bg-m3-on-surface/8 text-m3-on-surface-variant',
    primary: 'bg-m3-primary/10 text-m3-primary',
    success: 'bg-green-400/10 text-green-400',
    warning: 'bg-amber-400/10 text-amber-300',
    error: 'bg-red-400/10 text-red-300'
  }
  
  const sizeStyles = {
    sm: 'px-1.5 py-0.5 text-[10px]',
    md: 'px-2.5 py-1 text-xs'
  }
  
  return (
    <span className={`rounded-full font-bold uppercase tracking-wider ${variantStyles[variant]} ${sizeStyles[size]}`}>
      {children}
    </span>
  )
}
