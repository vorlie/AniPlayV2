# AniPlayV2

This repo is set up so users can package the app themselves on Windows.

## Project Structure

- `ani-cli-gui/` - main Electron app (UI + scraper + packaging config)

## Prerequisites

- Node.js 20+ (LTS recommended)
- npm 10+
- Windows 10/11 (for Windows packaging)

## Setup

```powershell
cd ani-cli-gui
npm install
```

## Run in Development

```powershell
npm run dev
```

## AniList Sign-In

AniPlay includes its public AniList client ID, so users can sign in without configuration. The registered redirect URL is:

```text
http://127.0.0.1:42819/anilist/callback
```

Developers and forks can override the bundled client ID when starting or packaging the app:

```powershell
$env:ANILIST_CLIENT_ID = "your-client-id"
npm run dev
```

No client secret is used or bundled. Account tokens are encrypted through Electron secure storage and kept in the application user-data directory.

## Discord Rich Presence

Discord Rich Presence is optional and disabled by default. Enable it under **Settings → Player → Discord Rich Presence** to share the current anime, episode, Sub/Dub mode, artwork, and remaining playback time on your Discord profile.

- Discord Desktop must be running locally.
- AniList playback uses the anime cover and links back to its AniList page.
- Catalog-only and legacy history playback use the static AniPlay artwork.
- Pausing freezes the displayed remaining time; ending or closing playback clears the activity.
- Developers and forks can override the bundled Discord application ID with `DISCORD_CLIENT_ID`.

## Build Options

### 1. Fast local packaged app (recommended for testing)

Creates unpacked output in `ani-cli-gui/dist/win-unpacked`.

```powershell
npm run build
```

### 2. Unpacked build (explicit)

```powershell
npm run pack:dir
```

### 3. Portable `.exe` release

```powershell
npm run build:release
```

## Alternative: Electron Forge

AniPlayV2 also supports Electron Forge as an optional packaging flow.

```powershell
cd ani-cli-gui
npm run forge:start
npm run forge:package
npm run forge:make
```

- `forge:start` runs the packaged app locally (after building renderer/main assets).
- `forge:package` creates packaged output (without installer).
- `forge:make` runs Forge makers (zip maker is configured for Windows).

## Output Paths

- Unpacked app: `ani-cli-gui/dist/win-unpacked/`
- Portable exe: `ani-cli-gui/dist/` (when using `build:release`)
- Forge packaged app: `ani-cli-gui/out/`

## Common Packaging Notes

- First packaging run may take longer (Electron binaries download).
- Antivirus/Defender can slow or appear to stall portable EXE creation.
- If portable build seems stuck, wait a few minutes before aborting.
- `npm run build` is intentionally configured to produce unpacked output quickly.

## Troubleshooting

- If the app starts with a white screen, test `dist/win-unpacked/AniPlay.exe` first.
- Rebuild cleanly:

```powershell
cd ani-cli-gui
npm run build:ui
npm run pack:dir
```

- Check terminal logs from Electron main process for renderer load errors.

## Maintenance

### Sync cipher map and scrape metadata from ani-cli

If upstream `ani-cli` changes its provider cipher mapping or core scrape constants,
you can refresh local maintenance data with:

```powershell
cd D:\Projekty\AniPlayV2
Invoke-WebRequest `
  -Uri "https://raw.githubusercontent.com/pystardust/ani-cli/refs/heads/master/ani-cli" `
  -OutFile "ignore/ani-cli"

cd ani-cli-gui
npm run sync:ciphermap
```

This script parses `ignore/ani-cli` and regenerates:

- `ignore/ciphermap.json`

Generated file includes:

- `cipherMap` hex-to-char mapping
- `userAgent`
- `referer`
- `baseDomain`
- `apiUrl`
- `modeDefault`
- `queryHash`
- `keySeed`
