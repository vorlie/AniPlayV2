import { mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(scriptDir, '..', '..')
const runtimeDir = join(projectRoot, 'showcase', 'runtime')
const outputDir = join(projectRoot, 'showcase', 'output')
const rawDir = join(outputDir, 'raw')
const screenshotDir = join(outputDir, 'screenshots')
const smoke = process.argv.includes('--smoke')
const mediaUrl = pathToFileURL(join(runtimeDir, 'aniplay-showcase.mp4')).href
const subtitleUrl = pathToFileURL(join(runtimeDir, 'aniplay-showcase.vtt')).href
const electronEnvironment = { ...process.env }
delete electronEnvironment.ELECTRON_RUN_AS_NODE

const pause = (ms) => new Promise((resolvePause) => setTimeout(resolvePause, smoke ? Math.min(ms, 80) : ms))

async function addShowcaseLayer(page) {
  await page.addStyleTag({ content: `
    #showcase-cursor { position: fixed; z-index: 2147483647; width: 24px; height: 24px; pointer-events: none; transform: translate(-2px,-2px); transition: left .28s ease, top .28s ease; filter: drop-shadow(0 2px 3px #0009); }
    #showcase-cursor::before { content: ""; display: block; width: 0; height: 0; border-top: 20px solid white; border-right: 13px solid transparent; transform: rotate(-12deg); }
    #showcase-caption { position: fixed; z-index: 2147483646; left: 50%; bottom: 42px; transform: translateX(-50%); max-width: 900px; border: 1px solid #ffffff2e; border-radius: 999px; padding: 12px 24px; background: #09070deb; color: white; font: 700 20px/1.25 "Segoe UI", sans-serif; box-shadow: 0 16px 50px #0009; opacity: 0; transition: opacity .25s ease; pointer-events: none; text-align: center; }
    #showcase-caption[data-visible="true"] { opacity: 1; }
  ` })
  await page.evaluate(() => {
    const cursor = document.createElement('div')
    cursor.id = 'showcase-cursor'
    cursor.setAttribute('aria-hidden', 'true')
    cursor.style.left = '720px'
    cursor.style.top = '450px'
    const caption = document.createElement('div')
    caption.id = 'showcase-caption'
    caption.setAttribute('aria-hidden', 'true')
    document.body.append(cursor, caption)
  })
}

async function caption(page, text, duration = 1_600) {
  await page.evaluate((value) => {
    const node = document.querySelector('#showcase-caption')
    if (!(node instanceof HTMLElement)) return
    node.textContent = value
    node.dataset.visible = 'true'
  }, text)
  await pause(duration)
  await page.evaluate(() => {
    const node = document.querySelector('#showcase-caption')
    if (node instanceof HTMLElement) node.dataset.visible = 'false'
  })
  await pause(250)
}

async function showcaseClick(page, locator) {
  await locator.waitFor({ state: 'visible' })
  const box = await locator.boundingBox()
  if (box) {
    await page.evaluate(({ x, y }) => {
      const cursor = document.querySelector('#showcase-cursor')
      if (cursor instanceof HTMLElement) {
        cursor.style.left = `${x}px`
        cursor.style.top = `${y}px`
      }
    }, { x: box.x + box.width / 2, y: box.y + box.height / 2 })
    await pause(380)
  }
  await locator.click()
  await pause(500)
}

async function openBrowse(page) {
  await showcaseClick(page, page.getByRole('button', { name: 'Browse', exact: true }))
  const search = page.getByLabel('Anime title')
  await search.fill('Starfall')
  await showcaseClick(page, page.getByRole('button', { name: 'Search', exact: true }))
  await page.getByText('Starfall Atelier', { exact: true }).last().waitFor({ state: 'visible' })
}

async function openAnime(page) {
  await openBrowse(page)
  await showcaseClick(page, page.getByText('Starfall Atelier', { exact: true }).last())
  await page.getByRole('heading', { name: 'Starfall Atelier' }).waitFor({ state: 'visible' })
}

async function startEpisode(page) {
  await openAnime(page)
  await showcaseClick(page, page.getByRole('button', { name: '1', exact: true }))
  const video = page.locator('video')
  await video.waitFor({ state: 'visible' })
  await page.waitForFunction(() => {
    const element = document.querySelector('video')
    return element instanceof HTMLVideoElement && element.readyState >= 2
  })
  await page.evaluate(() => {
    const track = document.querySelector('video')?.textTracks[0]
    if (track) track.mode = 'showing'
  })
}

const scenes = [
  {
    id: '01-anilist',
    run: async (page) => {
      await page.getByRole('heading', { name: 'AniPlayDemo', exact: true }).waitFor({ state: 'visible' })
      await caption(page, 'Your AniList profile, statistics, favourites, and achievements — ready at a glance.')
      await showcaseClick(page, page.getByRole('tab', { name: /Discover/ }))
      await page.getByText('Discover anime', { exact: true }).waitFor({ state: 'visible' })
      await caption(page, 'Explore a fixture-backed dashboard with deterministic seasonal recommendations.')
    },
  },
  {
    id: '02-browse',
    run: async (page) => {
      await showcaseClick(page, page.getByRole('button', { name: 'Browse', exact: true }))
      await caption(page, 'Search multiple catalogs without contacting a real provider in demo mode.')
      const search = page.getByLabel('Anime title')
      await search.fill('Starfall')
      await showcaseClick(page, page.getByRole('button', { name: 'Search', exact: true }))
      await page.getByText('Starfall Atelier', { exact: true }).last().waitFor({ state: 'visible' })
      await showcaseClick(page, page.getByRole('button', { name: 'Posters', exact: true }))
      await caption(page, 'Synthetic titles and artwork keep every recording safe and repeatable.')
      await showcaseClick(page, page.getByText('Starfall Atelier', { exact: true }).last())
      await page.getByRole('heading', { name: 'Starfall Atelier' }).waitFor({ state: 'visible' })
    },
  },
  {
    id: '03-playback',
    run: async (page) => {
      await startEpisode(page)
      await caption(page, 'Play a local AniPlay-branded episode with a real WebVTT subtitle track.')
      await showcaseClick(page, page.getByRole('button', { name: /Servers/ }))
      await caption(page, 'Switch servers and inspect quality without leaving the persistent player.')
    },
  },
  {
    id: '04-watch-together',
    run: async (page) => {
      await startEpisode(page)
      await showcaseClick(page, page.getByRole('button', { name: 'Watch Together', exact: true }).last())
      await page.getByRole('dialog', { name: 'Create or join a room' }).waitFor({ state: 'visible' })
      await caption(page, 'Create a private room from the current episode.')
      await showcaseClick(page, page.getByRole('button', { name: 'Create room', exact: true }))
      await page.getByText('DEMO42ROOM', { exact: true }).waitFor({ state: 'visible' })
      await caption(page, 'Participants, synchronized playback, and chat stay beside the player.')
      const message = page.getByPlaceholder('Type a message')
      await message.fill('The timing looks perfect.')
      await showcaseClick(page, page.getByRole('button', { name: 'Send', exact: true }))
      await page.getByText('The timing looks perfect.', { exact: true }).waitFor({ state: 'visible' })
    },
  },
  {
    id: '05-downloads-settings',
    run: async (page) => {
      await startEpisode(page)
      await showcaseClick(page, page.getByRole('button', { name: 'Download', exact: true }))
      await showcaseClick(page, page.getByRole('button', { name: 'Downloads', exact: true }))
      await page.getByText('Starfall Atelier - Episode 1.mp4', { exact: true }).waitFor({ state: 'visible' })
      await caption(page, 'Follow local download progress from queue to completion.')
      await page.getByText('Completed', { exact: true }).waitFor({ state: 'visible', timeout: 5_000 })
      await showcaseClick(page, page.getByRole('button', { name: 'Settings', exact: true }))
      await page.getByRole('heading', { name: 'Theme', exact: true }).waitFor({ state: 'visible' })
      await caption(page, 'Tune playback, search, downloads, privacy, and appearance in one place.')
    },
  },
]

await Promise.all([mkdir(rawDir, { recursive: true }), mkdir(screenshotDir, { recursive: true })])
const manifest = []

for (const scene of scenes) {
  const sceneUserData = join(runtimeDir, scene.id)
  await rm(sceneUserData, { recursive: true, force: true })
  const startedAt = Date.now()
  const consoleErrors = []
  const app = await electron.launch({
    args: ['.', '--demo-mode'],
    cwd: projectRoot,
    env: {
      ...electronEnvironment,
      ANIPLAY_SHOWCASE_USER_DATA: sceneUserData,
      ANIPLAY_SHOWCASE_VIDEO_URL: mediaUrl,
      ANIPLAY_SHOWCASE_SUBTITLE_URL: subtitleUrl,
    },
    ...(smoke ? {} : { recordVideo: { dir: rawDir, size: { width: 1440, height: 900 } } }),
  })

  try {
    const page = await app.firstWindow()
    await app.evaluate(async ({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0]
      window?.setSize(1440, 900)
      window?.center()
    })
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(`console: ${message.text()}`)
    })
    page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`))
    await page.evaluate(() => {
      localStorage.setItem('app.language', 'en')
      localStorage.setItem('catalog.provider', 'anikoto')
      localStorage.setItem('search.resultViewMode', 'compact')
      localStorage.setItem('player.nativeControls', 'true')
    })
    await page.reload()
    await page.getByRole('navigation', { name: 'Primary navigation' }).waitFor({ state: 'visible' })
    await addShowcaseLayer(page)
    const video = smoke ? null : page.video()
    await scene.run(page)
    await page.screenshot({ path: join(screenshotDir, `${scene.id}.png`) })
    await pause(800)
    await app.close()
    if (video) await video.saveAs(join(rawDir, `${scene.id}.webm`))

    const ignoredErrors = consoleErrors.filter((error) => !error.includes('Autoplay is only allowed'))
    if (ignoredErrors.length) throw new Error(`${scene.id} emitted renderer errors:\n${ignoredErrors.join('\n')}`)
    manifest.push({ id: scene.id, durationSeconds: Math.max(1, (Date.now() - startedAt) / 1000) })
    console.log(`Recorded ${scene.id}`)
  } catch (error) {
    await app.close().catch(() => undefined)
    throw error
  }
}

await writeFile(join(rawDir, 'manifest.json'), JSON.stringify({ width: 1440, height: 900, fps: 30, scenes: manifest }, null, 2), 'utf8')
