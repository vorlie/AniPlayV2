import { app, BrowserWindow, ipcMain, session } from 'electron'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
import { searchAnime, getEpisodes, getEpisodeLinks } from './scrape'

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
