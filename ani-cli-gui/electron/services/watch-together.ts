import { WebSocket } from 'ws'
import type { WatchTogetherContent, WatchTogetherCreateInput, WatchTogetherJoinInput, WatchTogetherPlaybackState, WatchTogetherState } from '../../src/watch-together-types'

const DEFAULT_ENDPOINT = 'https://watch-together.vorlie.pl'
const MAX_RECONNECT_ATTEMPTS = 4

export interface WatchTogetherServiceConfig {
  available: boolean
  endpoint: string | null
  message: string | null
}

export class WatchTogetherService {
  private ws: WebSocket | null = null
  private reconnectAttempts = 0
  private reconnectTimer: NodeJS.Timeout | null = null
  private currentCode: string | null = null
  private currentRole: WatchTogetherState['role'] | null = null
  private state: WatchTogetherState = {
    code: '',
    connected: false,
    role: 'guest',
    content: null,
    playback: null,
    participants: [],
    chat: [],
    status: 'idle',
    endpoint: DEFAULT_ENDPOINT,
    error: null,
  }

  private onChanged: ((state: WatchTogetherState) => void) | undefined
  private onInvite: ((code: string) => void) | undefined

  constructor(onChanged?: (state: WatchTogetherState) => void, onInvite?: (code: string) => void) {
    this.onChanged = onChanged
    this.onInvite = onInvite
  }

  getConfig(): WatchTogetherServiceConfig {
    const endpoint = this.resolveEndpoint()
    if (!endpoint) {
      return { available: false, endpoint: null, message: 'Watch Together is not configured for this build. Set ANIPLAY_WATCH_TOGETHER_URL or VITE_WATCH_TOGETHER_URL.' }
    }
    return { available: true, endpoint, message: null }
  }

  getState(): WatchTogetherState {
    return this.state
  }

  async create(input: WatchTogetherCreateInput): Promise<WatchTogetherState> {
    const endpoint = this.resolveEndpoint()
    if (!endpoint) throw new Error('Watch Together endpoint is not configured')
    this.clearReconnectTimer()
    const response = await fetch(`${endpoint}/v1/rooms`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        content: input.content,
        playback: input.playback ?? { position: 0, paused: true, revision: 0 },
        participant: {
          name: input.participantName.trim(),
          avatar: input.participantAvatar ?? null,
          hostToken: input.hostToken ?? 'host-token',
        },
      }),
    })

    if (!response.ok) {
      const payload = await response.json().catch(() => ({})) as { error?: string }
      throw new Error(payload.error ?? 'The room could not be created')
    }

    const payload = await response.json() as { code: string; hostToken: string }
    this.currentCode = payload.code
    this.currentRole = 'host'
    this.setState({
      code: payload.code,
      connected: false,
      role: 'host',
      status: 'connecting',
      endpoint,
      error: null,
      content: input.content,
      playback: input.playback ?? { position: 0, paused: true, revision: 0 },
      participants: [],
      chat: [],
    })
    await this.connect(payload.code, input.participantName, input.participantAvatar ?? null, payload.hostToken, 'host')
    return this.getState()
  }

  async join(input: WatchTogetherJoinInput): Promise<WatchTogetherState> {
    const endpoint = this.resolveEndpoint()
    if (!endpoint) throw new Error('Watch Together endpoint is not configured')
    this.clearReconnectTimer()
    this.currentCode = input.code
    this.currentRole = 'guest'
    this.setState({
      code: input.code,
      connected: false,
      role: 'guest',
      status: 'connecting',
      endpoint,
      error: null,
      content: null,
      playback: null,
      participants: [],
      chat: [],
    })
    await this.connect(input.code, input.participantName, input.participantAvatar ?? null, undefined, 'guest')
    return this.getState()
  }

  async leave(): Promise<void> {
    this.clearReconnectTimer()
    this.ws?.close()
    this.ws = null
    this.currentCode = null
    this.currentRole = null
    this.setState({
      code: '',
      connected: false,
      role: 'guest',
      status: 'idle',
      endpoint: this.resolveEndpoint() ?? DEFAULT_ENDPOINT,
      error: null,
      content: null,
      playback: null,
      participants: [],
      chat: [],
    })
  }

  async sendChat(body: string): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) throw new Error('Watch Together is not connected')
    const normalized = body.trim()
    if (!normalized) return
    this.ws.send(JSON.stringify({ type: 'chat', body: normalized.slice(0, 500) }))
  }

  async updatePlayback(payload: WatchTogetherPlaybackState): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) throw new Error('Watch Together is not connected')
    this.ws.send(JSON.stringify({ type: 'playback-command', payload }))
  }

  async setContent(content: WatchTogetherContent): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) throw new Error('Watch Together is not connected')
    this.ws.send(JSON.stringify({ type: 'content-change', content }))
  }

  async setReady(ready: boolean): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) throw new Error('Watch Together is not connected')
    this.ws.send(JSON.stringify({ type: 'ready', ready }))
  }

  async consumeInvite(code: string): Promise<void> {
    if (!code) return
    this.onInvite?.(code)
  }

  shutdown(): void {
    this.clearReconnectTimer()
    this.ws?.close()
    this.ws = null
  }

  private resolveEndpoint(): string | null {
    const runtimeOverride = process.env.ANIPLAY_WATCH_TOGETHER_URL?.trim()
    if (runtimeOverride) return runtimeOverride
    const buildOverride = process.env.VITE_WATCH_TOGETHER_URL?.trim()
    if (buildOverride) return buildOverride
    return null
  }

  private async connect(code: string, participantName: string, participantAvatar: string | null | undefined, hostToken: string | undefined, role: WatchTogetherState['role']): Promise<void> {
    const endpoint = this.resolveEndpoint()
    if (!endpoint) throw new Error('Watch Together endpoint is not configured')
    const wsUrl = `${endpoint.replace(/^https?:/, 'wss:')}/v1/rooms/${encodeURIComponent(code)}/ws`
    this.ws?.close()
    this.ws = new WebSocket(wsUrl)
    this.ws.on('open', () => {
      this.reconnectAttempts = 0
      this.ws?.send(JSON.stringify({
        type: 'hello',
        version: 1,
        participant: { name: participantName.trim(), avatar: participantAvatar ?? null },
        hostToken,
        role,
      }))
    })

    this.ws.on('message', (data: unknown) => {
      const message = typeof data === 'string' ? data : String(data)
      try {
        const payload = JSON.parse(message) as {
          type?: string
          room?: Partial<WatchTogetherState>
          snapshot?: { code?: string; content?: WatchTogetherContent | null; playback?: WatchTogetherPlaybackState | null; participants?: WatchTogetherState['participants']; chat?: WatchTogetherState['chat']; role?: WatchTogetherState['role'] }
          error?: string
        }
        if (payload.type === 'snapshot' && payload.snapshot) {
          this.setState({
            code: payload.snapshot.code ?? code,
            connected: true,
            role: payload.snapshot.role ?? role,
            status: 'connected',
            endpoint,
            error: null,
            content: payload.snapshot.content ?? null,
            playback: payload.snapshot.playback ?? null,
            participants: payload.snapshot.participants ?? [],
            chat: payload.snapshot.chat ?? [],
          })
          return
        }
        if (payload.type === 'error') {
          this.setState({
            code,
            connected: false,
            role,
            status: 'error',
            endpoint,
            error: payload.error ?? 'The room connection failed',
            content: this.state.content,
            playback: this.state.playback,
            participants: this.state.participants,
            chat: this.state.chat,
          })
        }
      } catch {
        this.setState({
          code,
          connected: false,
          role,
          status: 'error',
          endpoint,
          error: 'The room payload was invalid',
          content: this.state.content,
          playback: this.state.playback,
          participants: this.state.participants,
          chat: this.state.chat,
        })
      }
    })

    this.ws.on('close', () => {
      this.ws = null
      if (this.currentCode && this.currentRole && this.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        const delay = 1000 * Math.pow(2, this.reconnectAttempts)
        this.reconnectAttempts += 1
        this.reconnectTimer = setTimeout(() => {
          void this.connect(code, participantName, participantAvatar, hostToken, role).catch(() => {})
        }, delay)
      } else {
        this.setState({
          code,
          connected: false,
          role,
          status: 'error',
          endpoint,
          error: 'The room connection was closed',
          content: this.state.content,
          playback: this.state.playback,
          participants: this.state.participants,
          chat: this.state.chat,
        })
      }
    })

    this.ws.on('error', () => {
      this.setState({
        code,
        connected: false,
        role,
        status: 'error',
        endpoint,
        error: 'The room connection failed',
        content: this.state.content,
        playback: this.state.playback,
        participants: this.state.participants,
        chat: this.state.chat,
      })
    })
  }

  private setState(next: WatchTogetherState): void {
    this.state = { ...this.state, ...next }
    this.onChanged?.(this.state)
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }
}
