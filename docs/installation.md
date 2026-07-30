# Installation

This page walks you through every supported way to install AniPlay — from a
local development checkout to packaged portable, NSIS installer, AppImage,
and `tar.gz` binaries. It also covers the optional system dependencies (mpv,
keyring daemons) that unlock the full feature set.

---

## Requirements

### Required

| Requirement | Version | Notes |
| --- | --- | --- |
| Node.js | `20.19+` or `22.12+` | `22.x` LTS is recommended |
| npm | latest stable | ships with Node.js; lockfile is included in the repo |
| Git | latest stable | needed to clone and contribute |
| Windows | 10 / 11 | primary development and packaging platform |

### Optional

- **mpv** — needed for torrent containers Chromium cannot play natively
  (MKV, AVI, FLV, etc.). Install it in `PATH`, or set the path under
  **Settings → Downloads → Torrent streaming**.
- **libsecret / GNOME Keyring / KWallet** — Linux only; required for AniList
  token storage.
- **Docker / sandbox root** — only if you want to test packaging inside a
  clean Linux container.

> macOS is **not** currently configured for packaging. Linux packaging works
> but receives less coverage than Windows.

---

## Package manager

The repo ships an `npm` lockfile. Either `npm ci` or `npm install` work, but
`npm ci` is preferred for a reproducible checkout:

```powershell
npm ci
```

If you actively develop dependencies, run `npm install` instead. The dev
toolchain relies on `tsx`, `vite`, `electron-builder`, `@electron-forge/cli`,
and `playwright` — all of which are listed in `devDependencies` and installed
automatically.

`pnpm` and `yarn` are not officially supported. The Vite Electron plugin and
the published scripts assume an npm-style lockfile and `node_modules` layout.

---

## Clone the repository

```powershell
git clone https://github.com/vorlie/AniPlayV2.git
cd AniPlayV2\ani-cli-gui
```

All commands below assume this working directory.

---

## Pre-built releases

If you only want to run AniPlay, grab one of the official GitHub release
assets. The 1.17.2 release ships with:

| Asset | Platform | Format | Size |
| --- | --- | --- | --- |
| [`AniPlay-Setup-1.17.2-x64.exe`](https://github.com/vorlie/AniPlayV2/releases/download/1.17.2/AniPlay-Setup-1.17.2-x64.exe) | Windows 10 / 11 (x64) | NSIS installer | ~212 MiB |
| [`AniPlay-Portable-1.17.2-x64.exe`](https://github.com/vorlie/AniPlayV2/releases/download/1.17.2/AniPlay-Portable-1.17.2-x64.exe) | Windows 10 / 11 (x64) | Single-file portable | ~212 MiB |
| [`AniPlay-1.17.2.AppImage`](https://github.com/vorlie/AniPlayV2/releases/download/1.17.2/AniPlay-1.17.2.AppImage) | Linux (x64) | AppImage | ~293 MiB |
| [`ani-cli-gui-1.17.2.tar.gz`](https://github.com/vorlie/AniPlayV2/releases/download/1.17.2/ani-cli-gui-1.17.2.tar.gz) | Linux (x64) | `tar.gz` archive | ~277 MiB |
| [`latest.yml`](https://github.com/vorlie/AniPlayV2/releases/download/1.17.2/latest.yml) | Windows / Linux | Auto-update manifest | < 1 KiB |
| `*.blockmap` | Windows | Differential update map | < 1 MiB |

Download everything in one go with `curl`, then verify with the SHA-256
checksums the GitHub API returns for the same release:

````powershell
# 1. Inspect the release (size, asset names, checksums)
$release = Invoke-RestMethod `
  -Uri "https://api.github.com/repos/vorlie/AniPlayV2/releases/tags/1.17.2"

$release.assets |
  Select-Object name, size, @{n='sha256';e={
    ($_.digest -replace '^sha256:','').ToLowerInvariant()
  }}, browser_download_url |
  Format-Table -AutoSize

# 2. Download the Windows portable build (use -L to follow redirects,
#    -O to keep the remote filename, and -# for a compact progress bar)
curl.exe -L -O `
  https://github.com/vorlie/AniPlayV2/releases/download/1.17.2/AniPlay-Portable-1.17.2-x64.exe

# 3. Verify the SHA-256 of the downloaded artefact
Get-FileHash AniPlay-Portable-1.17.2-x64.exe -Algorithm SHA256
````

````sh
# bash
curl -s https://api.github.com/repos/vorlie/AniPlayV2/releases/tags/1.17.2 |
  jq '.assets[] | {name, size, sha256: (.digest | sub("^sha256:"; "")), url: .browser_download_url}'

curl -L -O https://github.com/vorlie/AniPlayV2/releases/download/1.17.2/AniPlay-Portable-1.17.2-x64.exe
sha256sum AniPlay-Portable-1.17.2-x64.exe
````

Expected SHA-256 sums for 1.17.2:

| Asset | SHA-256 |
| --- | --- |
| `AniPlay-Setup-1.17.2-x64.exe` | `7e0f5772b2de892c6108e1dc4efd8339088a3399df2684676fdd8126e9e88caf` |
| `AniPlay-Portable-1.17.2-x64.exe` | `23f9e28a690a3cb784f9d85504f2dc7421dda95844c56154865fea0e960a619a` |
| `AniPlay-1.17.2.AppImage` | `8559f2aa2576efaffdbb85db973d90ad061d3ef9828d6d83717afa2d02261f3d` |
| `ani-cli-gui-1.17.2.tar.gz` | `f8ef1441864323b6b3a7717c86e5853784562099507e1f89ec47d5719862d34f` |

> The SHA-256 values come straight from
> `GET https://api.github.com/repos/vorlie/AniPlayV2/releases/tags/1.17.2`,
> so the table never goes stale by hand: re-run the `curl`/`Invoke-RestMethod`
> snippet whenever you need to verify a newer release.

The Windows **NSIS installer** registers `aniplay://` as a custom URI scheme
and adds an *Uninstall* entry to **Settings → Apps**, so it is the right
choice for most desktop users. The **portable** build is identical except
that nothing is registered with the system — drop it on a USB stick or run
it from a folder without admin rights.

On Linux, mark the AppImage as executable and double-click it (or run
`./AniPlay-1.17.2.AppImage`). For headless servers, unpack the `tar.gz`
and launch the contained `ani-cli-gui` binary.

---

## Development setup

### Run AniPlay in dev mode

```powershell
npm run dev
```

This invokes `vite` and uses `vite-plugin-electron/simple` to:

1. Start the Vite dev server for the renderer (`http://localhost:5173`).
2. Bundle `electron/main.ts` to `dist-electron/main.js`.
3. Bundle `electron/preload.ts` to `dist-electron/preload.mjs`.
4. Launch Electron with `VITE_DEV_SERVER_URL` set, so the BrowserWindow
   loads the live Vite URL and DevTools opens automatically.

Hot module reload applies to the renderer. Main-process changes require a
full restart (`Ctrl+C` → `npm run dev`).

### Other development scripts

| Command | Purpose |
| --- | --- |
| `npm run build:ui` | Type-check with `tsc -b` and produce a production Vite bundle |
| `npm run preview` | Preview the built renderer only — Electron APIs are unavailable |
| `npm test` | Run the Vitest suite once |
| `npm run lint` | Run ESLint across the project |

### Auto-generate the showcase

The showcase is what produced the GIF on the home page. It requires
Playwright + ffmpeg. Each stage is its own script so you can re-run
individual pieces:

| Command | Purpose |
| --- | --- |
| `npm run showcase:install` | Downloads the Playwright ffmpeg binary (tooling setup, not runtime traffic) |
| `npm run showcase:prepare` | Runs `node showcase/scripts/prepare.mjs` to stage fixtures |
| `npm run showcase:record` | `npm run build:ui` + `node showcase/scripts/record.mjs` to capture each scene |
| `npm run showcase:render` | `node showcase/scripts/render.mjs` to stitch the final MP4, screenshots, and GIF |
| `npm run showcase:test` | Smoke pass — runs `prepare`, builds the UI, and invokes `record.mjs --smoke` without keeping video |
| `npm run showcase` | The full PowerShell pipeline (`showcase/scripts/showcase.ps1`) on Windows: install → prepare → record → render |

The result lands in `ani-cli-gui/showcase/output/final/`.

### Maintain the developer cipher map

The in-app scraper page can synchronize its runtime map automatically.
For a repository-side maintenance snapshot, download upstream `ani-cli` and
run the parser:

```powershell
cd D:\Projekty\AniPlayV2
Invoke-WebRequest `
  -Uri "https://raw.githubusercontent.com/pystardust/ani-cli/refs/heads/master/ani-cli" `
  -OutFile "ignore/ani-cli"

cd ani-cli-gui
npm run sync:ciphermap
```

This writes `ignore/ciphermap.json` with the hex-to-character map and
extracted user agent, referer, base/API domains, default mode, query hash,
and key seed.

---

## Build packaged binaries

AniPlay ships two packaging pipelines:

1. **`electron-builder`** (default for release artefacts).
2. **`@electron-forge/cli`** (alternative ZIP + start scripts).

### electron-builder targets

```powershell
# Unpacked Win32 directory — fastest for iteration
npm run pack:dir

# Portable Windows executable (single .exe, no installer)
npm run pack:portable

# Alias for the portable build (used by CI releases)
npm run build:release

# Linux AppImage + tar.gz
npm run pack:linux

# Unpacked dir build (alias of pack:dir)
npm run build
```

### electron-forge targets

```powershell
npm run forge:start    # build assets + run through Electron Forge
npm run forge:package  # create an unpacked Forge package
npm run forge:make     # build the configured Windows ZIP maker
```

### Output locations

| Artefact | Path |
| --- | --- |
| Renderer assets | `ani-cli-gui/dist/` |
| Electron main / preload bundles | `ani-cli-gui/dist-electron/` |
| Windows unpacked app | `ani-cli-gui/dist/win-unpacked/` |
| Windows portable / NSIS installer | `ani-cli-gui/dist/` |
| Linux AppImage + tar.gz | `ani-cli-gui/dist/` |
| Electron Forge output | `ani-cli-gui/out/` |

The first packaging run can take longer while Electron tooling prepares
binaries. Windows Defender or other antivirus software can also slow portable
executable creation — allow extra time on the first run.

### Bundle details

The `package.json → build` block configures:

- **appId**: `com.aniplayv2.app`
- **productName**: `AniPlay`
- **icon**: `build/icon.png`
- **protocols**: `aniplay://` (Watch Together invites)
- **Win targets**: `portable`, `nsis`
- **NSIS**: `oneClick: false`, user can change the install directory
- **Linux targets**: `AppImage`, `tar.gz`
- **extraResources**: bundled `ffmpeg-static` binaries, the
  `THIRD_PARTY_NOTICES.md` file, and the safe-graphics launch helpers

---

## AniList authentication

AniPlay bundles its public AniList client ID, so normal users do not need to
configure one. The registered OAuth redirect is:

```text
http://127.0.0.1:42819/anilist/callback
```

Developers and forks can override the client ID via:

=== "Windows PowerShell"

    ```powershell
    $env:ANILIST_CLIENT_ID = "your-client-id"
    npm run dev
    ```

=== "Cross-platform shell"

    ```bash
    ANILIST_CLIENT_ID=your-client-id npm run dev
    ```

`VITE_ANILIST_CLIENT_ID` is also recognized for compatibility. No client
secret is used or bundled. The account token is encrypted with Electron
`safeStorage` and stored in the Electron user-data directory.

---

## Optional environment variables

All variables are read in the main process unless marked otherwise.

| Variable | Scope | Effect |
| --- | --- | --- |
| `ANILIST_CLIENT_ID` | Main | Override the bundled public AniList client ID |
| `VITE_ANILIST_CLIENT_ID` | Renderer | Compatibility fallback for the AniList client ID |
| `DISCORD_CLIENT_ID` | Main | Override the bundled Discord application ID |
| `ANIPLAY_SAFE_GRAPHICS=1` | Main | Disable hardware acceleration for the current launch |
| `ANIPLAY_DEBUG_ALLANIME=true` | Main | Log classified AllAnime episode-response diagnostics |
| `ANIPLAY_DEBUG_ALLANIME=full` | Main | Include full AllAnime response bodies in logs — use carefully |
| `ANIPLAY_ANIKOTO_NATIVE=true` | Main | Experimentally attempt native MegaPlay source extraction |
| `ANIPLAY_STATUS_URL` | Main | Override the remote provider-status document URL |
| `ANIPLAY_WATCH_TOGETHER_URL` | Main | Override the Watch Together Worker endpoint at runtime |
| `VITE_WATCH_TOGETHER_URL` | Renderer | Set the Watch Together Worker endpoint for a release build |

Safe graphics mode can also be enabled persistently in **Settings →
Advanced**, or for one launch with `--safe-graphics`:

```powershell
.\AniPlay.exe --safe-graphics
```

---

## Install docs locally

These docs are built with [MkDocs Material](https://squidfunk.github.io/mkdocs-material/).
To render them locally:

```powershell
python -m pip install mkdocs-material
mkdocs serve            # http://127.0.0.1:8000
mkdocs build --site-dir website/dist/docs
```

The GitHub Pages workflow (`.github/workflows/pages.yml`) runs the same
`mkdocs build` command on every push to `main` and publishes the result as
the `/docs/` sub-path of the AniPlay website.