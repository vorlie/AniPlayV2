import fs from 'node:fs'
import path from 'node:path'

const repoRoot = path.resolve(process.cwd(), '..')
const sourcePath = path.join(repoRoot, 'ignore', 'ani-cli')
const outPath = path.join(repoRoot, 'ignore', 'ciphermap.json')

function decodeSedReplacement(raw) {
  // Decode the escape forms used in ani-cli's sed replacement set.
  return raw
    .replace(/\\\//g, '/')
    .replace(/\\\[/g, '[')
    .replace(/\\\]/g, ']')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\\\$/g, '$')
    .replace(/\\\\/g, '\\')
}

function main() {
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Source file not found: ${sourcePath}`)
  }

  const content = fs.readFileSync(sourcePath, 'utf8')

  // New format: inline s/^XX$/Y/g entries scattered through provider_init()
  // e.g.: s/^79$/A/g;s/^7a$/B/g;...
  const pairRegex = /s\/\^\(?([0-9a-f]{2})\)?\$\/((?:\\.|[^/]*))\//g
  const map = {}

  for (const match of content.matchAll(pairRegex)) {
    const hex = match[1]
    const replacement = decodeSedReplacement(match[2])
    map[hex] = replacement
  }

  if (Object.keys(map).length < 60) {
    throw new Error(`Parsed too few map entries (${Object.keys(map).length}); aborting`)
  }

  const readVar = (name) => {
    const m = content.match(new RegExp(`${name}="([^"]*)"`))
    return m ? m[1] : null
  }

  const queryHashMatch = content.match(/query_hash="([a-f0-9]{32,64})"/i)
  const keySeedMatch = content.match(/printf '%s' '([^']+)' \| openssl dgst -sha256/i)

  const metadata = {
    userAgent: readVar('agent'),
    referer: readVar('allanime_refr'),
    baseDomain: readVar('allanime_base'),
    apiUrl: readVar('allanime_api'),
    modeDefault: readVar('mode'),
    queryHash: queryHashMatch ? queryHashMatch[1] : null,
    keySeed: keySeedMatch ? keySeedMatch[1] : null
  }

  const payload = {
    source: 'ignore/ani-cli',
    generatedAt: new Date().toISOString(),
    entries: Object.keys(map).length,
    metadata,
    cipherMap: map
  }

  fs.writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  console.log(`Wrote ${payload.entries} entries to ${outPath}`)
}

main()
