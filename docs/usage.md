# Usage

This page is a tour of the AniPlay interface, the configuration options that
live in **Settings**, and the keyboard / accessibility affordances available
in the player and the Watch Together companion.

---

## UI walkthrough

The app shell (`src/App.tsx`) is composed of a draggable title bar and the
following tabs. Each tab is mounted only when active (the `Settings` page is
loaded with `React.lazy`).

```text
┌────────────────────────────────────────────────────────────┐
│  AniPlay                            [Watch Together]  Nav  │
├────────────────────────────────────────────────────────────┤
│  Remote notice banner (provider status, dismissible)        │
├────────────────────────────────────────────────────────────┤
│                                                             │
│  Active page (AniList / Browse / Player / History / …)    │
│                                                             │
├────────────────────────────────────────────────────────────┤
│  Notifications stack  ·  Watch Together setup dialog        │
└────────────────────────────────────────────────────────────┘
```

### AniList workspace (default tab)

The AniList workspace bundles three sub-views:

- **Overview** — your AniList profile, stats, achievements, and the
  1200×630 profile card exporter.
- **Discover** — trending, seasonal, and recommended anime.
- **Library** — your full list across `CURRENT`, `PLANNING`, `COMPLETED`,
  `PAUSED`, `DROPPED`, `REPEATING`. Edit progress, score, and repeats from
  the inline controls.

### Browse

The Browse tab is the catalog search surface. Pick a provider
(Anikoto 1, Anikoto 2, AllAnime, AniDB.app, Desu, Docchi), choose `sub` or
`dub`, and switch between compact-list and poster-grid layouts. The Docchi
provider exposes an opt-in for adult entries; toggle it under
**Settings → Adult content**.

### Player

The Player page is opened whenever you select an anime. Controls include:

- Source switcher (provider-specific servers, resolutions, subtitles).
- Native HTML5 video or HLS.js playback (depending on what the provider
  returns).
- Picture-in-picture, fullscreen, and an optional native browser video
  control overlay.
- Resume from the local history (up to 100 entries).
- **Try torrent** button on each title — opens the torrent source picker
  with the title prefilled.

### History

Lists every anime you have watched with a resume timestamp. The page also
handles *legacy* entries from the now-removed `miruro` provider: it prompts
for an AniDB.app match and rewrites the entry in place.

### Downloads

Shows the single-job download queue, the active target directory, and a
*Reveal* action that opens the OS file manager at the resulting file.

### Settings

Settings is a single long page split into themed sections. The exact section
list is rendered from a config object; the available sections are documented
below.

---

## Settings reference

The Settings page is rendered from the `sections` config in
`src/pages/SettingsPage.tsx`. The sections, in their on-screen order, are:

| Section | What you can change |
| --- | --- |
| **Language** | English / Polski |
| **Appearance → Accent color** | Custom Material 3 accent |
| **Appearance → Notification sounds** | `off`, `important only`, `all` |
| **Appearance → Safe graphics mode** | Disable hardware acceleration |
| **Search defaults** | Default translation (`sub` / `dub`) |
| **AniList → AniList-first search** | Use AniList to seed catalog queries |
| **AniList → Adult content opt-in** | Allow Docchi adult entries |
| **Player → Discord Rich Presence** | Toggle, requires Discord Desktop |
| **Downloads → Torrent streaming** | Cache folder, cache limit, deletion, bandwidth, mpv path, privacy consent |
| **Embedded players → Ad blocking** | EasyList-only / uBlock presets, block known ad hosts |
| **AllAnime scraper tools** | Refresh + export crypto diagnostics, sync cipher map |
| **Updates** | Check / download / install from GitHub releases |

Each toggle writes through to the Electron main process via the IPC handlers
documented on the [Architecture page](architecture.md#ipc-channel-reference).

---

## Keyboard shortcuts

AniPlay does not define a global keyboard shortcut layer — the BrowserWindow
title bar uses the standard Windows / Linux controls and the renderer
favours native HTML5 video controls (focusable media chrome). However, the
following browser/Electron-level affordances always apply:

| Shortcut | Effect |
| --- | --- |
| `F11` | Toggle fullscreen in the active BrowserWindow |
| `Esc` | Close the torrent source dialog, the Watch Together setup dialog, or any open modal |
| `Space` | Play / pause when a native video element has focus |
| `←` / `→` | Seek ±5 s in the native player (default Chromium media keys) |
| `Ctrl+R` / `Cmd+R` | Reload the renderer (dev builds only) |
| `Ctrl+Shift+I` / `Cmd+Opt+I` | Open DevTools (dev builds only) |
| Drag the title bar | Move the window |
| Double-click the title bar | Maximize / restore |

The Watch Together setup dialog accepts `Esc` to cancel and closes itself
once the room connects. The companion drawer can be collapsed with the
`Close room chat` button.

---

## Watch Together workflow

1. Start playing a direct HLS or progressive-MP4 source from any provider.
2. Click **Watch Together** in the header.
3. *Create* a room from the active player, or *Join* with a 10-character
   room code from an invite link (`aniplay://watch/<code>`).
4. Share the invite. Guests sign in to AniList, join the room, and resolve
   their own stream.
5. The host controls play / pause / seek / episode / sub-dub. If the host
   disappears for 10 seconds, control transfers to the longest-connected
   guest.

!!! note "Privacy"

    Watch Together never sends media URLs, provider headers/cookies, watch
    history, or AniList OAuth tokens to the coordination worker. Guest
    volume, mute, subtitles, fullscreen, and picture-in-picture remain local.

---

## Torrent workflow

1. Open any title in the player, click **Try torrent**.
2. Optionally fill in a season and episode.
3. Review the ranked Nyaa releases. Exact episode matches, trusted uploads,
   seed count, resolution, and codec influence the ordering. Batch releases
   surface a file picker.
4. Confirm the consent screen (peer-to-peer is opt-in).
5. Stream the selected file in AniPlay, or hand it off to `mpv` for MKV.

BitTorrent is peer-to-peer: other peers can see your public IP address, and
AniPlay uploads pieces while a torrent session is active. You are
responsible for following the laws and content licences applicable in your
region.

---

## Customizing the experience

- **Accent color** — picked from the Material 3 color utilities; stored
  in renderer state and applied through Tailwind theme variables.
- **Notification sound level** — `off` (silent), `important only` (updates
  and room events), `all` (every toast).
- **Safe graphics mode** — disables GPU compositing; useful when running
  on a remote desktop, a virtual machine, or a host with broken drivers.
- **Ad blocking** — strict presets can break fragile embeds; switch to
  EasyList-only if a provider stops loading.

---

## Exporting data

- **Profile card** — *AniList → Profile → Export* opens a native save
  dialog and writes a 1200×630 PNG generated locally from the profile SVG.
- **AllAnime diagnostic JSON** — *Settings → AllAnime scraper tools →
  Export* writes a versioned JSON containing crypto diagnostics and the
  active cipher map for compatible projects.
- **Watch history** — kept locally in Electron's user-data directory as
  `viewing-events.v1.jsonl` (append-only) and a rebuildable
  `viewing-summary.v1.json` aggregate. Both can be copied for backup.

---

## Where data lives

AniPlay keeps application state in Electron's user-data directory. In a
packaged Windows build this is normally under `%APPDATA%\AniPlay`.

Stored data includes:

- Encrypted AniList authentication token, short-lived API cache, and
  playback mappings.
- Download queue/history and the selected download directory.
- Torrent consent and settings; cached torrent pieces are stored in the
  configured local cache directory.
- Ad-block settings, remote-notice state, Discord setting, graphics
  setting, and synchronized cipher data.
- An append-only `viewing-events.v1.jsonl` ledger and rebuildable
  `viewing-summary.v1.json` aggregate.
- Renderer preferences and up to 100 resume-history entries in Chromium
  local storage.

Profile images and AllAnime diagnostic JSON files are generated locally
through native save dialogs. AniPlay does not upload them to a separate
sharing service.

---

## Pre-built releases

AniPlay is published on GitHub Releases with Windows installer, Windows
portable, Linux AppImage, and `tar.gz` artefacts. Every release carries
SHA-256 checksums; see [Installation → Pre-built releases](installation.md#pre-built-releases)
for the exact filenames, sizes, hashes, and a `curl`/`Invoke-RestMethod`
snippet that fetches them from the GitHub API.

> Need historical artefacts (1.0 → 1.17.2)? Browse
> <https://github.com/vorlie/AniPlayV2/releases>.