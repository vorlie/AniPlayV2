import { useEffect, useMemo, useState } from 'react'
import { MessagesSquare, Sparkles, Users, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { CatalogProvider, TranslationType } from '../catalog-types'
import { buildWatchTogetherContent } from '../lib/watch-together-content'
import type { WatchTogetherState } from '../watch-together-types'

interface WatchTogetherPanelProps {
  anime?: { id: string; name: string; episodes: number; aniListMediaId?: number; coverUrl?: string; catalogProvider: CatalogProvider }
  episode?: string | null
  translationType?: TranslationType
  isOpen: boolean
  onOpenChange: (next: boolean) => void
}

export function WatchTogetherPanel({ anime, episode, translationType, isOpen, onOpenChange }: WatchTogetherPanelProps) {
  const { t } = useTranslation()
  const [joinCode, setJoinCode] = useState('')
  const [chatDraft, setChatDraft] = useState('')
  const [state, setState] = useState<WatchTogetherState | null>(null)
  const [configMessage, setConfigMessage] = useState<string | null>(null)
  const [profileName, setProfileName] = useState(t('watchTogether.guest'))
  const [profileAvatar, setProfileAvatar] = useState<string | null>(null)
  const [isBusy, setIsBusy] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const canCreate = Boolean(anime && window.aniPlay?.watchTogether)

  useEffect(() => {
    if (!isOpen || !window.aniPlay?.watchTogether) return
    void window.aniPlay.watchTogether.getConfig().then((config) => setConfigMessage(config.message)).catch(() => setConfigMessage(t('watchTogether.unavailable')))
    void window.aniPlay.watchTogether.getState().then(setState).catch(() => {})
    const unsubscribe = window.aniPlay.watchTogether.onChanged((next) => setState(next))
    const unsubscribeInvite = window.aniPlay.watchTogether.onInvite((code) => {
      setJoinCode(code.toUpperCase())
      onOpenChange(true)
    })
    void window.aniPlay.aniList.profile.get().then((profile) => {
      setProfileName(profile.user?.name ?? t('watchTogether.guest'))
      setProfileAvatar(profile.user?.avatar ?? null)
    }).catch(() => {})
    return () => {
      unsubscribe()
      unsubscribeInvite()
    }
  }, [isOpen, onOpenChange, t])

  const headerTitle = useMemo(() => state?.code ? t('watchTogether.roomTitle', { code: state.code }) : t('watchTogether.title'), [state, t])

  const handleCreate = async () => {
    const aniPlayApi = window.aniPlay
    if (!anime || !aniPlayApi || !aniPlayApi.watchTogether) return
    setIsBusy(true)
    setErrorMessage(null)
    try {
      const resolvedEpisode = episode ?? '1'
      const resolvedTranslation = translationType ?? 'sub'
      const contentBase = buildWatchTogetherContent(anime, resolvedEpisode, resolvedTranslation)
      const contentPayload = anime.catalogProvider === 'anikoto'
        ? await (async () => {
            try {
              const linksResponse = await aniPlayApi.getEpisodeLinks(anime.id, resolvedEpisode, resolvedTranslation, anime.catalogProvider)
              if (linksResponse?.success && Array.isArray(linksResponse.data)) {
                const primaryLink = linksResponse.data.find((link: { url?: string; embed?: boolean }) => Boolean(link?.url))
                if (primaryLink?.url) {
                  return buildWatchTogetherContent(anime, resolvedEpisode, resolvedTranslation, primaryLink.url, primaryLink.embed ? 'embed' : 'native')
                }
              }
            } catch {
              // fall back to the base content payload
            }
            return contentBase
          })()
        : contentBase

      const nextState = await aniPlayApi.watchTogether.create({
        content: contentPayload,
        playback: { position: 0, paused: true, revision: 0 },
        participantName: profileName,
        participantAvatar: profileAvatar,
      })
      setState(nextState)
      onOpenChange(true)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t('watchTogether.createFailed'))
    } finally {
      setIsBusy(false)
    }
  }

  const handleJoin = async () => {
    const aniPlayApi = window.aniPlay
    if (!aniPlayApi || !aniPlayApi.watchTogether) return
    setIsBusy(true)
    setErrorMessage(null)
    try {
      const nextState = await aniPlayApi.watchTogether.join({
        code: joinCode.trim().toUpperCase().replace(/\s+/g, ''),
        participantName: profileName,
        participantAvatar: profileAvatar,
      })
      setState(nextState)
      onOpenChange(true)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t('watchTogether.joinFailed'))
    } finally {
      setIsBusy(false)
    }
  }

  const handleLeave = async () => {
    const aniPlayApi = window.aniPlay
    try {
      await aniPlayApi?.watchTogether.leave()
      setState(null)
    } catch {
      // ignore
    }
  }

  const handleSendChat = async () => {
    const aniPlayApi = window.aniPlay
    if (!chatDraft.trim()) return
    try {
      await aniPlayApi?.watchTogether.sendChat(chatDraft)
      setChatDraft('')
    } catch {
      setErrorMessage(t('watchTogether.sendChatFailed'))
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 md:items-center">
      <div className="w-full max-w-3xl rounded-[14px] border border-m3-outline/20 bg-m3-surface-container/95 p-4 shadow-2xl backdrop-blur-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-m3-primary">{t('watchTogether.title')}</p>
            <h3 className="text-xl font-black">{headerTitle}</h3>
          </div>
          <button type="button" className="icon-button" onClick={() => onOpenChange(false)} aria-label={t('watchTogether.closePanel')}>
            <X size={18} />
          </button>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[1.3fr_0.9fr]">
          <div className="rounded-2xl border border-m3-outline/20 bg-m3-surface/50 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-m3-on-surface-variant">
              <Sparkles size={16} />
              <span>{anime ? t('watchTogether.roomFor', { name: anime.name }) : t('watchTogether.createHint')}</span>
            </div>
            {configMessage ? <p className="mt-3 text-sm text-m3-on-surface-variant">{configMessage}</p> : null}
            {errorMessage ? <p className="mt-3 rounded-xl border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-200">{errorMessage}</p> : null}

            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" disabled={!canCreate || isBusy} onClick={handleCreate} className="rounded-full bg-m3-primary px-4 py-2 text-sm font-black text-m3-on-primary disabled:opacity-50">
                {isBusy ? t('watchTogether.working') : t('watchTogether.createRoom')}
              </button>
              <div className="flex items-center gap-2 rounded-full border border-m3-outline/20 bg-m3-surface px-2 py-1">
                <input
                  value={joinCode}
                  onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
                  placeholder={t('watchTogether.codePlaceholder')}
                  maxLength={8}
                  className="w-24 bg-transparent px-2 py-1 text-sm outline-none"
                />
                <button type="button" disabled={isBusy || !joinCode.trim()} onClick={handleJoin} className="rounded-full bg-m3-surface-variant px-3 py-1.5 text-sm font-bold text-m3-on-surface disabled:opacity-50">
                  {t('watchTogether.joinRoom')}
                </button>
              </div>
            </div>

            {state?.code ? (
              <div className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-3 text-sm text-emerald-200">
                <p className="font-black">{t('watchTogether.roomCode', { code: state.code })}</p>
                <p className="mt-1">{t('watchTogether.shareHint')}</p>
                {state.content?.provider === 'anikoto' && state.content.streamUrl ? (
                  <p className="mt-2 text-xs uppercase tracking-[0.18em] text-emerald-100/90">{t('watchTogether.anikotoParity')}</p>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="rounded-2xl border border-m3-outline/20 bg-m3-surface/50 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-m3-on-surface-variant">
              <Users size={16} />
              <span>{t('watchTogether.participants')}</span>
            </div>
            <div className="mt-3 space-y-2">
              {(state?.participants ?? []).length > 0 ? state?.participants.map((participant) => (
                <div key={participant.id} className="flex items-center justify-between rounded-xl bg-m3-surface/60 px-3 py-2 text-sm">
                  <span>{participant.name}</span>
                  <span className="text-xs uppercase tracking-[0.18em] text-m3-on-surface-variant">{participant.role}</span>
                </div>
              )) : <p className="text-sm text-m3-on-surface-variant">{t('watchTogether.noParticipants')}</p>}
            </div>

            <div className="mt-4 flex items-center gap-2 text-sm font-semibold text-m3-on-surface-variant">
              <MessagesSquare size={16} />
              <span>{t('watchTogether.chat')}</span>
            </div>
            <div className="mt-3 max-h-48 space-y-2 overflow-y-auto rounded-xl bg-m3-surface/50 p-2">
              {(state?.chat ?? []).length > 0 ? state?.chat.map((message) => (
                <div key={message.id} className="rounded-xl bg-m3-surface/70 px-2.5 py-2 text-sm">
                  <div className="flex items-center justify-between gap-2 text-[11px] uppercase tracking-[0.18em] text-m3-on-surface-variant">
                    <span>{message.authorName}</span>
                    <span>{new Date(message.createdAt).toLocaleTimeString()}</span>
                  </div>
                  <p className="mt-1 wrap-break-word">{message.body}</p>
                </div>
              )) : <p className="px-2 py-4 text-sm text-m3-on-surface-variant">{t('watchTogether.emptyState')}</p>}
            </div>
            <div className="mt-3 flex gap-2">
              <input value={chatDraft} onChange={(event) => setChatDraft(event.target.value)} placeholder={t('watchTogether.typeMessage')} className="flex-1 rounded-full border border-m3-outline/20 bg-m3-surface px-3 py-2 text-sm outline-none" />
              <button type="button" onClick={handleSendChat} className="rounded-full bg-m3-primary px-3 py-2 text-sm font-black text-m3-on-primary">{t('watchTogether.send')}</button>
            </div>
            {state?.code ? <button type="button" onClick={handleLeave} className="mt-3 text-sm font-bold text-red-300">{t('watchTogether.leaveRoom')}</button> : null}
          </div>
        </div>
      </div>
    </div>
  )
}
