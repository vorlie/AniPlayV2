import { useEffect, useRef, useState } from 'react'
import { Check, Copy, Crown, LogOut, MessagesSquare, RefreshCw, Send, Sparkles, Users, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { CatalogProvider } from '../catalog-types'
import type { WatchTogetherCreateContext, WatchTogetherState } from '../watch-together-types'

interface WatchTogetherPanelProps {
  anime?: { id: string; name: string; episodes: number; aniListMediaId?: number; coverUrl?: string; catalogProvider: CatalogProvider }
  context: WatchTogetherCreateContext | null
  inviteCode?: string | null
  isOpen: boolean
  onOpenChange: (next: boolean) => void
}

export function WatchTogetherPanel({ anime, context, inviteCode, isOpen, onOpenChange }: WatchTogetherPanelProps) {
  const { t } = useTranslation()
  const [joinCode, setJoinCode] = useState(inviteCode ?? '')
  const [chatDraft, setChatDraft] = useState('')
  const [state, setState] = useState<WatchTogetherState | null>(null)
  const [configAvailable, setConfigAvailable] = useState(false)
  const [configMessage, setConfigMessage] = useState<string | null>(null)
  const [authenticated, setAuthenticated] = useState(false)
  const [isBusy, setIsBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)

  const canCreate = Boolean(context?.controllable && configAvailable && authenticated && window.aniPlay?.watchTogether)

  useEffect(() => {
    if (!isOpen || !window.aniPlay?.watchTogether) return
    void window.aniPlay.watchTogether.getConfig().then((config) => {
      setConfigAvailable(config.available)
      setConfigMessage(config.message)
    }).catch(() => setConfigMessage(t('watchTogether.unavailable')))
    void window.aniPlay.watchTogether.getState().then(setState).catch(() => {})
    void window.aniPlay.aniList.auth.status().then((session) => setAuthenticated(session.authenticated)).catch(() => setAuthenticated(false))
    return window.aniPlay.watchTogether.onChanged(setState)
  }, [isOpen, t])

  useEffect(() => {
    if (!isOpen) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onOpenChange(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [isOpen, onOpenChange])

  useEffect(() => {
    if (!isOpen || !state?.chat.length) return
    chatEndRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' })
  }, [isOpen, state?.chat.length])

  const headerTitle = state?.code ? t('watchTogether.roomTitle', { code: state.code }) : t('watchTogether.title')
  const connectedRoom = Boolean(state?.code)
  const readyParticipants = state?.participants.filter((participant) => participant.ready).length ?? 0
  const statusLabel = state?.status ? t(`watchTogether.status.${state.status}`) : ''

  const handleCreate = async () => {
    if (!context || !window.aniPlay?.watchTogether) return
    setIsBusy(true)
    setErrorMessage(null)
    try {
      setState(await window.aniPlay.watchTogether.create({ content: context.content, playback: context.playback }))
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t('watchTogether.createFailed'))
    } finally {
      setIsBusy(false)
    }
  }

  const handleJoin = async () => {
    if (!window.aniPlay?.watchTogether) return
    setIsBusy(true)
    setErrorMessage(null)
    try {
      setState(await window.aniPlay.watchTogether.join({ code: joinCode }))
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t('watchTogether.joinFailed'))
    } finally {
      setIsBusy(false)
    }
  }

  const handleLeave = async () => {
    try {
      await window.aniPlay?.watchTogether.leave()
      setState(null)
    } catch {
      // Local state will be updated by the service if the connection is already gone.
    }
  }

  const handleReconnect = async () => {
    setIsBusy(true)
    setErrorMessage(null)
    try {
      setState(await window.aniPlay?.watchTogether.reconnect() ?? null)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t('watchTogether.unavailable'))
    } finally {
      setIsBusy(false)
    }
  }

  const handleSendChat = async () => {
    if (!chatDraft.trim()) return
    try {
      await window.aniPlay?.watchTogether.sendChat(chatDraft)
      setChatDraft('')
    } catch {
      setErrorMessage(t('watchTogether.sendChatFailed'))
    }
  }

  const handleCopyInvite = async () => {
    if (!state?.code) return
    try {
      await navigator.clipboard.writeText(`aniplay://watch/${state.code}`)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setErrorMessage(t('watchTogether.copyFailed'))
    }
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:p-4 md:items-center"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onOpenChange(false) }}
    >
      <section role="dialog" aria-modal="true" aria-labelledby="watch-together-title" className="flex max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden rounded-t-[28px] border border-m3-outline/20 bg-m3-surface-container shadow-2xl sm:rounded-[28px]">
        <header className="flex items-center justify-between gap-4 border-b border-m3-outline/15 px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-[11px] font-black uppercase tracking-[0.24em] text-m3-primary">{t('watchTogether.title')}</p>
              {state?.status && state.status !== 'idle' ? (
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-wider ${state.connected ? 'bg-emerald-400/10 text-emerald-300' : 'bg-amber-400/10 text-amber-200'}`}>
                  <span className={`size-1.5 rounded-full ${state.connected ? 'bg-emerald-400' : 'bg-amber-300'}`} />
                  {statusLabel}
                </span>
              ) : null}
            </div>
            <h3 id="watch-together-title" className="mt-1 truncate text-xl font-black sm:text-2xl">{headerTitle}</h3>
            {connectedRoom && state?.content ? <p className="mt-1 truncate text-sm text-m3-on-surface-variant">{t('watchTogether.episodeSummary', { name: state.content.animeName, episode: state.content.episode, translation: state.content.translationType.toUpperCase() })}</p> : null}
          </div>
          <button type="button" className="icon-button shrink-0" onClick={() => onOpenChange(false)} aria-label={t('watchTogether.closePanel')}><X size={20} /></button>
        </header>

        <div className="overflow-y-auto p-4 sm:p-6">
          {(errorMessage || state?.error) ? (
            <div role="alert" className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-red-400/25 bg-red-400/10 px-4 py-3 text-sm text-red-200">
              <span>{errorMessage ?? state?.error}</span>
              {state?.status === 'error' ? <button type="button" disabled={isBusy} onClick={() => void handleReconnect()} className="inline-flex shrink-0 items-center gap-2 font-black text-red-100"><RefreshCw size={15} className={isBusy ? 'animate-spin' : ''} />{t('watchTogether.reconnect')}</button> : null}
            </div>
          ) : null}

          {!connectedRoom ? (
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
                  <input
                    value={joinCode}
                    onChange={(event) => setJoinCode(event.target.value.toUpperCase().replace(/[^0-9A-HJKMNP-TV-Z]/g, ''))}
                    onKeyDown={(event) => { if (event.key === 'Enter' && authenticated && !isBusy && joinCode.length === 10) void handleJoin() }}
                    placeholder={t('watchTogether.codePlaceholder')}
                    maxLength={10}
                    autoFocus={Boolean(inviteCode)}
                    className="w-full rounded-2xl border border-m3-outline/25 bg-m3-surface px-4 py-3 text-center font-mono text-lg font-black uppercase tracking-[0.2em] outline-none transition-colors focus:border-m3-primary"
                  />
                </label>
                <button type="button" disabled={isBusy || !authenticated || joinCode.length !== 10} onClick={() => void handleJoin()} className="mt-3 w-full rounded-full bg-m3-secondary px-4 py-3 text-sm font-black text-m3-on-secondary transition-transform enabled:hover:scale-[1.01] disabled:opacity-50">{t('watchTogether.joinRoom')}</button>
              </div>
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-[minmax(250px,0.72fr)_minmax(360px,1.28fr)]">
              <aside className="space-y-4">
                <div className="overflow-hidden rounded-3xl border border-emerald-400/20 bg-emerald-400/10 p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-200/75">{t('watchTogether.inviteCode')}</p>
                  <div className="mt-1 flex items-center justify-between gap-3">
                    <p className="font-mono text-xl font-black tracking-[0.12em] text-emerald-100">{state?.code}</p>
                    <button type="button" onClick={() => void handleCopyInvite()} className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-100/10 px-3 py-2 text-xs font-black text-emerald-100 hover:bg-emerald-100/15">{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? t('watchTogether.copied') : t('watchTogether.copyInvite')}</button>
                  </div>
                  <p className="mt-3 text-xs leading-5 text-emerald-100/70">{t('watchTogether.shareHint')}</p>
                </div>

                <div className="rounded-3xl border border-m3-outline/15 bg-m3-surface/55 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-sm font-black"><Users size={17} /><span>{t('watchTogether.participants')}</span></div>
                    <span className="rounded-full bg-m3-surface-variant px-2 py-1 text-[11px] font-bold text-m3-on-surface-variant">{t('watchTogether.readyCount', { ready: readyParticipants, total: state?.participants.length ?? 0 })}</span>
                  </div>
                  <div className="mt-3 space-y-2">
                    {(state?.participants ?? []).length > 0 ? state?.participants.map((participant) => (
                      <div key={participant.id} className="flex items-center gap-3 rounded-2xl bg-m3-surface/70 px-3 py-2.5">
                        <div className="relative shrink-0">
                          {participant.avatar ? <img src={participant.avatar} alt="" className="size-9 rounded-full object-cover" /> : <div className="flex size-9 items-center justify-center rounded-full bg-m3-surface-variant font-black">{participant.name.slice(0, 1).toUpperCase()}</div>}
                          <span className={`absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-m3-surface ${participant.ready ? 'bg-emerald-400' : 'bg-amber-300'}`} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <p className="truncate text-sm font-bold">{participant.name}</p>
                            {participant.role === 'host' ? <Crown size={13} className="shrink-0 text-amber-300" /> : null}
                          </div>
                          <p className="text-xs text-m3-on-surface-variant">{t(`watchTogether.${participant.role}`)} · {participant.ready ? t('watchTogether.ready') : t('watchTogether.loading')}</p>
                        </div>
                      </div>
                    )) : <p className="py-3 text-sm text-m3-on-surface-variant">{t('watchTogether.noParticipants')}</p>}
                  </div>
                </div>

                <button type="button" onClick={() => void handleLeave()} className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-red-300/20 px-4 py-2.5 text-sm font-black text-red-300 hover:bg-red-400/10"><LogOut size={16} />{t('watchTogether.leaveRoom')}</button>
              </aside>

              <div className="flex min-h-[360px] flex-col overflow-hidden rounded-3xl border border-m3-outline/15 bg-m3-surface/55">
                <div className="flex items-center gap-2 border-b border-m3-outline/10 px-4 py-3 text-sm font-black"><MessagesSquare size={17} /><span>{t('watchTogether.chat')}</span></div>
                <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3 lg:max-h-[430px]">
                  {(state?.chat ?? []).length > 0 ? state?.chat.map((message) => (
                    <div key={message.id} className="rounded-2xl bg-m3-surface/75 px-3 py-2.5 text-sm">
                      <div className="flex items-center justify-between gap-3 text-xs text-m3-on-surface-variant"><span className="truncate font-bold text-m3-on-surface">{message.authorName}</span><time className="shrink-0">{new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></div>
                      <p className="mt-1.5 wrap-break-word leading-5">{message.body}</p>
                    </div>
                  )) : <div className="flex h-full min-h-48 flex-col items-center justify-center px-6 text-center text-m3-on-surface-variant"><MessagesSquare size={28} className="mb-3 opacity-40" /><p className="text-sm">{t('watchTogether.emptyState')}</p></div>}
                  <div ref={chatEndRef} />
                </div>
                <div className="flex gap-2 border-t border-m3-outline/10 p-3">
                  <input value={chatDraft} disabled={!state?.connected} maxLength={500} onChange={(event) => setChatDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void handleSendChat() }} placeholder={t('watchTogether.typeMessage')} className="min-w-0 flex-1 rounded-full border border-m3-outline/20 bg-m3-surface px-4 py-2.5 text-sm outline-none focus:border-m3-primary disabled:opacity-50" />
                  <button type="button" aria-label={t('watchTogether.send')} disabled={!state?.connected || !chatDraft.trim()} onClick={() => void handleSendChat()} className="flex size-10 shrink-0 items-center justify-center rounded-full bg-m3-primary text-m3-on-primary disabled:opacity-40"><Send size={17} /></button>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
