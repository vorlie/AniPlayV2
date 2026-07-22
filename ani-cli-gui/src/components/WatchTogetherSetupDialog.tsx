import { useEffect, useState } from 'react'
import { Sparkles, Users, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { CatalogProvider } from '../catalog-types'
import type { WatchTogetherCreateContext } from '../watch-together-types'
import { useWatchTogether } from '../contexts/WatchTogetherContext'

interface WatchTogetherSetupDialogProps {
  anime?: { id: string; name: string; episodes: number; aniListMediaId?: number; coverUrl?: string; catalogProvider: CatalogProvider }
  context: WatchTogetherCreateContext | null
  isOpen: boolean
  onOpenChange: (next: boolean) => void
}

export function WatchTogetherSetupDialog({ anime, context, isOpen, onOpenChange }: WatchTogetherSetupDialogProps) {
  const { t } = useTranslation()
  const { inviteCode, clearInvite, createRoom, joinRoom } = useWatchTogether()
  const [joinCode, setJoinCode] = useState(inviteCode ?? '')
  const [configAvailable, setConfigAvailable] = useState(false)
  const [configMessage, setConfigMessage] = useState<string | null>(null)
  const [authenticated, setAuthenticated] = useState(false)
  const [isBusy, setIsBusy] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const canCreate = Boolean(context?.controllable && configAvailable && authenticated && window.aniPlay?.watchTogether)

  useEffect(() => {
    if (!isOpen || !window.aniPlay?.watchTogether) return
    void window.aniPlay.watchTogether.getConfig().then((config) => {
      setConfigAvailable(config.available)
      setConfigMessage(config.message)
    }).catch(() => setConfigMessage(t('watchTogether.unavailable')))
    void window.aniPlay.aniList.auth.status().then((session) => setAuthenticated(session.authenticated)).catch(() => setAuthenticated(false))
  }, [isOpen, t])

  useEffect(() => {
    if (!isOpen) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onOpenChange(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [isOpen, onOpenChange])

  const close = () => {
    clearInvite()
    onOpenChange(false)
  }

  const handleCreate = async () => {
    if (!context) return
    setIsBusy(true)
    setErrorMessage(null)
    try {
      await createRoom({ content: context.content, playback: context.playback })
      close()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t('watchTogether.createFailed'))
    } finally {
      setIsBusy(false)
    }
  }

  const handleJoin = async () => {
    setIsBusy(true)
    setErrorMessage(null)
    try {
      await joinRoom({ code: joinCode })
      close()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t('watchTogether.joinFailed'))
    } finally {
      setIsBusy(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:p-4 md:items-center" onMouseDown={(event) => { if (event.target === event.currentTarget) close() }}>
      <section role="dialog" aria-modal="true" aria-labelledby="watch-together-setup-title" className="flex max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden rounded-t-[28px] border border-m3-outline/20 bg-m3-surface-container shadow-2xl sm:rounded-[28px]">
        <header className="flex items-center justify-between gap-4 border-b border-m3-outline/15 px-5 py-4 sm:px-6">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.24em] text-m3-primary">{t('watchTogether.title')}</p>
            <h3 id="watch-together-setup-title" className="mt-1 text-xl font-black sm:text-2xl">{t('watchTogether.setupTitle')}</h3>
          </div>
          <button type="button" className="icon-button shrink-0" onClick={close} aria-label={t('watchTogether.closePanel')}><X size={20} /></button>
        </header>

        <div className="overflow-y-auto p-4 sm:p-6">
          {errorMessage ? <div role="alert" className="mb-4 rounded-2xl border border-red-400/25 bg-red-400/10 px-4 py-3 text-sm text-red-200">{errorMessage}</div> : null}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex min-h-56 flex-col rounded-3xl border border-m3-outline/15 bg-m3-surface/55 p-5">
              <div className="flex size-10 items-center justify-center rounded-2xl bg-m3-primary/15 text-m3-primary"><Sparkles size={20} /></div>
              <h4 className="mt-4 text-lg font-black">{anime ? t('watchTogether.roomFor', { name: anime.name }) : t('watchTogether.createRoom')}</h4>
              <p className="mt-2 text-sm leading-6 text-m3-on-surface-variant">{t('watchTogether.createHint')}</p>
              {!authenticated ? <p className="mt-3 text-sm text-amber-200">{t('watchTogether.signInRequired')}</p> : null}
              {context && !context.controllable ? <p className="mt-3 text-sm text-amber-200">{t('watchTogether.directSourceRequired')}</p> : null}
              {configMessage ? <p className="mt-3 text-sm text-m3-on-surface-variant">{configMessage}</p> : null}
              <button type="button" disabled={!canCreate || isBusy} onClick={() => void handleCreate()} className="mt-auto w-full rounded-full bg-m3-primary px-4 py-3 text-sm font-black text-m3-on-primary transition-transform enabled:hover:scale-[1.01] disabled:opacity-50">
                {isBusy ? t('watchTogether.working') : t('watchTogether.createRoom')}
              </button>
            </div>

            <div className="flex min-h-56 flex-col rounded-3xl border border-m3-outline/15 bg-m3-surface/55 p-5">
              <div className="flex size-10 items-center justify-center rounded-2xl bg-m3-secondary/15 text-m3-secondary"><Users size={20} /></div>
              <h4 className="mt-4 text-lg font-black">{t('watchTogether.joinTitle')}</h4>
              <p className="mt-2 text-sm leading-6 text-m3-on-surface-variant">{t('watchTogether.joinHint')}</p>
              <label className="mt-auto block">
                <span className="sr-only">{t('watchTogether.codePlaceholder')}</span>
                <input value={joinCode} onChange={(event) => setJoinCode(event.target.value.toUpperCase().replace(/[^0-9A-HJKMNP-TV-Z]/g, ''))} onKeyDown={(event) => { if (event.key === 'Enter' && authenticated && !isBusy && joinCode.length === 10) void handleJoin() }} placeholder={t('watchTogether.codePlaceholder')} maxLength={10} autoFocus={Boolean(inviteCode)} className="w-full rounded-2xl border border-m3-outline/25 bg-m3-surface px-4 py-3 text-center font-mono text-lg font-black uppercase tracking-[0.2em] outline-none transition-colors focus:border-m3-primary" />
              </label>
              <button type="button" disabled={isBusy || !authenticated || joinCode.length !== 10} onClick={() => void handleJoin()} className="mt-3 w-full rounded-full bg-m3-secondary px-4 py-3 text-sm font-black text-m3-on-secondary transition-transform enabled:hover:scale-[1.01] disabled:opacity-50">{t('watchTogether.joinRoom')}</button>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
