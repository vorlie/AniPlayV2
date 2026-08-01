# Troubleshooting

A field guide for the runtime errors you are most likely to see in AniPlay, the
platform quirks worth knowing, and the native-module situations that bit us in
the past. If a fix here does not work, please open an issue on
[GitHub](https://github.com/vorlie/AniPlayV2/issues) and include the platform,
provider, and episode URL where the failure appears.

---

## Table of contents

1. [General runtime issues](#general-runtime-issues)
2. [Renderer does not start](#renderer-does-not-start)
3. [Packaging and build failures](#packaging-and-build-failures)
4. [Provider and embedded-player issues](#provider-and-embedded-player-issues)
5. [Pprovider notices](#provider-notices)
6. [Downloads, FFmpeg, and HLS proxy](#downloads-ffmpeg-and-hls-proxy)
7. [Torrents and WebTorrent](#torrents-and-webtorrent)
8. [Watch Together](#watch-together)
9. [AniList authentication and secure storage](#anilist-authentication-and-secure-storage)
10. [Discord Rich Presence](#discord-rich-presence)
11. [Auto-update errors](#auto-update-errors)
12. [macOS notes](#macos-notes)
13. [Frequently asked questions](#frequently-asked-questions)

---

## General runtime issues

### Single-instance / "AniPlay is already running"

The packaged app calls `app.requestSingleInstanceLock()` at boot. If you see
a window flash and immediately exit, an earlier instance is still holding the
lock — usually because it is sitting in the tray or a previous run did not
shut down cleanly.

1. Check the Windows notification area for a hidden AniPlay icon.
2. Open **Task Manager → Details** and end any `AniPlay.exe` process.
3. Relaunch.

### Renderer reports "AniPlay API is only available in the Electron application"

This comes from `src/lib/api.ts` when a helper is called outside
`window.aniPlay`. It usually means:

- The page is being loaded in a normal browser, not the Electron shell.
- The preload bundle did not load (check `dist-electron/preload.mjs` and
  the `webPreferences.preload` value in `electron/main.ts`).
- DevTools was opened in an external Chrome instance via
  `chrome-devtools://`.

In dev, confirm `vite` is still running. In production, delete the app
`%APPDATA%/AniPlay` `webcontents.json` and let the renderer reload.

---

## Renderer does not start

### Blank or white window

Enable **Settings → Advanced → Safe graphics mode** and restart. If the UI
is still inaccessible, launch with either:

```powershell
$env:ANIPLAY_SAFE_GRAPHICS = "1"
npm run dev
```

or pass `--safe-graphics` to the packaged executable:

```powershell
.\AniPlay.exe --safe-graphics
```

This calls `app.disableHardwareAcceleration()` and adds the
`disable-gpu-compositing` Chrome switch before the window is created.

### "Renderer process gone" or "Renderer failed to load"

`electron/main.ts` logs both. Common causes:

- Stale `dist/` from a previous build → run `npm run build:ui` again.
- DevTools / Vite dev server crashed → restart with `npm run dev`.
- Antivirus quarantined a renderer asset → add an exception for
  `%APPDATA%\AniPlay\dist`.

### Renderer startup error / unhandled rejection

`src/main.tsx` installs global handlers that replace the root with a
preformatted `<pre>` block when an error fires before React mounts. The
block contains the original message. Copy it verbatim when filing a bug,
because Vite-style stack traces are missing in the production renderer.

---

## Packaging and build failures

### `npm run build:ui` fails with TypeScript errors

Make sure you are on Node.js **20.19+** or **22.12+** (the lockfile assumes
these versions). The renderer type-check (`tsc -b`) runs **before**
`vite build`, so a type regression in the main process or preload will
abort the bundle. Run `npm run lint` and `npm test` first to catch many of
these earlier.

### `electron-builder` fails to download Electron binaries

The first packaging run can take a long time while Electron tooling
prepares binaries. Windows Defender or other antivirus software can also
slow portable executable creation. If you see repeated
`ERROR_ELECTRON_BUILDER_CANNOT_DOWNLOAD`:

1. Pre-cache the Electron binaries: `npx electron-builder install-app-deps`.
2. Allow `node_modules/electron/dist/**` through your antivirus.
3. If you are behind a corporate proxy, set `HTTPS_PROXY` and run again.

### NSIS build fails because the icon is missing

`package.json → build.icon` points to `build/icon.png`. If you replace it
or ship the repo without `build/`, add `build/icon.png` back, or override
the icon in your fork.

### Forge output goes to `out/` instead of `dist/`

`electron-forge` writes to `ani-cli-gui/out/`. The Forge scripts are
`forge:start`, `forge:package`, and `forge:make`. electron-builder outputs
to `ani-cli-gui/dist/`. Both pipelines coexist — pick one for your release.

### First packaging run is slow

The first `electron-builder` invocation downloads Electron, code-signing
artifacts, and language packs and pre-extracts platform binaries. Subsequent
runs reuse the cache.

---

## Provider and embedded-player issues

### Provider search returns no results

- Check in-app **provider notices** — outages and catalog changes are
  surfaced there.
- Try another provider (Anikoto 1, Anikoto 2, AniDB.app, Desu,
  Docchi). Each maintains an independent catalog.
- Switch `sub` / `dub` — some providers only have one or the other.

### JW Player error `233011`

`233011` means a media request failed its cross-origin credential check; it
is **not** an application-folder permission error. AniPlay leaves
iframe-owned media credentials and CORS responses to the provider. If it
still occurs, note the selected provider and server, retry with ad
blocking disabled, and try another server or network. Reference:
[JW Player error reference](https://docs.jwplayer.com/players/docs/jw8-player-errors-reference).

### Embedded player opens to "site is offline" / unsupported message

Some third-party catalogs may go down without warning. The notice bar
hides only after the matching notice is dismissed. Use the **Open in
browser** action exposed by the player to switch to the provider's own
page, and try the next server.

### Strict ad blocking breaks fragile embeds

`electron/services/adblock.ts` ships three presets. **Settings →
Embedded players → Ad blocking** lets you choose between EasyList-only,
medium, and strict presets. Switch to **EasyList only** if a JW Player or
iframe provider stops loading — strict uBlock-based presets can break
fragile embeds. The same dialog also exposes the *Block known ad hosts*
toggle for the URL allow-list.

### HTTP traffic to `wixstatic.com`, `fast4speed.rsvp`, `mp4upload.com`, `dailymotion.com`, or MegaPlay

The main process installs `onBeforeSendHeaders` and `onHeadersReceived`
hooks for these hosts (see `electron/media-headers.ts`). If a download
returns `m3u8` and the file is served as `application/octet-stream`, the
hooks rewrite the response content type to
`application/vnd.apple.mpegurl` so Chromium treats it as HLS. If you are
writing your own hook, keep the MegaPlay domain list identical:
`megaplay.buzz`, `mewstream.buzz`, `lostproject.club`, `voltara.click`,
`kotocdn.site`.

---

## Provider notices

### Provider notices won't dismiss

Each notice has a stable `id` written to the user-data directory. If a
notice will not dismiss:

1. Quit AniPlay.
2. Open `%APPDATA%\AniPlay\`.
3. Remove or open `notices.json` and delete the offending `id`.

If the notices endpoint itself is offline, the banner will silently retry
on the next refresh.

---

## Downloads, FFmpeg, and HLS proxy

### FFmpeg unavailable

The Downloads tab surfaces an explicit `ffmpegUnavailable` error when the
bundled binary is missing or not executable.

- **Windows**: `ffmpeg-static` ships an `ffmpeg.exe`; `package.json →
  build.extraResources` includes it under `bin/`.
- **macOS / Linux**: `ffmpeg-static` is not officially supported for those
  targets in the current pipeline. Either install `ffmpeg` in `PATH`, or
  build with a custom `extraResources` entry.

### Downloads are stuck in `Resolving`

A single job is processed at a time (`electron/downloads/download-manager.ts`).
If the queue is stuck:

- Check that the chosen folder is writable.
- Cancel the job and retry — the manager recovers interrupted jobs on
  next launch.
- For HLS, the manager requires a reachable `m3u8` URL. The HLS proxy in
  `electron/downloads/hls-mime-proxy.ts` rewrites the MIME type so a
  misconfigured server can still be transcoded.

### `downloads:choose-directory` does nothing

The native folder picker uses `dialog.showOpenDialog` from the *main*
window. If the window is hidden behind other apps, click the AniPlay taskbar
entry first. On Linux without a desktop environment, `dialog.showOpenDialog`
will return `canceled` because no portal is available.

---

## Torrents and WebTorrent

### Torrent search returns no results

- Try the title in English; Nyaa indexes English release names most
  consistently.
- Add a **season** suffix for franchises that Nyaa separates per season.
- Fractional episodes (e.g. `12.5`) are supported.
- Nyaa availability can degrade temporarily; check the Nyaa frontpage from
  your network.

### `Could not launch mpv`

Set the `mpv` path under **Settings → Downloads → Torrent streaming →
External player path** and confirm the executable is reachable from your
account. On Linux, ensure `libmpv` is installed (the package name varies by
distro). On macOS, install mpv through Homebrew or download the binary
release.

### Peer count is `0` or transfer stalled

The torrent binding listens on `http://127.0.0.1` only. If you are
forwarding traffic through a VPN, switch to a different server or
disable the split-tunnel rule for `127.0.0.1`. The downloadable HTTP
endpoint uses an unguessable session path; do not expose it.

### Delete-after-playback deleted everything mid-stream

That setting is checked at the start of each torrent and should not
interfere with an active stream. If you see partial files being removed
early, turn **Delete after playback** off in Settings → Downloads →
Torrent streaming, then file an issue with the cache directory path.

---

## Watch Together

### "Watch Together is unavailable."

The Watch Together state is wired through `electron/services/watch-together.ts`
and a Cloudflare Worker. The `getConfig` channel returns the current
endpoint URL and human-readable message. The most common cause is a missed
deployment or the `ANIPLAY_WATCH_TOGETHER_URL` / `VITE_WATCH_TOGETHER_URL`
environment variables pointing at an old worker.

- Confirm the worker is reachable from your network.
- Verify the env vars are set on the build that produced your binary.
- For forks, deploy your own worker and override the URL.

### "Sign in to AniList before using Watch Together"

Watch Together requires a signed-in AniList identity. Sign in through
**AniList → Profile → Connect AniList** first; the identity is stored
encrypted with Electron `safeStorage`.

### "Watch Together needs a direct video or HLS source"

Watch Together synchronizes playback state. It cannot synchronize an
iframe-embedded player because the host's playhead is invisible to the
service. Switch to a non-embed source from the same provider
("Persistent player") before creating a room.

### Host disconnects; room freezes

If the host stays offline for 10 seconds, control transfers to the
longest-connected guest. If the room shows `error`, click the in-app
**Reconnect** button — the participant client re-uses the same identity
without losing the room code.

---

## AniList authentication and secure storage

### "Could not load AniList profile"

The token is stored encrypted with Electron `safeStorage`. Common causes:

1. Linux keyring is missing or locked (see next entry).
2. `ani-cli-gui/dist-electron/` was deleted between sessions, breaking the
   old ciphertext.
3. AniList revoked the OAuth token from your account settings.

Sign out and back in through *Profile → Sign out / Connect AniList*.

### AniList secure storage is unavailable on Linux

Seahorse is a keyring manager, but its presence alone does not mean the
Secret Service daemon is running, unlocked, and reachable through the
current desktop D-Bus session. Confirm that
`DBUS_SESSION_BUS_ADDRESS` is set and that GNOME Keyring or KWallet is
running in the same graphical session as AniPlay.

For GNOME, Cinnamon, XFCE, and similar desktops, AniPlay can be launched
once with Electron's explicit backend selection:

```bash
./AniPlay.AppImage --password-store=gnome-libsecret
```

KDE users can select the matching installed wallet version with
`--password-store=kwallet6` or `--password-store=kwallet5`. If an explicit
backend works, check the desktop's autostart and PAM keyring integration
rather than permanently launching an unlocked keyring by hand. Avoid
`--password-store=basic`: Electron documents that backend as plaintext-grade
fallback protection.

### AniList never returns to the callback

The callback URL is `http://127.0.0.1:42819/anilist/callback`. A
firewall or VPN that blocks the loopback will time out the OAuth handshake.
Disable the policy for `127.0.0.1` and retry.

---

## Discord Rich Presence

### "Discord not detected"

Rich Presence requires Discord Desktop running locally. Browser Discord
does **not** expose the IPC pipe AniPlay uses. Confirm the Discord client
is installed and signed in.

### Activity stuck on "Watching" while nothing plays

Rich Presence is reset on `episode-ended` and on app hide. If the state is
stuck:

- Close the active playback and reopen it.
- Force a manual reset through Settings → Player → *Clear Rich Presence*
  (the action lives behind the setting toggle).

---

## Auto-update errors

### Windows portable builds cannot auto-update

Portable Windows builds cannot update themselves in place. Download a
newer portable release manually. Automatic installation is also
unavailable in development and current Linux builds.

### Update check returns "Feed not found"

`package.json → build.publish` is configured to publish to
`github:vorlie/AniPlayV2`. Forks must override `publish.owner`, `publish.repo`,
or expose a custom feed URL through the `electron-updater` runtime.
Without a valid release manifest, `updater:check` returns `Feed not found`.

### Update download stalls or fails

`electron-updater` reports phase transitions via the `updater:changed`
push. Most stalls come from intermittent network failures. Toggle the
update off and on under *Settings → Updates* to force a clean state.

---

## macOS notes

> macOS is not currently configured for packaging. The main process
> registers the `aniplay://` protocol and `before-quit` handlers, and the
> renderer works under macOS, but no `mac` builder target exists in
> `package.json`. The watch-together protocol handler relies on
> `app.on('open-url')`, so double-clicking an `aniplay://watch/<code>`
> link while AniPlay is running requires macOS 11+.

If you run AniPlay from source on macOS:

```bash
npm ci
npm run dev   # launches Electron with the dev URL
```

If `darwin` signing is required, add a `mac` block to the `build` section
in `package.json` and provide a `CSC_LINK` / `CSC_KEY_PASSWORD` pair.

---

## Frequently asked questions

**Where is my data stored?**

Electron's user-data directory. On Windows that is `%APPDATA%\AniPlay\`.
On Linux it is `~/.config/AniPlay`. The folder contains the encrypted
AniList token, cipher-map snapshot, viewing ledger, download history,
graphics settings, and remote-notice state.

**Can I delete my data?**

Yes — quit AniPlay, remove the directory, and restart. The next launch
creates a clean state. Note that `viewing-events.v1.jsonl` is append-only
and `viewing-summary.v1.json` is rebuildable from it.

**Does AniPlay upload anything?**

AniPlay does not upload your data to a sharing service. Normal application features still contact their respective
services: playback providers, AniList, GitHub update endpoints, the
provider-status endpoint, the optional Watch Together coordination worker,
filter-list hosts, image hosts, and Discord Desktop when Rich Presence is
enabled. Opt-in torrent playback also contacts Nyaa for RSS discovery
and exchanges torrent data directly with peers.

**Why does my video not play in the in-app player but load fine in a browser?**

Most catalogs include a mix of direct and embed sources. Watch Together
and torrent streaming require direct HLS or MP4. If a provider offers
only embeds, AniPlay surfaces a browser-fallback action.

**How do I roll back to a previous build?**

Portable Windows builds are self-contained — download the previous
release's `.exe` and run it. NSIS installs can be removed through the
*Apps & features* control panel entry. Build artefacts live in
`ani-cli-gui/dist/`.

**Can I package from WSL?**

Yes, as long as the host has the Electron Builder Linux prerequisites
(typically `libnss3`, `libatk-bridge2.0-0`, `libgtk-3-0`, `libgbm1`).
The Linux target produces an AppImage and a `tar.gz`.

---

### Still stuck?

1. Search [GitHub Issues](https://github.com/vorlie/AniPlayV2/issues)
   for the same error.
2. Search or ask in the AniPlay Discord
   ([discord.gg/9SXX6ddpNR](https://discord.gg/9SXX6ddpNR)).
3. File a new issue with:
   - AniPlay version (`Help → About` or `Settings → Updates`),
   - The provider and the title you tried,
   - For renderer crashes, the preformatted `<pre>` block that replaces
     the root when an error fires before React mounts.
