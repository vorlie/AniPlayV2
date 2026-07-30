import { cp, mkdir, rm, writeFile, readdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const websiteDir = dirname(fileURLToPath(import.meta.url))
const repositoryRoot = dirname(websiteDir)
const sourceDir = join(websiteDir, 'src')
const outputDir = join(websiteDir, 'dist')
const assetsDir = join(outputDir, 'assets')

// Preserve any subdirectory that an earlier step wrote into `dist/`. The Pages
// workflow (`.github/workflows/pages.yml`) runs
// `mkdocs build --site-dir website/dist/docs` against the same directory, so
// the `docs/` folder must survive this wipe.
const RESERVED_ENTRIES = ['docs']
const stagingDir = join(websiteDir, '.dist-preserve')

try {
  await rm(stagingDir, { recursive: true, force: true })
  await mkdir(stagingDir, { recursive: true })

  for (const entry of await readdirSafe(outputDir)) {
    if (!RESERVED_ENTRIES.includes(entry)) continue
    await cp(join(outputDir, entry), join(stagingDir, entry), { recursive: true })
  }

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

  // Restore preserved subdirectories (the documentation site produced by
  // `mkdocs build --site-dir website/dist/docs`).
  for (const entry of await readdirSafe(stagingDir)) {
    await cp(join(stagingDir, entry), join(outputDir, entry), { recursive: true })
  }

  console.log(`AniPlay Pages site built at ${outputDir}`)
} finally {
  await rm(stagingDir, { recursive: true, force: true })
}

async function readdirSafe(path) {
  try {
    return await readdir(path)
  } catch (error) {
    if (error && error.code === 'ENOENT') return []
    throw error
  }
}
