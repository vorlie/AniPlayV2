import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type {
  WatchTogetherContent,
  WatchTogetherCreateInput,
  WatchTogetherJoinInput,
  WatchTogetherPlaybackState,
  WatchTogetherState,
} from '../watch-together-types'
import { countUnreadMessages } from '../lib/watch-together-ui'

interface WatchTogetherContextValue {
  state: WatchTogetherState | null
  inviteCode: string | null
  companionOpen: boolean
  unreadCount: number
  clearInvite: () => void
  setCompanionOpen: (open: boolean) => void
  markChatRead: () => void
  createRoom: (input: WatchTogetherCreateInput) => Promise<WatchTogetherState>
  joinRoom: (input: WatchTogetherJoinInput) => Promise<WatchTogetherState>
  leaveRoom: () => Promise<void>
  reconnect: () => Promise<WatchTogetherState>
  sendChat: (body: string) => Promise<void>
  updatePlayback: (playback: WatchTogetherPlaybackState) => Promise<void>
  setContent: (content: WatchTogetherContent) => Promise<void>
  setReady: (ready: boolean) => Promise<void>
}

const WatchTogetherContext = createContext<WatchTogetherContextValue | null>(null)

function requireApi() {
  const api = window.aniPlay?.watchTogether
  if (!api) throw new Error('Watch Together is unavailable.')
  return api
}

export function WatchTogetherProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WatchTogetherState | null>(null)
  const [inviteCode, setInviteCode] = useState<string | null>(null)
  const [companionOpen, setCompanionOpenState] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const latestStateRef = useRef<WatchTogetherState | null>(null)
  const lastMessageIdRef = useRef<string | null>(null)
  const initializedRef = useRef(false)

  const applyState = useCallback((next: WatchTogetherState) => {
    const messages = next.chat ?? []
    const newestId = messages.at(-1)?.id ?? null

    if (!initializedRef.current) {
      initializedRef.current = true
      lastMessageIdRef.current = newestId
    } else if (newestId && newestId !== lastMessageIdRef.current) {
      setUnreadCount(countUnreadMessages(messages, lastMessageIdRef.current))
    }

    if (!next.code || next.status === 'idle') {
      lastMessageIdRef.current = null
      setUnreadCount(0)
      setCompanionOpenState(false)
    }

    latestStateRef.current = next
    setState(next)
  }, [])

  useEffect(() => {
    const api = window.aniPlay?.watchTogether
    if (!api) return
    void api.getState().then(applyState).catch(() => {})
    const unsubscribeState = api.onChanged(applyState)
    const unsubscribeInvite = api.onInvite((code) => setInviteCode(code))
    return () => {
      unsubscribeState()
      unsubscribeInvite()
    }
  }, [applyState])

  const markChatRead = useCallback(() => {
    lastMessageIdRef.current = latestStateRef.current?.chat.at(-1)?.id ?? null
    setUnreadCount(0)
  }, [])

  const setCompanionOpen = useCallback((open: boolean) => {
    setCompanionOpenState(open)
    if (open) markChatRead()
  }, [markChatRead])

  const createRoom = useCallback(async (input: WatchTogetherCreateInput) => {
    const next = await requireApi().create(input)
    applyState(next)
    setInviteCode(null)
    setCompanionOpen(true)
    return next
  }, [applyState, setCompanionOpen])

  const joinRoom = useCallback(async (input: WatchTogetherJoinInput) => {
    const next = await requireApi().join(input)
    applyState(next)
    setInviteCode(null)
    setCompanionOpen(true)
    return next
  }, [applyState, setCompanionOpen])

  const leaveRoom = useCallback(async () => {
    await requireApi().leave()
    latestStateRef.current = null
    setState(null)
    setCompanionOpenState(false)
    setUnreadCount(0)
  }, [])

  const reconnect = useCallback(async () => {
    const next = await requireApi().reconnect()
    applyState(next)
    return next
  }, [applyState])

  const sendChat = useCallback((body: string) => requireApi().sendChat(body), [])
  const updatePlayback = useCallback((playback: WatchTogetherPlaybackState) => requireApi().updatePlayback(playback), [])
  const setContent = useCallback((content: WatchTogetherContent) => requireApi().setContent(content), [])
  const setReady = useCallback((ready: boolean) => requireApi().setReady(ready), [])

  const value = useMemo<WatchTogetherContextValue>(() => ({
    state,
    inviteCode,
    companionOpen,
    unreadCount,
    clearInvite: () => setInviteCode(null),
    setCompanionOpen,
    markChatRead,
    createRoom,
    joinRoom,
    leaveRoom,
    reconnect,
    sendChat,
    updatePlayback,
    setContent,
    setReady,
  }), [companionOpen, createRoom, inviteCode, joinRoom, leaveRoom, markChatRead, reconnect, sendChat, setCompanionOpen, setContent, setReady, state, unreadCount, updatePlayback])

  return <WatchTogetherContext.Provider value={value}>{children}</WatchTogetherContext.Provider>
}

// The provider and its hook intentionally share this module as one public boundary.
// eslint-disable-next-line react-refresh/only-export-components
export function useWatchTogether() {
  const value = useContext(WatchTogetherContext)
  if (!value) throw new Error('useWatchTogether must be used inside WatchTogetherProvider')
  return value
}
