import { mkdir, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ffmpegPath from 'ffmpeg-static'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(scriptDir, '..', '..')
const showcaseRoot = join(projectRoot, 'showcase')
const runtimeDir = join(showcaseRoot, 'runtime')
const outputDir = join(showcaseRoot, 'output')
const mediaPath = join(runtimeDir, 'aniplay-showcase.mp4')
const subtitlePath = join(runtimeDir, 'aniplay-showcase.vtt')

if (process.platform !== 'win32') {
  throw new Error('The AniPlay showcase generator currently supports Windows only.')
}
if (!ffmpegPath || !existsSync(ffmpegPath)) {
  throw new Error('ffmpeg-static is unavailable. Run npm install before generating the showcase.')
}

await Promise.all([rm(runtimeDir, { recursive: true, force: true }), rm(outputDir, { recursive: true, force: true })])
await Promise.all([
  mkdir(runtimeDir, { recursive: true }),
  mkdir(join(outputDir, 'raw'), { recursive: true }),
  mkdir(join(outputDir, 'screenshots'), { recursive: true }),
  mkdir(join(outputDir, 'final'), { recursive: true }),
])

const windowsDir = process.env.WINDIR ?? 'C:\\Windows'
const fontPath = join(windowsDir, 'Fonts', 'segoeuib.ttf').replaceAll('\\', '/').replace(':', '\\:')
const filter = [
  'drawbox=x=0:y=0:w=iw:h=ih:color=#0b0910:t=fill',
  'drawbox=x=80:y=80:w=1120:h=560:color=#21172e:t=fill',
  'drawbox=x=80+mod(t*90\\,920):y=500:w=180:h=8:color=#ff5b3d:t=fill',
  `drawtext=fontfile='${fontPath}':text='AniPlay':fontcolor=#ff5b3d:fontsize=86:x=(w-text_w)/2:y=220`,
  `drawtext=fontfile='${fontPath}':text='A synthetic showcase - no provider traffic':fontcolor=white:fontsize=32:x=(w-text_w)/2:y=340`,
  `drawtext=fontfile='${fontPath}':text='Episode 1  |  English subtitles':fontcolor=#c9b9d8:fontsize=24:x=(w-text_w)/2:y=405`,
].join(',')

const ffmpeg = spawnSync(ffmpegPath, [
  '-hide_banner', '-loglevel', 'error', '-y',
  '-f', 'lavfi', '-i', 'color=c=#0b0910:s=1280x720:r=30:d=18',
  '-vf', filter,
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
  mediaPath,
], { cwd: projectRoot, encoding: 'utf8' })

if (ffmpeg.status !== 0) {
  throw new Error(`Synthetic media generation failed:\n${ffmpeg.stderr || ffmpeg.stdout}`)
}

await writeFile(subtitlePath, `WEBVTT

00:00:01.000 --> 00:00:05.000
Welcome to the deterministic AniPlay showcase.

00:00:06.000 --> 00:00:11.000
Everything on screen is generated locally.

00:00:12.000 --> 00:00:17.000
No anime footage, accounts, or provider requests are used.
`, 'utf8')

await writeFile(join(runtimeDir, 'fixture.json'), JSON.stringify({
  generatedAt: '2026-07-23T12:00:00.000Z',
  media: mediaPath,
  subtitles: subtitlePath,
  roomCode: 'DEMO42ROOM',
}, null, 2), 'utf8')

console.log(`Prepared showcase fixtures in ${runtimeDir}`)
