# AniPlay 1.16.2

This patch completes Watch Together integration for the existing Anikoto provider.

## Anikoto Watch Together

- Anikoto now attempts to resolve a controllable native HLS stream by default.
- Watch Together automatically switches from the MegaPlay embed to the native stream.
- Play, pause, seeking, and drift correction now use the existing Watch Together synchronization system.
- Each participant resolves streams locally; media URLs are never sent through the Cloudflare Worker.
- The MegaPlay embed remains available as a normal playback fallback.

## Playback and download fixes

- Added the required MegaPlay headers for KotoCDN media.
- Added KotoCDN CORS handling in Electron.
- Applied the same provider headers to Anikoto downloads.
- Improved room matching by verifying the catalog provider as well as the show and episode.

## Fallback handling

If AniPlay cannot resolve a controllable Anikoto stream:

- Ordinary embed playback remains available.
- Watch Together displays a clear warning that synchronized playback is unavailable.
- Room creation remains disabled for embed-only playback instead of creating an unsynchronized room.

Native Anikoto resolution can be explicitly disabled with:

```text
ANIPLAY_ANIKOTO_NATIVE=false
```

## Validation

- Production build completed successfully.
- ESLint passed.
- All 74 tests passed.
- Live Anikoto testing returned both the embed fallback and a native HLS stream with subtitles.

**Full changelog:** [1.16.1...1.16.2](https://github.com/vorlie/AniPlayV2/compare/1.16.1...1.16.2)