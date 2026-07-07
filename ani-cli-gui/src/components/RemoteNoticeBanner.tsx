import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ExternalLink, Info, RefreshCw, ShieldAlert, X } from 'lucide-react'
import type { CatalogProvider } from '../catalog-types'
import type { RemoteNotice, RemoteNoticeState } from '../remote-notice-types'

interface RemoteNoticeBannerProps {
  provider?: CatalogProvider
}

const emptyState: RemoteNoticeState = { notices: [], stale: false }

function noticeClasses(notice: RemoteNotice): string {
  if (notice.severity === 'critical') return 'border-red-400/30 bg-red-500/12 text-red-100'
  if (notice.severity === 'warning') return 'border-amber-300/30 bg-amber-500/12 text-amber-100'
  if (notice.severity === 'update') return 'border-m3-primary/30 bg-m3-primary/10 text-m3-on-surface'
  return 'border-sky-300/30 bg-sky-500/10 text-sky-100'
}

function NoticeIcon({ notice }: { notice: RemoteNotice }) {
  const className = 'mt-0.5 size-5 shrink-0'
  if (notice.severity === 'critical') return <ShieldAlert className={className} aria-hidden="true" />
  if (notice.severity === 'warning') return <AlertTriangle className={className} aria-hidden="true" />
  return <Info className={className} aria-hidden="true" />
}

export function RemoteNoticeBanner({ provider }: RemoteNoticeBannerProps) {
  const [state, setState] = useState<RemoteNoticeState>(emptyState)

  useEffect(() => {
    if (!window.aniPlay?.notices) return
    void window.aniPlay.notices.getState().then(setState)
    return window.aniPlay.notices.onChanged(setState)
  }, [])

  const notices = useMemo(() => {
    return state.notices.filter((notice) => !provider || !notice.providers?.length || notice.providers.includes(provider))
  }, [provider, state.notices])

  if (!notices.length) return null

  return (
    <section className="flex flex-col gap-2" aria-label="Service notices">
      {notices.map((notice) => (
        <article key={notice.id} role="status" className={`rounded-2xl border px-4 py-3 shadow-sm backdrop-blur-xl ${noticeClasses(notice)}`}>
          <div className="flex items-start gap-3">
            <NoticeIcon notice={notice} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-sm font-black">{notice.title}</h2>
                {notice.providers?.length ? <span className="text-[0.68rem] font-black uppercase tracking-[0.16em] opacity-75">{notice.providers.join(', ')}</span> : null}
              </div>
              <p className="mt-1 text-sm leading-6 opacity-90">{notice.message}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {notice.link ? (
                  <button type="button" className="inline-flex items-center gap-1.5 rounded-full border border-current/20 px-3 py-1 text-xs font-bold transition-colors hover:bg-white/10" onClick={() => void window.aniPlay?.notices.open(notice.id)}>
                    View details <ExternalLink size={13} aria-hidden="true" />
                  </button>
                ) : null}
                {state.stale ? (
                  <button type="button" className="inline-flex items-center gap-1.5 rounded-full border border-current/20 px-3 py-1 text-xs font-bold transition-colors hover:bg-white/10" onClick={() => void window.aniPlay?.notices.refresh().then(setState)}>
                    Retry check <RefreshCw size={13} aria-hidden="true" />
                  </button>
                ) : null}
              </div>
            </div>
            {notice.dismissible ? (
              <button type="button" className="inline-flex size-8 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-white/10" aria-label={`Dismiss ${notice.title}`} onClick={() => void window.aniPlay?.notices.dismiss(notice.id).then(setState)}>
                <X size={16} aria-hidden="true" />
              </button>
            ) : null}
          </div>
        </article>
      ))}
    </section>
  )
}
