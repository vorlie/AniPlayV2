// Input component - preserves existing input patterns
import { type InputHTMLAttributes, forwardRef } from 'react'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = '', id, ...props }, ref) => {
    const baseStyles = 'w-full rounded-xl border border-m3-outline/25 bg-m3-surface/50 px-4 py-3 outline-none focus:border-m3-primary/60'
    const errorStyles = error ? 'border-red-400/30 focus:border-red-400/50' : ''
    
    return (
      <div className="block">
        {label && (
          <label htmlFor={id} className="block text-sm font-bold mb-2">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={id}
          className={`${baseStyles} ${errorStyles} ${className}`}
          {...props}
        />
        {error && (
          <p className="mt-1 text-xs text-red-300">{error}</p>
        )}
      </div>
    )
  }
)

Input.displayName = 'Input'
