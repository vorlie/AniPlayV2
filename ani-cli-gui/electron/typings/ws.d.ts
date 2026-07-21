declare module 'ws' {
  export class WebSocket {
    static OPEN: number
    readyState: number
    constructor(url: string)
    on(event: 'open' | 'message' | 'close' | 'error', listener: (...args: any[]) => void): void
    send(data: string): void
    close(code?: number, reason?: string): void
  }
}
