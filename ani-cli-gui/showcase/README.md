# AniPlay showcase generator

This directory contains AniPlay's deterministic, Windows-only renderer showcase pipeline. It records the real Electron renderer with Playwright while replacing the preload API with local fixtures.

## Generate the showcase

From `ani-cli-gui/`, install the repository dependencies and run:

```powershell
npm ci
npm run showcase
```

The command installs Playwright's small FFmpeg recording helper when necessary, clears old showcase runtime data, builds AniPlay, records five independent scenes, and renders:

- `showcase/output/final/aniplay-showcase.mp4`: the 1440 x 900, 30 fps, 60–90 second overview.
- `showcase/output/screenshots/*.png`: one representative image per scene.
- `docs/assets/aniplay-showcase.gif`: the accelerated, compressed README preview.

Runtime data, raw WebM clips, screenshots, and the local MP4 are ignored by Git. Only the README GIF is tracked.

Use `npm run showcase:test` for a quicker smoke pass that runs every interaction without retaining video. Individual stages are available as `showcase:prepare`, `showcase:record`, and `showcase:render`.

## What is recorded

The modular scenes cover:

1. AniList profile, statistics, achievements, and discovery.
2. Catalog selection, search, poster results, and anime selection.
3. Episode playback, a real WebVTT subtitle track, and server controls.
4. Watch Together room creation, participants, synchronized playback, and chat.
5. Download progress and application settings.

Each run uses fixed titles, artwork, identities, timestamps, room state, messages, download progress, and locally generated video. A visible cursor and explanatory captions are injected only into the recorded renderer.

## Safety boundaries

Public `--demo-mode` is accepted only by an unpackaged Electron main process. The main process then passes a separate internal switch to preload; adding that internal switch to a packaged executable does not enable demo mode.

In demo mode:

- Electron uses a fresh directory under `showcase/runtime` for `userData`.
- Preload exposes the in-memory fixture adapter instead of production IPC.
- Provider, AniList, Discord, GitHub, updater, notice, and Watch Together services are not initialized.
- The synthetic episode and subtitles are loaded from local files generated with the bundled `ffmpeg-static`.
- No real account data, credentials, anime footage, or production room is used.

The Playwright dependency download performed by `showcase:install` is tooling setup, not traffic from the running demo application.

## Limitations

This version captures the Electron renderer. Native file dialogs, the title bar, tray menus, notifications outside the renderer, Discord windows, external players, and other desktop surfaces are intentionally excluded. The pipeline is local-only and is not run in GitHub Actions.

If recording exits before the first scene and Playwright's helper was not installed, run:

```powershell
npm run showcase:install
```

If an interrupted run leaves Electron processes open, close the development AniPlay window before trying again. The pipeline resets only `showcase/runtime` and `showcase/output`; it never removes normal AniPlay user data.
