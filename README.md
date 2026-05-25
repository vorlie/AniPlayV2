# AniPlayV2

AniPlayV2 is an Electron + React desktop app for browsing anime and playing streams in a modern GUI.

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

## Output Paths

- Unpacked app: `ani-cli-gui/dist/win-unpacked/`
- Portable exe: `ani-cli-gui/dist/` (when using `build:release`)

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

