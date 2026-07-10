import { useEffect } from 'react'
import { CheckCircle2, Info, Sparkles, TriangleAlert, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export type AppNotificationKind = 'info' | 'success' | 'warning' | 'easter-egg'

export interface AppNotification {
  id: string
  title: string
  body?: string
  kind: AppNotificationKind
  createdAt: number
  durationMs?: number
}

function NotificationIcon({ kind }: { kind: AppNotificationKind }) {
  if (kind === 'success') return <CheckCircle2 size={18} />
  if (kind === 'warning') return <TriangleAlert size={18} />
  if (kind === 'easter-egg') return <Sparkles size={18} />
  return <Info size={18} />
}

function NotificationToast({ item, onDismiss }: { item: AppNotification; onDismiss: (id: string) => void }) {
  const { t } = useTranslation()
  useEffect(() => {
    const timer = window.setTimeout(() => onDismiss(item.id), item.durationMs ?? 5200)
    return () => window.clearTimeout(timer)
  }, [item.durationMs, item.id, onDismiss])

  return (
    <div className={`app-toast app-toast-${item.kind}`} role="status" aria-live="polite">
      <div className="app-toast-icon"><NotificationIcon kind={item.kind} /></div>
      <div className="min-w-0 flex-1">
        <p className="app-toast-title">{item.title}</p>
        {item.body ? <p className="app-toast-body">{item.body}</p> : null}
      </div>
      <button type="button" className="app-toast-close" onClick={() => onDismiss(item.id)} aria-label={t('notifications.dismiss')}>
        <X size={15} />
      </button>
    </div>
  )
}

export function AppNotifications({ items, onDismiss }: { items: AppNotification[]; onDismiss: (id: string) => void }) {
  const { t } = useTranslation()
  if (!items.length) return null
  return (
    <div className="app-toast-stack" aria-label={t('notifications.label')}>
      {items.map((item) => <NotificationToast key={item.id} item={item} onDismiss={onDismiss} />)}
    </div>
  )
}
