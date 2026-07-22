import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, ChevronUp, Copy, Crown, LogOut, MessageSquare, RefreshCw, Send, Users, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useWatchTogether } from '../contexts/WatchTogetherContext'

type ViewportMode = 'mobile' | 'desktop' | 'wide'

function getViewportMode(): ViewportMode {
  if (window.matchMedia('(min-width: 1536px)').matches) return 'wide'
  if (window.matchMedia('(min-width: 1024px)').matches) return 'desktop'
  return 'mobile'
}

function useViewportMode() {
  const [mode, setMode] = useState<ViewportMode>(getViewportMode)
  useEffect(() => {
    const update = () => setMode(getViewportMode())
    const wide = window.matchMedia('(min-width: 1536px)')
    const desktop = window.matchMedia('(min-width: 1024px)')
    wide.addEventListener('change', update)
    desktop.addEventListener('change', update)
    return () => {
      wide.removeEventListener('change', update)
      desktop.removeEventListener('change', update)
    }
  }, [])
  return mode
}

export function WatchTogetherCompanion() {
  const { t } = useTranslation()
  const {
    state,
    companionOpen,
    unreadCount,
    setCompanionOpen,
    markChatRead,
    leaveRoom,
    reconnect,
    sendChat,
  } = useWatchTogether()
  const mode = useViewportMode()
  const [chatDraft, setChatDraft] = useState('')
  const [participantsOpen, setParticipantsOpen] = useState(true)
  const [copied, setCopied] = useState(false)
  const [isBusy, setIsBusy] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const chatViewportRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLElement>(null)
  const pinnedToBottomRef = useRef(true)

  const visible = mode === 'wide' || companionOpen
  const readyParticipants = state?.participants.filter((participant) => participant.ready).length ?? 0

  useEffect(() => {
    if (!visible) return
    markChatRead()
    if (mode !== 'wide') panelRef.current?.focus()
  }, [markChatRead, mode, visible])

  useEffect(() => {
    if (!visible || !pinnedToBottomRef.current) return
    const viewport = chatViewportRef.current
    if (viewport) viewport.scrollTo({ top: viewport.scrollHeight, behavior: 'smooth' })
    markChatRead()
  }, [markChatRead, state?.chat.length, visible])

  useEffect(() => {
    if (!companionOpen || mode === 'wide') return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setCompanionOpen(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [companionOpen, mode, setCompanionOpen])

  if (!state?.code) return null

  const handleCopyInvite = async () => {
    try {
      await navigator.clipboard.writeText(`aniplay://watch/${state.code}`)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setErrorMessage(t('watchTogether.copyFailed'))
    }
  }

  const handleSendChat = async () => {
    if (!chatDraft.trim() || !state.connected) return
    try {
      await sendChat(chatDraft)
      setChatDraft('')
    } catch {
      setErrorMessage(t('watchTogether.sendChatFailed'))
    }
  }

  const handleReconnect = async () => {
    setIsBusy(true)
    setErrorMessage(null)
    try {
      await reconnect()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t('watchTogether.unavailable'))
    } finally {
      setIsBusy(false)
    }
  }

  const handleLeave = async () => {
    if (!window.confirm(t('watchTogether.leaveRoomConfirm'))) return
    try {
      await leaveRoom()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t('watchTogether.leaveFailed'))
    }
  }

  const content = (
    <>
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-m3-outline/15 px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`size-2 rounded-full ${state.connected ? 'bg-emerald-400' : 'bg-amber-300'}`} />
            <p className="truncate text-sm font-black">{t('watchTogether.roomTitle', { code: state.code })}</p>
          </div>
          <p className="mt-0.5 truncate text-xs text-m3-on-surface-variant">{t(`watchTogether.status.${state.status}`)}</p>
        </div>
        {mode !== 'wide' ? <button type="button" className="icon-button !size-8" onClick={() => setCompanionOpen(false)} aria-label={t('watchTogether.closeCompanion')}><X size={17} /></button> : null}
      </header>

      <div className="shrink-0 space-y-2 border-b border-m3-outline/10 p-3">
        {(errorMessage || state.error) ? (
          <div role="alert" className="rounded-xl border border-red-400/25 bg-red-400/10 p-2.5 text-xs text-red-200">
            <p>{errorMessage ?? state.error}</p>
            {state.status === 'error' ? <button type="button" disabled={isBusy} onClick={() => void handleReconnect()} className="mt-2 inline-flex items-center gap-1.5 font-black"><RefreshCw size={13} className={isBusy ? 'animate-spin' : ''} />{t('watchTogether.reconnect')}</button> : null}
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-2 rounded-xl bg-emerald-400/10 px-3 py-2 text-emerald-100">
          <span className="font-mono text-sm font-black tracking-wider">{state.code}</span>
          <button type="button" onClick={() => void handleCopyInvite()} className="inline-flex items-center gap-1.5 text-xs font-black">{copied ? <Check size={13} /> : <Copy size={13} />}{copied ? t('watchTogether.copied') : t('watchTogether.copyInvite')}</button>
        </div>

        <button type="button" aria-expanded={participantsOpen} onClick={() => setParticipantsOpen((open) => !open)} className="flex w-full items-center justify-between rounded-xl px-1 py-1 text-xs font-black">
          <span className="inline-flex items-center gap-2"><Users size={15} />{t('watchTogether.participants')}</span>
          <span className="inline-flex items-center gap-1 text-m3-on-surface-variant">{t('watchTogether.readyCount', { ready: readyParticipants, total: state.participants.length })}{participantsOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</span>
        </button>
        {participantsOpen ? (
          <div className="max-h-32 space-y-1 overflow-y-auto">
            {state.participants.map((participant) => (
              <div key={participant.id} className="flex items-center gap-2 rounded-xl bg-m3-surface/60 px-2.5 py-2">
                {participant.avatar ? <img src={participant.avatar} alt="" className="size-7 rounded-full object-cover" /> : <div className="flex size-7 items-center justify-center rounded-full bg-m3-surface-variant text-xs font-black">{participant.name.slice(0, 1).toUpperCase()}</div>}
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1 truncate text-xs font-bold">{participant.name}{participant.role === 'host' ? <Crown size={11} className="shrink-0 text-amber-300" /> : null}</p>
                </div>
                <span className={`size-2 rounded-full ${participant.ready ? 'bg-emerald-400' : 'bg-amber-300'}`} title={participant.ready ? t('watchTogether.ready') : t('watchTogether.loading')} />
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center gap-2 px-4 py-2 text-xs font-black"><MessageSquare size={14} />{t('watchTogether.chat')}</div>
        <div
          ref={chatViewportRef}
          className="min-h-36 flex-1 space-y-2 overflow-y-auto px-3 pb-3"
          onScroll={(event) => {
            const element = event.currentTarget
            pinnedToBottomRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 56
            if (pinnedToBottomRef.current) markChatRead()
          }}
        >
          {state.chat.length ? state.chat.map((message) => (
            <div key={message.id} className="rounded-xl bg-m3-surface/70 px-3 py-2 text-sm">
              <div className="flex items-center justify-between gap-2 text-[11px]"><span className="truncate font-black">{message.authorName}</span><time className="shrink-0 text-m3-on-surface-variant">{new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></div>
              <p className="mt-1 wrap-break-word text-xs leading-5">{message.body}</p>
            </div>
          )) : <div className="flex min-h-32 items-center justify-center px-5 text-center text-xs text-m3-on-surface-variant">{t('watchTogether.emptyState')}</div>}
        </div>
        {unreadCount > 0 ? <button type="button" onClick={() => { pinnedToBottomRef.current = true; chatViewportRef.current?.scrollTo({ top: chatViewportRef.current.scrollHeight, behavior: 'smooth' }); markChatRead() }} className="mx-auto mb-2 rounded-full bg-m3-primary px-3 py-1 text-[11px] font-black text-m3-on-primary">{t('watchTogether.newMessages', { count: unreadCount })}</button> : null}
        <div className="flex shrink-0 gap-2 border-t border-m3-outline/10 p-3">
          <input value={chatDraft} disabled={!state.connected} maxLength={500} onChange={(event) => setChatDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) void handleSendChat() }} placeholder={t('watchTogether.typeMessage')} className="min-w-0 flex-1 rounded-full border border-m3-outline/20 bg-m3-surface px-3 py-2 text-sm outline-none focus:border-m3-primary disabled:opacity-50" />
          <button type="button" aria-label={t('watchTogether.send')} disabled={!state.connected || !chatDraft.trim()} onClick={() => void handleSendChat()} className="flex size-9 shrink-0 items-center justify-center rounded-full bg-m3-primary text-m3-on-primary disabled:opacity-40"><Send size={15} /></button>
        </div>
      </div>

      <button type="button" onClick={() => void handleLeave()} className="m-3 mt-0 inline-flex shrink-0 items-center justify-center gap-2 rounded-full border border-red-300/20 px-3 py-2 text-xs font-black text-red-300 hover:bg-red-400/10"><LogOut size={14} />{t('watchTogether.leaveRoom')}</button>
    </>
  )

  if (mode === 'wide') {
    return <aside aria-label={t('watchTogether.companionLabel')} className="m3-card flex min-h-0 max-h-[calc(100vh-190px)] flex-col overflow-hidden">{content}</aside>
  }

  if (mode === 'desktop') {
    if (!companionOpen) return null
    return <aside ref={panelRef} tabIndex={-1} role="dialog" aria-modal="false" aria-label={t('watchTogether.companionLabel')} className="absolute inset-y-0 right-0 z-40 flex w-[min(380px,44vw)] flex-col overflow-hidden rounded-3xl border border-m3-outline/20 bg-m3-surface-container shadow-2xl outline-none motion-safe:animate-in">{content}</aside>
  }

  return (
    <>
      <button type="button" onClick={() => setCompanionOpen(true)} className="mt-3 flex w-full items-center justify-between rounded-2xl border border-m3-outline/20 bg-m3-surface-container px-4 py-3 text-left">
        <span className="min-w-0"><span className="flex items-center gap-2 text-sm font-black"><span className={`size-2 rounded-full ${state.connected ? 'bg-emerald-400' : 'bg-amber-300'}`} />{t('watchTogether.roomTitle', { code: state.code })}</span><span className="mt-1 block truncate text-xs text-m3-on-surface-variant">{t('watchTogether.mobileSummary', { participants: state.participants.length })}</span></span>
        <span className="inline-flex items-center gap-2"><MessageSquare size={17} />{unreadCount > 0 ? <span className="rounded-full bg-m3-primary px-2 py-0.5 text-xs font-black text-m3-on-primary">{unreadCount}</span> : null}</span>
      </button>
      {companionOpen ? (
        <div className="fixed inset-0 z-50 flex items-end bg-black/65 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) setCompanionOpen(false) }}>
          <section ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={t('watchTogether.companionLabel')} className="flex max-h-[88vh] w-full flex-col overflow-hidden rounded-t-[28px] border border-m3-outline/20 bg-m3-surface-container shadow-2xl outline-none">{content}</section>
        </div>
      ) : null}
    </>
  )
}
