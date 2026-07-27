import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Download, Gauge, HardDrive, Loader2, Magnet, Play, ShieldAlert, Users, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { TorrentFileInfo, TorrentRelease, TorrentSessionState, TorrentSettings } from '../torrent-types'

interface TorrentStream {
  url: string
  resolution: string
  hls: false
  provider: string
  downloadable: false
  torrent: true
}

interface Props {
  open: boolean
  animeName: string
  episode: string
  onClose: () => void
  onInternalPlay: (stream: TorrentStream) => void
}

function bytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0 B'
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB']
  const index = Math.min(units.length - 1, Math.floor(Math.log(value) / Math.log(1024)))
  return `${(value / 1024 ** index).toFixed(index > 1 ? 1 : 0)} ${units[index]}`
}

export function TorrentSourceDialog({ open, animeName, episode, onClose, onInternalPlay }: Props) {
  const { t } = useTranslation()
  const [settings, setSettings] = useState<TorrentSettings | null>(null)
  const [releases, setReleases] = useState<TorrentRelease[]>([])
  const [session, setSession] = useState<TorrentSessionState | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedRelease, setSelectedRelease] = useState<TorrentRelease | null>(null)

  useEffect(() => {
    if (!open || !window.aniPlay) return
    let cancelled = false
    void window.aniPlay.torrent.getSettings().then((nextSettings) => {
      if (cancelled) return
      setSettings(nextSettings)
      if (!nextSettings.privacyAccepted) return
      setLoading(true)
      setError(null)
      return window.aniPlay?.torrent.search(animeName, episode).then((result) => {
        if (cancelled) return
        if (!result.success) throw new Error(result.error || t('torrent.searchFailed'))
        setReleases(result.data ?? [])
        if (!result.data?.length) setError(t('torrent.noResults'))
      })
    }).catch((cause: unknown) => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : t('torrent.searchFailed'))
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    void window.aniPlay.torrent.getState().then(setSession)
    const unsubscribe = window.aniPlay.torrent.onChanged(setSession)
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [animeName, episode, open, t])

  const search = async () => {
    if (!window.aniPlay || loading) return
    setLoading(true)
    setError(null)
    setReleases([])
    try {
      const result = await window.aniPlay.torrent.search(animeName, episode)
      if (!result.success) throw new Error(result.error || t('torrent.searchFailed'))
      setReleases(result.data ?? [])
      if (!result.data?.length) setError(t('torrent.noResults'))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('torrent.searchFailed'))
    } finally {
      setLoading(false)
    }
  }

  const acceptPrivacy = async () => {
    if (!window.aniPlay) return
    const next = await window.aniPlay.torrent.setSettings({ privacyAccepted: true })
    setSettings(next)
    await search()
  }

  const cancel = async () => {
    if (session && !['idle', 'stopped'].includes(session.phase)) await window.aniPlay?.torrent.stop()
    onClose()
  }

  const start = async (release: TorrentRelease) => {
    if (!window.aniPlay) return
    setSelectedRelease(release)
    setLoading(true)
    setError(null)
    try {
      const result = await window.aniPlay.torrent.start({ release, episode })
      if (!result.success || !result.data) throw new Error(result.error || t('torrent.startFailed'))
      setSession(result.data.state)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('torrent.startFailed'))
    } finally {
      setLoading(false)
    }
  }

  const selectFile = async (file: TorrentFileInfo) => {
    if (!window.aniPlay) return
    setLoading(true)
    setError(null)
    try {
      const result = await window.aniPlay.torrent.selectFile(file.index)
      if (!result.success || !result.data) throw new Error(result.error || t('torrent.fileFailed'))
      setSession(result.data)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('torrent.fileFailed'))
    } finally {
      setLoading(false)
    }
  }

  const internalPlay = () => {
    if (!session?.playbackUrl || !session.selectedFile) return
    onInternalPlay({
      url: session.playbackUrl,
      resolution: selectedRelease?.resolution ?? 'Torrent',
      hls: false,
      provider: `Nyaa · ${selectedRelease?.title ?? session.name ?? 'Torrent'}`,
      downloadable: false,
      torrent: true,
    })
    onClose()
  }

  const externalPlay = async () => {
    if (!window.aniPlay) return
    const result = await window.aniPlay.torrent.playExternal(`${animeName} - Episode ${episode}`)
    if (!result.success) setError(result.error || t('torrent.mpvFailed'))
  }

  const candidateFiles = useMemo(() => session?.files ?? [], [session?.files])
  if (!open) return null

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="torrent-dialog-title" onKeyDown={(event) => { if (event.key === 'Escape') void cancel() }}>
      <div className="m3-card flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden border border-m3-outline/20 shadow-2xl">
        <header className="flex items-start gap-3 border-b border-m3-outline/15 p-5">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-m3-primary/10 text-m3-primary"><Magnet size={21}/></span>
          <div className="min-w-0 flex-1">
            <h2 id="torrent-dialog-title" className="truncate text-xl font-black">{t('torrent.title')}</h2>
            <p className="truncate text-sm text-m3-on-surface-variant">{animeName} · {t('downloads.episode', { episode })}</p>
          </div>
          <button type="button" className="icon-button" onClick={() => void cancel()} aria-label={t('torrent.close')}><X size={20}/></button>
        </header>

        <div className="flex-1 overflow-y-auto p-5">
          {!settings?.privacyAccepted ? (
            <section className="mx-auto max-w-2xl rounded-2xl border border-amber-300/25 bg-amber-300/8 p-5">
              <div className="flex gap-3"><ShieldAlert className="shrink-0 text-amber-300" size={24}/><div><h3 className="font-black">{t('torrent.privacyTitle')}</h3><p className="mt-2 text-sm leading-6 text-m3-on-surface-variant">{t('torrent.privacyBody')}</p></div></div>
              <button type="button" className="mt-5 rounded-full bg-m3-primary px-5 py-2.5 text-sm font-black text-m3-on-primary" onClick={() => void acceptPrivacy()}>{t('torrent.accept')}</button>
            </section>
          ) : (
            <>
              {error ? <div role="alert" className="mb-4 flex items-start gap-2 rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-sm text-red-200"><AlertTriangle size={17} className="mt-0.5 shrink-0"/><span>{error}</span></div> : null}

              {session && session.phase !== 'idle' && session.phase !== 'stopped' ? (
                <div className="mb-4 grid grid-cols-2 gap-2 rounded-2xl border border-m3-outline/15 bg-m3-surface/40 p-3 text-xs sm:grid-cols-4">
                  <span className="flex items-center gap-2"><Users size={14}/>{session.peers} {t('torrent.peers')}</span>
                  <span className="flex items-center gap-2"><Download size={14}/>{bytes(session.downloadSpeed)}/s</span>
                  <span className="flex items-center gap-2"><Gauge size={14}/>{Math.round(session.progress * 100)}%</span>
                  <span className="flex items-center gap-2"><HardDrive size={14}/>{bytes(session.downloadedBytes)}</span>
                </div>
              ) : null}

              {session?.phase === 'selecting' && candidateFiles.length > 1 ? (
                <section>
                  <h3 className="mb-3 font-black">{t('torrent.chooseFile')}</h3>
                  <div className="space-y-2">
                    {candidateFiles.map((file) => <button key={file.index} type="button" onClick={() => void selectFile(file)} className="flex w-full items-center justify-between gap-3 rounded-xl border border-m3-outline/15 p-3 text-left hover:border-m3-primary/50"><span className="min-w-0"><strong className="block truncate text-sm">{file.name}</strong><span className="text-xs text-m3-on-surface-variant">{file.episode ? `${t('downloads.episode', { episode: file.episode })} · ` : ''}{bytes(file.sizeBytes)}</span></span><Play size={16}/></button>)}
                  </div>
                </section>
              ) : session?.playbackUrl && session.selectedFile ? (
                <section className="rounded-2xl border border-emerald-400/20 bg-emerald-400/8 p-4">
                  <div className="flex gap-3"><CheckCircle2 className="shrink-0 text-emerald-300" size={21}/><div className="min-w-0"><h3 className="font-black">{t('torrent.ready')}</h3><p className="truncate text-sm text-m3-on-surface-variant">{session.selectedFile.name}</p></div></div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {session.selectedFile.playableInternally ? <button type="button" onClick={internalPlay} className="rounded-full bg-m3-primary px-4 py-2 text-sm font-black text-m3-on-primary"><Play size={15} className="mr-1.5 inline"/>{t('torrent.playInAniPlay')}</button> : null}
                    <button type="button" onClick={() => void externalPlay()} className="rounded-full border border-m3-outline/30 px-4 py-2 text-sm font-black"><Play size={15} className="mr-1.5 inline"/>{t('torrent.playInMpv')}</button>
                  </div>
                </section>
              ) : (
                <section>
                  <div className="mb-3 flex items-center justify-between gap-3"><h3 className="font-black">{t('torrent.releases')}</h3><button type="button" onClick={() => void search()} disabled={loading} className="text-xs font-black text-m3-primary">{t('torrent.refresh')}</button></div>
                  {loading ? <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-m3-on-surface-variant"><Loader2 className="animate-spin" size={20}/>{session?.phase === 'metadata' ? t('torrent.metadata') : t('torrent.searching')}</div> : (
                    <div className="space-y-2">
                      {releases.map((release) => <button key={release.id} type="button" onClick={() => void start(release)} className="w-full rounded-xl border border-m3-outline/15 p-3 text-left hover:border-m3-primary/50">
                        <strong className="line-clamp-2 text-sm">{release.title}</strong>
                        <span className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-m3-on-surface-variant">
                          <span>{release.size}</span><span>{release.seeders} {t('torrent.seeders')}</span>{release.resolution ? <span>{release.resolution}</span> : null}{release.codec ? <span>{release.codec}</span> : null}{release.trusted ? <span className="text-emerald-300">{t('torrent.trusted')}</span> : null}{release.batch ? <span>{t('torrent.batch')}</span> : null}
                        </span>
                      </button>)}
                    </div>
                  )}
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
