import { cp, mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const websiteDir = dirname(fileURLToPath(import.meta.url))
const repositoryRoot = dirname(websiteDir)
const sourceDir = join(websiteDir, 'src')
const outputDir = join(websiteDir, 'dist')
const assetsDir = join(outputDir, 'assets')

await rm(outputDir, { recursive: true, force: true })
await mkdir(assetsDir, { recursive: true })
await cp(sourceDir, outputDir, { recursive: true })
await cp(
  join(repositoryRoot, 'docs', 'assets', 'aniplay-showcase.gif'),
  join(assetsDir, 'aniplay-showcase.gif'),
)
await cp(
  join(repositoryRoot, 'ani-cli-gui', 'build', 'icon.png'),
  join(assetsDir, 'icon.png'),
)
await writeFile(join(outputDir, '.nojekyll'), '', 'utf8')

console.log(`AniPlay Pages site built at ${outputDir}`)
