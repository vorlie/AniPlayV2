import { AlertCircle, CheckCircle2, Download, FolderOpen, Loader2, RefreshCw, Trash2, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { DownloadJob, DownloadState } from '../download-types'

const ACTIVE = new Set(['queued', 'resolving', 'downloading'])

function statusLabel(job: DownloadJob, t: ReturnType<typeof useTranslation>['t']): string {
  if (job.status === 'queued') return t('downloads.statuses.queued')
  if (job.status === 'resolving') return t('downloads.statuses.resolving')
  if (job.status === 'downloading') return job.progress.percent == null ? t('downloads.statuses.downloading') : `${Math.round(job.progress.percent)}%`
  return t(`downloads.statuses.${job.status}`, job.status.charAt(0).toUpperCase() + job.status.slice(1))
}

export function DownloadsPage({ state }: { state: DownloadState | null }) {
  const { t } = useTranslation()
  const jobs = state?.jobs ?? []
  const activeCount = jobs.filter((job) => ACTIVE.has(job.status)).length
  const queuedIds = jobs.filter((job) => job.status === 'queued').sort((a, b) => a.createdAt - b.createdAt).map((job) => job.id)
  const invoke = (action: Promise<unknown>) => { void action }

  return (
    <div className="flex-1 flex flex-col gap-4">
      <section className="m3-card p-5 md:p-7 flex items-start justify-between gap-4">
        <div>
          <p className="section-label"><Download size={14} /> {t('downloads.label')}</p>
          <h2 className="mt-2 text-3xl font-black tracking-tight">{t('downloads.heading')}</h2>
          <p className="mt-1 text-sm text-m3-on-surface-variant">{activeCount ? t('downloads.activeQueued', { count: activeCount }) : t('downloads.noActive')} · {state?.settings.directory ?? t('downloads.loadingFolder')}</p>
        </div>
        <button type="button" onClick={() => window.aniPlay && invoke(window.aniPlay.downloads.clearFinished())} className="icon-button" title={t('downloads.clearFinished')}>
          <Trash2 size={18} />
        </button>
      </section>

      {state && !state.ffmpegAvailable && (
        <div role="alert" className="rounded-2xl border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-200 flex gap-3">
          <AlertCircle size={19} className="shrink-0" />
          <div><p className="font-bold">{t('downloads.ffmpegUnavailable')}</p><p className="mt-1 opacity-80">{state.ffmpegError}</p></div>
        </div>
      )}

      <section className="m3-card p-4 md:p-6 flex-1 min-h-[320px]">
        {jobs.length === 0 ? (
          <div className="min-h-[280px] flex flex-col items-center justify-center text-center">
            <span className="flex size-16 items-center justify-center rounded-2xl bg-m3-primary/10 text-m3-primary"><Download size={28} /></span>
            <p className="mt-4 font-bold">{t('downloads.emptyTitle')}</p>
            <p className="mt-1 max-w-md text-sm text-m3-on-surface-variant">{t('downloads.emptyBody')}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {jobs.map((job) => {
              const active = ACTIVE.has(job.status)
              const canRetry = ['failed', 'cancelled', 'interrupted'].includes(job.status)
              return (
                <article key={job.id} className="rounded-2xl border border-m3-outline/15 bg-m3-surface/35 p-4">
                  <div className="flex items-start gap-3">
                    <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${job.status === 'completed' ? 'bg-green-400/10 text-green-400' : job.status === 'failed' ? 'bg-red-400/10 text-red-300' : 'bg-m3-primary/10 text-m3-primary'}`}>
                      {job.status === 'completed' ? <CheckCircle2 size={20} /> : active ? <Loader2 className={job.status !== 'queued' ? 'animate-spin' : ''} size={20} /> : <AlertCircle size={20} />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="truncate font-bold">{job.request.animeName} · {t('downloads.episode', { episode: job.request.episode })}</h3>
                          <p className="mt-0.5 text-xs text-m3-on-surface-variant">{job.request.provider} · {job.request.resolution} · {job.request.translationType.toUpperCase()}{job.status === 'queued' ? ` · ${t('downloads.queue', { position: queuedIds.indexOf(job.id) + 1 })}` : ''}</p>
                        </div>
                        <span className="text-xs font-bold text-m3-primary">{statusLabel(job, t)}</span>
                      </div>
                      {job.status === 'downloading' && (
                        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-m3-surface-variant/30">
                          <div className={`h-full rounded-full bg-m3-primary transition-all ${job.progress.percent == null ? 'w-1/3 animate-pulse' : ''}`} style={job.progress.percent == null ? undefined : { width: `${job.progress.percent}%` }} />
                        </div>
                      )}
                      {job.error && <p className="mt-2 text-xs text-red-300">{job.error}</p>}
                      {job.fileName && <p className="mt-2 truncate text-xs text-m3-on-surface-variant/70">{job.fileName}</p>}
                    </div>
                    <div className="flex shrink-0 gap-1">
                      {active && <button type="button" className="icon-button !size-9" title={t('downloads.cancel')} onClick={() => window.aniPlay && invoke(window.aniPlay.downloads.cancel(job.id))}><X size={16} /></button>}
                      {canRetry && <button type="button" className="icon-button !size-9" title={t('downloads.retry')} onClick={() => window.aniPlay && invoke(window.aniPlay.downloads.retry(job.id))}><RefreshCw size={16} /></button>}
                      {job.status === 'completed' && <button type="button" className="icon-button !size-9" title={t('downloads.showInFolder')} onClick={() => window.aniPlay && invoke(window.aniPlay.downloads.reveal(job.id))}><FolderOpen size={16} /></button>}
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
