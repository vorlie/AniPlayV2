import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ffmpegPath from 'ffmpeg-static'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(scriptDir, '..', '..')
const rawDir = join(projectRoot, 'showcase', 'output', 'raw')
const finalDir = join(projectRoot, 'showcase', 'output', 'final')
const normalizedDir = join(finalDir, 'normalized')
const docsAssetsDir = join(projectRoot, '..', 'docs', 'assets')
const mp4Path = join(finalDir, 'aniplay-showcase.mp4')
const gifPath = join(docsAssetsDir, 'aniplay-showcase.gif')
const targetWidth = 1440
const targetHeight = 900
const targetFps = 30
const maxGifBytes = 14 * 1024 * 1024

if (process.platform !== 'win32') throw new Error('The AniPlay showcase renderer currently supports Windows only.')
if (!ffmpegPath || !existsSync(ffmpegPath)) throw new Error('ffmpeg-static is unavailable. Run npm install first.')

function ffmpeg(args, label) {
  const result = spawnSync(ffmpegPath, ['-hide_banner', '-y', ...args], { cwd: projectRoot, encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`${label} failed:\n${result.stderr || result.stdout}`)
  return result
}

function durationSeconds(path) {
  const result = spawnSync(ffmpegPath, ['-hide_banner', '-i', path], { cwd: projectRoot, encoding: 'utf8' })
  const match = /Duration:\s*(\d+):(\d+):([\d.]+)/.exec(result.stderr)
  if (!match) throw new Error(`Could not determine duration for ${path}`)
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])
}

const manifest = JSON.parse(await readFile(join(rawDir, 'manifest.json'), 'utf8'))
if (!Array.isArray(manifest.scenes) || manifest.scenes.length === 0) throw new Error('No recorded showcase scenes were found.')

await rm(normalizedDir, { recursive: true, force: true })
await Promise.all([mkdir(normalizedDir, { recursive: true }), mkdir(docsAssetsDir, { recursive: true })])

const normalizedPaths = []
for (const [index, scene] of manifest.scenes.entries()) {
  const input = join(rawDir, `${scene.id}.webm`)
  if (!existsSync(input)) throw new Error(`Missing recorded scene: ${input}`)
  const duration = durationSeconds(input)
  const output = join(normalizedDir, `${String(index + 1).padStart(2, '0')}.mp4`)
  const fadeOutAt = Math.max(0.3, duration - 0.28)
  ffmpeg([
    '-i', input,
    '-vf', `scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease,pad=${targetWidth}:${targetHeight}:(ow-iw)/2:(oh-ih)/2:black,fps=${targetFps},format=yuv420p,fade=t=in:st=0:d=0.22,fade=t=out:st=${fadeOutAt.toFixed(3)}:d=0.22`,
    '-an', '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-movflags', '+faststart',
    output,
  ], `Normalizing ${scene.id}`)
  normalizedPaths.push(output)
}

const concatPath = join(normalizedDir, 'concat.txt')
const concatFile = normalizedPaths
  .map((path) => `file '${path.replaceAll('\\', '/').replaceAll("'", "'\\''")}'`)
  .join('\n')
await writeFile(concatPath, `${concatFile}\n`, 'utf8')

ffmpeg([
  '-f', 'concat', '-safe', '0', '-i', concatPath,
  '-an', '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
  mp4Path,
], 'Rendering MP4 overview')

const palettePath = join(normalizedDir, 'palette.png')
const gifFilter = 'trim=start=1.5,setpts=(PTS-STARTPTS)/2.24,fps=10,scale=800:-1:flags=lanczos'
ffmpeg(['-i', mp4Path, '-vf', `${gifFilter},palettegen=max_colors=160:stats_mode=diff`, palettePath], 'Generating GIF palette')
ffmpeg(['-i', mp4Path, '-i', palettePath, '-lavfi', `${gifFilter}[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`, '-loop', '0', gifPath], 'Rendering README GIF')

const mp4Duration = durationSeconds(mp4Path)
const mp4Size = (await stat(mp4Path)).size
const gifSize = (await stat(gifPath)).size
if (mp4Duration < 60 || mp4Duration > 90) throw new Error(`Expected a 60–90 second MP4; generated ${mp4Duration.toFixed(2)} seconds.`)
if (mp4Size === 0 || gifSize === 0) throw new Error('A rendered showcase output is empty.')
if (gifSize > maxGifBytes) throw new Error(`README GIF is ${(gifSize / 1024 / 1024).toFixed(1)} MiB; limit is 14 MiB.`)

await writeFile(join(finalDir, 'manifest.json'), JSON.stringify({
  generatedAt: new Date().toISOString(),
  mp4: { path: mp4Path, width: targetWidth, height: targetHeight, fps: targetFps, durationSeconds: mp4Duration, bytes: mp4Size },
  gif: { path: gifPath, seconds: 28, bytes: gifSize },
  screenshots: manifest.scenes.map((scene) => join(projectRoot, 'showcase', 'output', 'screenshots', `${scene.id}.png`)),
}, null, 2), 'utf8')

console.log(`Rendered ${mp4Path}`)
console.log(`Rendered ${gifPath} (${(gifSize / 1024 / 1024).toFixed(1)} MiB)`)
