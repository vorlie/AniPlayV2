// Modal component - preserves existing dialog patterns
import { type ReactNode, useEffect } from 'react'
import { X } from 'lucide-react'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  size?: 'sm' | 'md' | 'lg'
}

export function Modal({ isOpen, onClose, title, children, size = 'md' }: ModalProps) {
  useEffect(() => {
    if (!isOpen) return
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const sizeClass = size === 'sm' ? 'max-w-md' : size === 'lg' ? 'max-w-2xl' : 'max-w-lg'

  return (
    <div
      className="fixed inset-0 z-80 flex items-center justify-center bg-black/70 p-4"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className={`m3-card w-full max-h-[88vh] flex flex-col overflow-hidden shadow-2xl ${sizeClass}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'modal-title' : undefined}
      >
        {title && (
          <header className="flex items-start justify-between gap-4 border-b border-m3-outline/10 p-5">
            <h2 id="modal-title" className="text-xl font-black">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              className="icon-button"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </header>
        )}
        <div className="overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  )
}
