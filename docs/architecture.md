# Architecture

AniPlay is a single Electron process group split into a sandboxed renderer
(React + Vite + Tailwind), a privileged main process (Node-style services
that talk to providers and the filesystem), and a context-isolated preload
that exposes a typed IPC bridge. This page describes each layer, the build
toolchain that wires them together, and the IPC channel inventory.

---

## High-level process layout

```text
┌──────────────────────────── BrowserWindow ─────────────────────────────┐
│                                                                         │
│  Renderer (React 19, Vite, Tailwind v4, Material 3)                     │
│   └── pages/      BrowsePage, AnimePage, AniListPage, …                │
│   └── components/ Navigation, RemoteNoticeBanner, AppNotifications, …   │
│   └── contexts/   WatchTogetherContext                                  │
│   └── lib/        api, history, theme, profile-share, …                 │
│         ▲                                                               │
│         │  window.aniPlay.*  (preload bridge via contextBridge)        │
│         ▼                                                               │
│  preload.mjs (ESM, sandboxed, contextIsolated)                          │
│         ▲                                                               │
│         │  ipcRenderer.invoke  /  ipcRenderer.on                        │
│         ▼                                                               │
│  Main process (CommonJS ESM, Node-like):                                │
│   ├── main.ts          window lifecycle, IPC handlers, media headers,  │
│   │                    ad-block session, single-instance lock          │
│   ├── scrape.ts        catalog provider dispatch (ani-cli style)       │
│   ├── providers/       allanime, anikoto, anikoto2, anidb, desu,       │
│   │                    docchi (each with its own .test.ts)             │
│   ├── services/        anilist, discord-presence, adblock,             │
│   │                    remote-notices, updater, viewing-log,           │
│   │                    watch-together                                  │
│   ├── downloads/       download-manager, download-utils, hls-mime-proxy│
│   ├── torrents/        nyaa, torrent-service                           │
│   ├── showcase/        demo-mode, demo-api (Playwright fixtures)       │
│   └── media-headers    MegaPlay-aware session hooks                    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Renderer process

- React 19 with concurrent features. Entry point: `ani-cli-gui/src/main.tsx`.
- Wrapped in `<StrictMode>` and a single `WatchTogetherProvider` context.
- All native side effects go through `window.aniPlay.*` (typed in
  `ani-cli-gui/src/electron-api.d.ts`).
- Tailwind v4 is used through `@tailwindcss/vite`. Custom Material 3 tokens
  live in `src/index.css`. Theme state, accent color, notification sound
  level, and the safe graphics mode toggle are rendered by
  `src/pages/SettingsPage.tsx` and persisted either to renderer localStorage
  or to the main process (graphics mode).
- `src/App.tsx` lazily imports the Settings page (`React.lazy`) and mounts
  the navigation, the remote-notice banner, the notification stack, and the
  Watch Together setup dialog.

### Preload process

- Implemented in `ani-cli-gui/electron/preload.ts` and
  compiled to `dist-electron/preload.mjs`.
- Uses `contextBridge.exposeInMainWorld('aniPlay', …)` to expose a single
  namespaced object. `nodeIntegration: false`, `contextIsolation: true`.
- A *showcase* preload swap (`SHOWCASE_PRELOAD_SWITCH`) replaces the
  production API with deterministic fixtures produced by
  `electron/showcase/demo-api.ts`. The flag is added as an Electron
  command-line argument by `shouldEnableShowcaseDemo` when packaging
  synthetic showcase builds.

### Main process

- Entry point: `ani-cli-gui/electron/main.ts`.
- Single-instance lock (`app.requestSingleInstanceLock()`), then a guard
  for `--safe-graphics` and `ANIPLAY_SAFE_GRAPHICS`.
- Constructs the long-lived services (AniList, Discord presence, downloads,
  torrent, watch together, remote notices, updater, viewing log, adblock)
  inside `app.whenReady()` and wires them up to the renderer through
  `webContents.send` callbacks.
- Customizes the session with `onBeforeSendHeaders` / `onHeadersReceived`
  hooks to inject provider-appropriate referrers and to rewrite content
  types for MegaPlay HLS / VTT manifests. See
  `ani-cli-gui/electron/media-headers.ts` for the affected host list
  (`megaplay.buzz`, `mewstream.buzz`, `lostproject.club`, `voltara.click`,
  `kotocdn.site`).

---

## Vite bundling setup

The renderer is bundled with Vite, and the Electron main / preload bundles
are produced by [`vite-plugin-electron/simple`](https://github.com/electron-vite/vite-plugin-electron)
in the same Vite invocation. The configuration lives in
`ani-cli-gui/vite.config.ts`:

```ts
plugins: [
  react(),
  tailwindcss(),
  electron({
    main: {
      entry: 'electron/main.ts',
      vite: { build: {
        rollupOptions: { external: ['hls.js', 'discord-rpc', 'cheerio',
                                    'electron-updater', 'webtorrent', 'ws'] }
      }}
    },
    preload: { input: 'electron/preload.ts' }
  })
]
```

- `react()` — JSX/React fast refresh via `@vitejs/plugin-react`.
- `tailwindcss()` — Tailwind v4 PostCSS replacement, registers
  `@tailwindcss/vite`.
- `electron(...)` — produces `dist-electron/main.js` and
  `dist-electron/preload.mjs`. The external list matches the
  production `dependencies` that ship as native or runtime-only modules
  rather than bundled code.

Two extra Vite plugins participate via `package.json → devDependencies`:

- `vite-plugin-electron` (above).
- `@tailwindcss/vite` (above).

`tsconfig.app.json` and `tsconfig.node.json` split the renderer (React /
DOM types) from the Electron-side TypeScript (Node + Electron types).
`tsc -b` is part of `npm run build:ui` and runs before `vite build` so type
errors stop the production bundle.

### Build commands and outputs

| Script | Effect |
| --- | --- |
| `npm run dev` | Vite dev server + Electron main / preload with HMR |
| `npm run build:ui` | `tsc -b && vite build` |
| `npm run preview` | `vite preview` over the built renderer (no Electron APIs) |
| `npm run pack:dir` | `build:ui` + `electron-builder --win --dir` |
| `npm run pack:portable` | `build:ui` + `electron-builder --win portable` |
| `npm run pack:linux` | `build:ui` + `electron-builder --linux` |
| `npm run forge:start` | `build:ui` + `electron-forge start` |
| `npm run forge:package` | `build:ui` + `electron-forge package` |
| `npm run forge:make` | `build:ui` + `electron-forge make` (Windows ZIP) |
| `npm run sync:ciphermap` | `node scripts/sync-ciphermap.mjs` (CI / developer maintenance) |
| `npm run showcase:*` | Playwright-driven synthetic showcase |

---

## State and component structure

The renderer is a single React tree with a few long-lived state holders.
There is **no** Redux / Zustand / MobX — React state, refs, custom hooks
in `src/contexts/`, and per-page state machines are sufficient for this
scale.

| Concern | Owner |
| --- | --- |
| Active tab, current anime, resume state, notifications | `src/App.tsx` |
| Renderer preferences (theme, accent, sound, language) | `src/lib/theme.ts`, `src/i18n.ts`, `src/lib/notification-sounds.ts` |
| AniList session & profile cache | `src/pages/AniListPage.tsx` |
| Watch Together state | `src/contexts/WatchTogetherContext.tsx` |
| Download queue | `src/pages/DownloadsPage.tsx` |
| Watch history (resume from) | `src/lib/history.ts` |
| Achievements | `src/lib/profile-achievements.ts` |
| Profile SVG export | `src/lib/profile-share.ts` |

### Cross-process data flow

```text
        ┌──────────────────────────┐
        │ React component / hook   │
        └────────────┬─────────────┘
                     │  window.aniPlay.<channel>(...)
                     ▼
        ┌──────────────────────────┐
        │ preload exposed methods  │  contextBridge
        └────────────┬─────────────┘
                     │  ipcRenderer.invoke(channel, ...args)
                     ▼
        ┌──────────────────────────┐
        │ ipcMain.handle(channel)  │  main.ts — validates origin,
        │   → requireXxx(...)      │           asserts trusted sender,
        │   → service.method(...)  │           delegates to the service
        └────────────┬─────────────┘
                     │  state changes push
                     ▼
        ┌──────────────────────────┐
        │ webContents.send(push)   │  e.g. downloads:changed,
        └──────────────────────────┘  watchTogether:changed, notices:changed,
                                    updater:changed, torrent:changed
```

The renderer receives push-style updates by subscribing through
`onChanged` (or `onInvite`) callbacks on the preload API. Each callback
returns an unsubscribe function so effects can clean up.

---

## IPC channel reference

Every IPC channel is registered through `ipcMain.handle(...)` in
`ani-cli-gui/electron/main.ts`. Inputs are
validated with helpers like `requireString`, `requireTranslationType`,
`requireCatalogProvider`, `requirePositiveInteger`, `requireDownloadRequest`,
`requireTorrentRelease`, `requireTorrentStart`, and `requireTorrentSettings`,
and every handler calls `assertTrustedSender` which checks that the
sender's frame is the renderer (dev URL or `dist/index.html`).

### Catalog

| Channel | Args | Returns |
| --- | --- | --- |
| `search` | `(query, translationType, catalogProvider, aniListFirst, includeAdult)` | `IpcResponse<AnimeSearchResult[]>` |
| `episodes` | `(showId, translationType, catalogProvider)` | `IpcResponse<string[]>` |
| `links` | `(showId, episode, translationType, catalogProvider)` | `IpcResponse<StreamLink[]>` |
| `open-provider-episode` | `(showId, episode, catalogProvider, translationType?)` | Opens a system browser to the provider page |
| `open-project-page` | `(page: 'repository' \| 'issues' \| 'pulls' \| 'discord')` | Opens a system browser |

### AllAnime diagnostics

| Channel | Args | Returns |
| --- | --- | --- |
| `get-ciphermap-info` | `()` | `{ generatedAt, entries, source, tag }` |
| `sync-ciphermap` | `()` | Fetches the upstream `ani-cli` script, parses the sed chain, writes `ciphermap.json`, and hot-reloads the live cipher map |
| `get-allanime-debug-info` | `(refresh?)` | Active cipher, runtime epoch, derived key, fallback reason, etc. |
| `export-allanime-debug-info` | `()` | Writes a versioned `aniplay-allanime-debug-YYYY-MM-DD.json` via native save dialog |

### AniList

| Channel | Args | Returns |
| --- | --- | --- |
| `anilist:auth-status` / `auth-start` / `auth-logout` | `()` | Session |
| `anilist:dashboard` | `()` | Trending / seasonal / recommended |
| `anilist:profile` | `()` | Profile summary |
| `anilist:profile-export` | `({ ...ProfileSharePayload })` | Renders the SVG → PNG (1200×630) and saves it |
| `anilist:media` / `anilist:media-search` | `(id)` / `(query)` | Details / search |
| `anilist:list-update` | `(ListUpdateInput)` | Updates an entry |
| `anilist:list-delete` | `(entryId)` | Deletes an entry |
| `anilist:mapping-resolve` / `confirm` / `forget` / `enrich` | `(media, candidates, mode)` / … | Per-mapping actions |

### Viewing log

| Channel | Args | Returns |
| --- | --- | --- |
| `viewing:get-summary` / `viewing:append` | `(WatchSegmentInput)` | Append-only `viewing-events.v1.jsonl` + rebuildable `viewing-summary.v1.json` |

### Discord Rich Presence

| Channel | Args | Returns |
| --- | --- | --- |
| `discord-presence:get-settings` / `set-enabled` / `update` / `clear` | `(enabled)` / `(playback)` | Settings state |

### Graphics

| Channel | Args | Returns |
| --- | --- | --- |
| `graphics:get-settings` / `set-safe-mode` | `(enabled)` | `{ safeGraphicsMode, active, restartRequired, launchOverride }` |

### Watch Together

| Channel | Args | Returns |
| --- | --- | --- |
| `watchTogether:get-config` / `get-state` | `()` | Config / state |
| `watchTogether:create` | `({ content, playback })` | New `WatchTogetherState` |
| `watchTogether:join` | `({ code })` | `WatchTogetherState` |
| `watchTogether:leave` / `reconnect` | `()` | — |
| `watchTogether:send-chat` | `(body)` | — |
| `watchTogether:update-playback` | `(payload)` | — |
| `watchTogether:set-content` / `set-ready` / `consume-invite` | `(content)` / `(ready)` / `(code)` | — |

Push: `watchTogether:changed`, `watchTogether:invite`.

### Ad blocking

| Channel | Args | Returns |
| --- | --- | --- |
| `adblock:get-state` / `adblock:set-settings` | `(AdBlockSettings)` | Live session filter state |

### Updater

| Channel | Args | Returns |
| --- | --- | --- |
| `updater:get-state` / `check` / `download` / `install` | `()` | Updates state from `electron-updater` |

Push: `updater:changed`.

### Remote notices

| Channel | Args | Returns |
| --- | --- | --- |
| `notices:get-state` / `notices:refresh` / `notices:dismiss` / `notices:open` | `(id)` | Notices state |

Push: `notices:changed`.

### Downloads

| Channel | Args | Returns |
| --- | --- | --- |
| `downloads:get-state` / `start` / `cancel` / `retry` / `clear-finished` / `choose-directory` / `reveal` | `(request)` / `(id)` | Per-action result |

Push: `downloads:changed`.

### Torrent

| Channel | Args | Returns |
| --- | --- | --- |
| `torrent:search` | `(query, episode)` | Nyaa releases |
| `torrent:get-state` / `torrent:start` / `torrent:select-file` / `torrent:play-external` / `torrent:stop` | `(input)` / `(index)` / `(title)` | Session state |
| `torrent:get-settings` / `torrent:set-settings` / `torrent:choose-cache-directory` | `(partial)` | Live settings |

Push: `torrent:changed`.

---

## Provider dispatcher

`electron/scrape.ts` (`ani-cli-gui/electron/scrape.ts`) dispatches
to a per-provider module under `electron/providers/`:

| File | Catalog id | Notes |
| --- | --- | --- |
| `allanime-utils.ts` | (helper) | Cipher-map runtime, crypto bootstrap, provider-owned frame detection |
| `anikoto.ts` | `'anikoto'` | MegaPlay + embed servers; default AniPlay catalog |
| `anikoto2.ts` | `'anikoto2'` | Independent anikoto.cz catalog |
| `anidb.ts` | `'anidb'` | Native AniDB.app source; supports Cloudflare verification |
| `desu.ts` | `'desu'` | Polish catalog |
| `docchi.ts` | `'docchi'` | Polish catalog with adult opt-in |
| `cda.ts` | — | Helper used by other providers |

The cipher map is hot-reloaded through
`reloadCipherMap(map)` whenever `sync-ciphermap` is invoked, and the
fallback map bundled with the app is used when no persisted map exists.

---

## Custom protocol

The packaged app registers the `aniplay://` scheme through
`app.setAsDefaultProtocolClient('aniplay')`. URLs of the form
`aniplay://watch/<10-char-code>` are parsed by
`extractWatchTogetherInvite` and delivered either:

- as a `second-instance` carry (when the user double-clicks an invite link
  while AniPlay is already running), or
- via `app.on('open-url')` on macOS, or
- from `process.argv` on cold-start.

The invite code is then dispatched to the renderer as a
`watchTogether:invite` push message.

---

## Showcase / demo mode

For deterministic UI testing, screenshots, and the animated
`docs/assets/aniplay-showcase.gif`, the renderer can be swapped at the
preload layer:

1. `shouldEnableShowcaseDemo(app.isPackaged, process.argv)` decides if
   showcase mode is on (based on the `ANIPLAY_SHOWCASE_USER_DATA`
   directory or build flags).
2. The Electron command line is seeded with `SHOWCASE_PRELOAD_SWITCH`.
3. `preload.ts` exposes `createShowcaseApi()` from
   `electron/showcase/demo-api.ts` instead of the production API.

The Playwright driver (`scripts/record.mjs`) renders each scene to
`ani-cli-gui/showcase/output/`, then `scripts/render.mjs` stitches the
final MP4 / GIF used on the home page.