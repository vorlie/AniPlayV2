// Button component - preserves existing button patterns
import { type ReactNode, type ButtonHTMLAttributes, forwardRef } from 'react'
import { Loader2 } from 'lucide-react'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  children: ReactNode
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'secondary', size = 'md', loading = false, children, className = '', disabled, ...props }, ref) => {
    const baseStyles = 'inline-flex items-center justify-center font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed'
    
    const variantStyles = {
      primary: 'primary-action',
      secondary: 'rounded-xl border border-m3-outline/25 bg-m3-surface-container/80 text-m3-on-surface hover:bg-m3-on-surface/10'
    }
    
    const sizeStyles = {
      sm: 'px-3 py-1.5 text-xs',
      md: 'px-4 py-2 text-sm',
      lg: 'px-5 py-3 text-base'
    }
    
    return (
      <button
        ref={ref}
        className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
        disabled={disabled || loading}
        {...props}
      >
        {loading && <Loader2 className="animate-spin mr-2" size={16} />}
        {children}
      </button>
    )
  }
)

Button.displayName = 'Button'
