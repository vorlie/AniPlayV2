import { createServer, type Server, type ServerResponse } from 'node:http'
import { randomUUID } from 'node:crypto'

const MAX_PLAYLIST_BYTES = 2 * 1024 * 1024
const MAX_REGISTERED_URLS = 20_000
const MAX_SEGMENT_PREFIX_BYTES = 64 * 1024
const MPEG_TS_PACKET_BYTES = 188
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

type ResourceKind = 'playlist' | 'segment' | 'resource'

interface RegisteredResource {
  url: string
  kind: ResourceKind
}

export interface HlsMimeProxy {
  url: string
  close(): Promise<void>
}

function safeUpstreamUrl(value: string, baseUrl: string): string {
  const url = new URL(value, baseUrl)
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('HLS playlist contains an unsupported resource URL')
  return url.toString()
}

function attributeKind(line: string): ResourceKind {
  if (/^#EXT-X-(?:MEDIA|I-FRAME-STREAM-INF):/i.test(line)) return 'playlist'
  return 'resource'
}

export function rewriteHlsPlaylist(
  playlist: string,
  playlistUrl: string,
  register: (url: string, kind: ResourceKind) => string,
): string {
  let nextUriIsPlaylist = false
  return playlist.split(/\r?\n/).map((line) => {
    const trimmed = line.trim()
    if (!trimmed) return line
    if (trimmed.startsWith('#')) {
      if (/^#EXT-X-STREAM-INF:/i.test(trimmed)) nextUriIsPlaylist = true
      return line.replace(/URI=(["'])(.*?)\1/gi, (_match, quote: string, value: string) => {
        const upstream = safeUpstreamUrl(value, playlistUrl)
        return `URI=${quote}${register(upstream, attributeKind(trimmed))}${quote}`
      })
    }

    const kind: ResourceKind = nextUriIsPlaylist ? 'playlist' : 'segment'
    nextUriIsPlaylist = false
    return register(safeUpstreamUrl(trimmed, playlistUrl), kind)
  }).join('\n')
}

export function correctedHlsContentType(kind: ResourceKind, upstreamType: string | null, url: string): string {
  if (kind === 'playlist') return 'application/vnd.apple.mpegurl'
  if (kind === 'resource') return upstreamType || 'application/octet-stream'
  const pathname = new URL(url).pathname.toLowerCase()
  if (pathname.endsWith('.m4s') || pathname.endsWith('.mp4') || pathname.endsWith('.m4v')) return 'video/mp4'
  if (pathname.endsWith('.aac')) return 'audio/aac'
  if (!upstreamType || upstreamType.toLowerCase().startsWith('image/')) return 'video/mp2t'
  return upstreamType
}

export function findWrappedMpegTsOffset(value: Uint8Array): number | null {
  const bytes = Buffer.from(value.buffer, value.byteOffset, value.byteLength)
  if (bytes.length < PNG_SIGNATURE.length || !bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) return null
  for (let offset = PNG_SIGNATURE.length; offset + (MPEG_TS_PACKET_BYTES * 2) < bytes.length; offset += 1) {
    if (
      bytes[offset] === 0x47
      && bytes[offset + MPEG_TS_PACKET_BYTES] === 0x47
      && bytes[offset + (MPEG_TS_PACKET_BYTES * 2)] === 0x47
    ) return offset
  }
  return null
}

async function closeServer(server: Server): Promise<void> {
  server.closeAllConnections?.()
  await new Promise<void>((resolve) => server.close(() => resolve()))
}

async function copyBody(response: Response, target: ServerResponse): Promise<void> {
  if (!response.body) {
    target.end()
    return
  }
  const reader = response.body.getReader()
  target.on('close', () => { void reader.cancel().catch(() => {}) })
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!target.write(Buffer.from(value))) await new Promise<void>((resolve) => target.once('drain', resolve))
    }
    target.end()
  } finally {
    reader.releaseLock()
  }
}

async function copyWrappedSegment(response: Response, target: ServerResponse): Promise<void> {
  if (!response.body) {
    target.writeHead(response.status, { 'Content-Type': 'video/mp2t', 'Cache-Control': 'no-store' }).end()
    return
  }

  const reader = response.body.getReader()
  const chunks: Buffer[] = []
  let bufferedBytes = 0
  let ended = false
  target.on('close', () => { void reader.cancel().catch(() => {}) })
  try {
    while (bufferedBytes < MAX_SEGMENT_PREFIX_BYTES) {
      const { done, value } = await reader.read()
      if (done) {
        ended = true
        break
      }
      const chunk = Buffer.from(value)
      chunks.push(chunk)
      bufferedBytes += chunk.length
      if (findWrappedMpegTsOffset(Buffer.concat(chunks, bufferedBytes)) !== null) break
    }

    const buffered = Buffer.concat(chunks, bufferedBytes)
    const offset = findWrappedMpegTsOffset(buffered)
    const upstreamLength = Number(response.headers.get('content-length') ?? 0)
    const responseHeaders: Record<string, string | number> = {
      'Content-Type': offset === null ? (response.headers.get('content-type') || 'application/octet-stream') : 'video/mp2t',
      'Cache-Control': 'no-store',
    }
    if (upstreamLength > 0) responseHeaders['Content-Length'] = Math.max(0, upstreamLength - (offset ?? 0))
    target.writeHead(response.status, responseHeaders)
    if (buffered.length > (offset ?? 0)) target.write(buffered.subarray(offset ?? 0))

    while (!ended) {
      const { done, value } = await reader.read()
      if (done) break
      if (!target.write(Buffer.from(value))) await new Promise<void>((resolve) => target.once('drain', resolve))
    }
    target.end()
  } finally {
    reader.releaseLock()
  }
}

export async function startHlsMimeProxy(entryUrl: string, upstreamHeaders: Record<string, string>): Promise<HlsMimeProxy> {
  const normalizedEntryUrl = safeUpstreamUrl(entryUrl, entryUrl)
  const token = randomUUID().replace(/-/g, '')
  const resources = new Map<string, RegisteredResource>()
  let nextId = 1
  let baseUrl = ''

  const register = (url: string, kind: ResourceKind): string => {
    if (resources.size >= MAX_REGISTERED_URLS) throw new Error('HLS playlist contains too many resources')
    const id = String(nextId++)
    resources.set(id, { url, kind })
    return `${baseUrl}/${token}/${id}`
  }

  const server = createServer((request, response) => {
    void (async () => {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        response.writeHead(405).end()
        return
      }
      const match = request.url?.match(new RegExp(`^/${token}/(\\d+)$`))
      const resource = match ? resources.get(match[1] ?? '') : undefined
      if (!resource) {
        response.writeHead(404).end()
        return
      }

      const headers = new Headers(upstreamHeaders)
      const range = request.headers.range
      if (range && resource.kind !== 'segment') headers.set('Range', range)
      const upstream = await fetch(resource.url, { headers, redirect: 'follow' })
      if (!upstream.ok && upstream.status !== 206) {
        await upstream.body?.cancel().catch(() => {})
        response.writeHead(upstream.status).end()
        return
      }

      if (resource.kind === 'playlist') {
        const declaredLength = Number(upstream.headers.get('content-length') ?? 0)
        if (declaredLength > MAX_PLAYLIST_BYTES) throw new Error('HLS playlist is unexpectedly large')
        const playlist = await upstream.text()
        if (Buffer.byteLength(playlist, 'utf8') > MAX_PLAYLIST_BYTES || !playlist.trimStart().startsWith('#EXTM3U')) {
          throw new Error('Provider returned an invalid HLS playlist')
        }
        const rewritten = rewriteHlsPlaylist(playlist, resource.url, register)
        response.writeHead(200, {
          'Content-Type': 'application/vnd.apple.mpegurl',
          'Content-Length': Buffer.byteLength(rewritten, 'utf8'),
          'Cache-Control': 'no-store',
        })
        response.end(request.method === 'HEAD' ? undefined : rewritten)
        return
      }

      const upstreamType = upstream.headers.get('content-type')
      if (resource.kind === 'segment' && upstreamType?.toLowerCase().startsWith('image/')) {
        if (request.method === 'HEAD') {
          await upstream.body?.cancel().catch(() => {})
          response.writeHead(200, { 'Content-Type': 'video/mp2t', 'Cache-Control': 'no-store' }).end()
          return
        }
        await copyWrappedSegment(upstream, response)
        return
      }

      const responseHeaders: Record<string, string> = {
        'Content-Type': correctedHlsContentType(resource.kind, upstreamType, resource.url),
        'Cache-Control': 'no-store',
      }
      for (const name of ['content-length', 'content-range', 'accept-ranges']) {
        const value = upstream.headers.get(name)
        if (value) responseHeaders[name] = value
      }
      response.writeHead(upstream.status, responseHeaders)
      if (request.method === 'HEAD') {
        await upstream.body?.cancel().catch(() => {})
        response.end()
        return
      }
      await copyBody(upstream, response)
    })().catch((error: unknown) => {
      if (!response.headersSent) response.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' })
      if (!response.writableEnded) response.end(error instanceof Error ? error.message : 'HLS proxy request failed')
    })
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject)
      resolve()
    })
  })

  const address = server.address()
  if (!address || typeof address === 'string') {
    await closeServer(server)
    throw new Error('Could not start the local HLS download relay')
  }
  baseUrl = `http://127.0.0.1:${address.port}`
  const url = register(normalizedEntryUrl, 'playlist')
  return { url, close: () => closeServer(server) }
}
