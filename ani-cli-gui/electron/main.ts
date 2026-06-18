import { app, BrowserWindow, ipcMain, session, shell } from 'electron'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
import fs from 'node:fs'
import { searchAnime, getEpisodes, getEpisodeLinks, reloadCipherMap } from './scrape'

const __dirname = dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = join(__dirname, '..')
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? join(process.env.APP_ROOT, 'public') : RENDERER_DIST

let win: BrowserWindow | null
let mediaHeadersConfigured = false

function configureMediaRequestHeaders() {
  if (mediaHeadersConfigured) return
  mediaHeadersConfigured = true

  const referer = 'https://youtu-chan.com'
  const urls = [
    '*://video.wixstatic.com/*',
    '*://tools.fast4speed.rsvp/*',
    '*://*.fast4speed.rsvp/*'
  ]

  session.defaultSession.webRequest.onBeforeSendHeaders({ urls }, (details, callback) => {
    const headers = details.requestHeaders || {}
    headers['Referer'] = referer
    headers['Origin'] = referer
    if (!headers['User-Agent']) {
      headers['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:150.0) Gecko/20100101 Firefox/150.0'
    }
    callback({ requestHeaders: headers })
  })
}

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#1C1B1F',
      symbolColor: '#D0BCFF'
    },
    webPreferences: {
      preload: join(__dirname, 'preload.mjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date).toLocaleString())
  })

  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error('Renderer failed to load:', { errorCode, errorDescription, validatedURL })
  })

  win.webContents.on('render-process-gone', (_event, details) => {
    console.error('Renderer process gone:', details)
  })

  // Register the scraping handlers
  ipcMain.handle('search', async (_event, query) => {
    try {
      const results = await searchAnime(query)
      return { success: true, data: results }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('episodes', async (_event, showId) => {
    try {
      const eps = await getEpisodes(showId)
      return { success: true, data: eps }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('links', async (_event, showId, epNo) => {
    try {
      const links = await getEpisodeLinks(showId, epNo)
      return { success: true, data: links }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('open-external', async (_event, url: string) => {
    try {
      if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return { success: false }
      await shell.openExternal(url)
      return { success: true }
    } catch {
      return { success: false }
    }
  })

  ipcMain.handle('sync-ciphermap', async () => {
    try {
      // Resolve the latest release tag from GitHub API
      const releasesRes = await fetch(
        'https://api.github.com/repos/pystardust/ani-cli/releases/latest',
        { headers: { 'Accept': 'application/vnd.github+json', 'User-Agent': 'AniPlayV2' }, signal: AbortSignal.timeout(10_000) }
      )
      if (!releasesRes.ok) throw new Error(`GitHub releases API returned ${releasesRes.status}`)
      const releaseJson = await releasesRes.json() as { tag_name: string }
      const tag = releaseJson.tag_name

      const ANI_CLI_RAW = `https://raw.githubusercontent.com/pystardust/ani-cli/${tag}/ani-cli`
      const res = await fetch(ANI_CLI_RAW, { signal: AbortSignal.timeout(15_000) })
      if (!res.ok) throw new Error(`GitHub returned ${res.status} for tag ${tag}`)
      const content = await res.text()

      // ---- parse ciphermap — new format: inline s/^XX$/Y/g; entries in provider_init ----
      // The sed chain lives on one long line inside provider_init(), e.g.:
      //   s/^79$/A/g;s/^7a$/B/g;...
      const pairRegex = /s\/\^([0-9a-f]{2})\$\/((?:\\.|[^/])*)\//g
      const cipherMap: Record<string, string> = {}

      for (const match of content.matchAll(pairRegex)) {
        const hex = match[1]
        let ch = match[2]
        ch = ch
          .replace(/\\\//g, '/')
          .replace(/\\\[/g, '[')
          .replace(/\\\]/g, ']')
          .replace(/\\\(/g, '(')
          .replace(/\\\)/g, ')')
          .replace(/\\\$/g, '$')
          .replace(/\\\\/g, '\\')
        cipherMap[hex] = ch
      }

      if (Object.keys(cipherMap).length < 60) {
        throw new Error(`Parsed too few map entries (${Object.keys(cipherMap).length}); aborting`)
      }

      const readVar = (name: string) => {
        const m = content.match(new RegExp(`${name}="([^"]*)"`)) 
        return m ? m[1] : null
      }
      const queryHashMatch = content.match(/query_hash="([a-f0-9]{32,64})"/i)
      const keySeedMatch   = content.match(/printf '%s' '([^']+)' \| openssl dgst -sha256/i)

      const payload = {
        source:      `github:pystardust/ani-cli@${tag}`,
        tag,
        generatedAt: new Date().toISOString(),
        entries:     Object.keys(cipherMap).length,
        metadata: {
          userAgent:   readVar('agent'),
          referer:     readVar('allanime_refr'),
          baseDomain:  readVar('allanime_base'),
          apiUrl:      readVar('allanime_api'),
          modeDefault: readVar('mode'),
          queryHash:   queryHashMatch ? queryHashMatch[1] : null,
          keySeed:     keySeedMatch   ? keySeedMatch[1]   : null,
        },
        cipherMap,
      }

      const outPath = join(app.getPath('userData'), 'ciphermap.json')
      fs.writeFileSync(outPath, JSON.stringify(payload, null, 2) + '\n', 'utf8')

      // hot-reload into the running scraper
      reloadCipherMap(cipherMap)

      return { success: true, entries: payload.entries, generatedAt: payload.generatedAt, tag, source: payload.source }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('get-ciphermap-info', async () => {
    try {
      const outPath = join(app.getPath('userData'), 'ciphermap.json')
      if (!fs.existsSync(outPath)) return { success: true, data: null }
      const raw = fs.readFileSync(outPath, 'utf8')
      const parsed = JSON.parse(raw)
      return { success: true, data: { generatedAt: parsed.generatedAt, entries: parsed.entries, source: parsed.source, tag: parsed.tag ?? null } }
    } catch {
      return { success: true, data: null }
    }
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
    win.webContents.openDevTools()
  } else {
    const indexPath = join(RENDERER_DIST, 'index.html')
    win.loadFile(indexPath).catch((err) => {
      console.error('Failed to load renderer index.html:', indexPath, err)
    })
  }
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.whenReady().then(() => {
  configureMediaRequestHeaders()
  createWindow()
})
