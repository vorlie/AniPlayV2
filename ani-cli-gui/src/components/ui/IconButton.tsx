// IconButton component - preserves existing icon-button pattern
import { type ButtonHTMLAttributes, forwardRef } from 'react'
import { type LucideIcon } from 'lucide-react'

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon
  size?: number
  label?: string
  iconClassName?: string
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ icon: Icon, size = 18, label, className = '', iconClassName = '', ...props }, ref) => {
    return (
      <button
        ref={ref}
        type="button"
        className={`icon-button ${className}`}
        aria-label={label}
        {...props}
      >
        <Icon size={size} className={iconClassName} />
      </button>
    )
  }
)

IconButton.displayName = 'IconButton'
