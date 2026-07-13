# AniPlay 1.12.2

AniPlay 1.12.2 improves Polish provider playback coverage and continues the Electron maintenance cleanup.

## Highlights

- Added CDA embed support for Desu and Docchi entries that use `ebd.cda.pl` players.
- CDA entries are shown as embedded servers in the player instead of being dropped as unsupported mirrors.
- CDA embeds remain non-downloadable in AniPlay because CDA may expose separate video and audio media files behind the embed.
- Removed a redundant iframe fullscreen attribute that caused a React console warning.
- Reorganized Electron internals into provider, service, and download folders for easier maintenance.

## Notes

- CDA playback uses the provider embed page.
- AniPlay does not automatically download or mux CDA video/audio streams in this release.
- Dailymotion mirrors can still be limited by upstream player/CORS behavior and may require browser fallback.
- Existing Mega, Rumble, Docchi, Desu, and AllAnime behavior is unchanged.

## Verification

- `npm test`
- `npm run lint`
- `npm run build:ui`

