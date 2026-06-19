import express from 'express'
import cors from 'cors'
import { createProxyMiddleware } from 'http-proxy-middleware'
import { join } from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { app } from 'electron'
import { searchAnime, getEpisodes, getEpisodeLinks } from './scrape'

let currentServer: any = null
let currentPort: number | null = null

export interface ClientInfo {
  ip: string
  lastSeen: number
}

const activeClients = new Map<string, ClientInfo>()

let cachedHeaders: { referer?: string, userAgent?: string } = {}
let lastHeaderCheck = 0

function getDynamicHeaders() {
  const now = Date.now()
  // Cache the parsing of ciphermap to avoid blocking the thread every few ms on small video chunks
  if (now - lastHeaderCheck < 60_000) return cachedHeaders
  lastHeaderCheck = now
  
  try {
    const outPath = join(app.getPath('userData'), 'ciphermap.json')
    if (fs.existsSync(outPath)) {
      const raw = fs.readFileSync(outPath, 'utf8')
      const parsed = JSON.parse(raw)
      if (parsed?.metadata) {
         if (parsed.metadata.referer) cachedHeaders.referer = parsed.metadata.referer
         if (parsed.metadata.userAgent) cachedHeaders.userAgent = parsed.metadata.userAgent
      }
    }
  } catch(e) {}
  
  return cachedHeaders
}

export function getLocalIPs(): string[] {
  const interfaces = os.networkInterfaces()
  const ips: string[] = []
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name] || []) {
      // 169.254.x.x addresses are APIPA (Automatic Private IP Addressing), essentially link-local or failed DHCP
      if (net.family === 'IPv4' && !net.internal && !net.address.startsWith('169.254.')) {
        ips.push(net.address)
      }
    }
  }
  
  // Best-effort sort to put real local networks first over VPN dummy adapters
  return ips.sort((a, b) => {
    const score = (ip: string) => {
      if (ip.startsWith('192.168.')) return 3
      if (ip.startsWith('172.')) return 2
      if (ip.startsWith('10.')) return 1
      return 0
    }
    return score(b) - score(a)
  })
}

export function startServer(port: number, rendererDist: string): { success: boolean, ip?: string, port?: number, error?: string } {
  if (currentServer) {
    return { success: true, ip: getLocalIPs()[0] || '127.0.0.1', port: currentPort! }
  }

  const app = express()
  app.use(cors())

  // Middleware to track clients
  app.use((req, res, next) => {
    let ip = req.headers['x-forwarded-for'] as string || req.socket.remoteAddress || 'unknown'
    // Normalize IPv6 mapped IPv4
    if (ip.startsWith('::ffff:')) {
      ip = ip.substring(7)
    }
    activeClients.set(ip, { ip, lastSeen: Date.now() })
    next()
  })

  app.get('/api/search', async (req, res) => {
    try {
      const q = req.query.q as string
      const results = await searchAnime(q || '')
      res.json({ success: true, data: results })
    } catch (e: any) {
      res.json({ success: false, error: e.message })
    }
  })

  app.get('/api/episodes', async (req, res) => {
    try {
      const id = req.query.id as string
      const eps = await getEpisodes(id)
      res.json({ success: true, data: eps })
    } catch (e: any) {
      res.json({ success: false, error: e.message })
    }
  })

  app.get('/api/links', async (req, res) => {
    try {
      const id = req.query.id as string
      const ep = req.query.ep as string
      const links = await getEpisodeLinks(id, ep)
      
      // Rewrite the stream URLs for the web client so they pass through our proxy
      if (Array.isArray(links)) {
        for (const link of links) {
          try {
            const url = new URL(link.url)
            const proto = url.protocol.replace(':', '')
            link.url = `/proxy/${proto}/${url.host}${url.pathname}${url.search}`
          } catch {}
        }
      }
      
      res.json({ success: true, data: links })
    } catch (e: any) {
      res.json({ success: false, error: e.message })
    }
  })

  // Stream Proxy to bypass CORS/Hotlinking restrictions on remote browsers
  app.use('/proxy', createProxyMiddleware({
    target: 'https://youtu-chan.com', // dummy default
    changeOrigin: true,
    router: (req) => {
      // req.url here is e.g. /https/tools.fast4speed.rsvp/...
      const parts = (req.url || '').split('/')
      if (parts.length >= 3) {
        return `${parts[1]}://${parts[2]}`
      }
      return undefined
    },
    pathRewrite: (path, req) => {
      // Since it's mounted at /proxy, path is /https/tools.fast4speed.rsvp/media9/...
      const parts = path.split('/')
      return '/' + parts.slice(3).join('/')
    },
    on: {
      proxyReq: (proxyReq) => {
        const dyn = getDynamicHeaders()
        const referer = dyn.referer || 'https://youtu-chan.com'
        const userAgent = dyn.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:150.0) Gecko/20100101 Firefox/150.0'
        
        proxyReq.setHeader('Referer', referer);
        proxyReq.setHeader('Origin', referer);
        proxyReq.setHeader('User-Agent', userAgent);
      }
    }
  }))

  // Serve static UI. Needs dist directory.
  app.use(express.static(rendererDist))
  // Fallback for React Router
  app.use((req, res) => {
    res.sendFile(join(rendererDist, 'index.html'))
  })

  try {
    currentServer = app.listen(port, '0.0.0.0', () => {
      currentPort = port
      console.log(`Local network server exposed on port ${port}`)
    })
    const ips = getLocalIPs()
    return { success: true, ip: ips[0] || '127.0.0.1', port }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

export function stopServer(): boolean {
  if (currentServer) {
    currentServer.close()
    currentServer = null
    currentPort = null
    activeClients.clear()
    return true
  }
  return false
}

export function getClients(): ClientInfo[] {
  // Filter out clients older than 30 minutes
  const now = Date.now()
  const timeout = 30 * 60 * 1000
  
  for (const [ip, info] of activeClients.entries()) {
    if (now - info.lastSeen > timeout) {
      activeClients.delete(ip)
    }
  }
  return Array.from(activeClients.values()).sort((a, b) => b.lastSeen - a.lastSeen)
}

export function getServerStatus(): { active: boolean, ip?: string, port?: number } {
  if (currentServer && currentPort) {
    return { active: true, ip: getLocalIPs()[0] || '127.0.0.1', port: currentPort }
  }
  return { active: false }
}
