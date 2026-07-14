# AniPlay 1.12.3

AniPlay 1.12.3 adds user-facing ad blocking controls and moves embedded-player filtering into a dedicated Electron service.

## Highlights

- Added Settings -> Ad blocking with Off, EasyList only, Basic, Balanced, and Strict filter presets.
- Added a separate toggle for AniPlay's lightweight known ad-host and popup blocker.
- Added session and all-time blocked request counters for ad blocking.
- Moved adblock setup into `electron/services/adblock.ts` for easier maintenance.
- Added uBlock/uAssets preset support for EasyList, uBlock filters, badware risks, resource abuse, EasyPrivacy, quick fixes, and annoyances.
- Made EasyList only the default preset for fresh installs to reduce embed compatibility issues.
- Kept the default preset conservative for playback compatibility.

## Notes

- EasyList only is recommended for most users and for fragile embeds such as Anikoto.
- Balanced and Strict may block more clutter but can break fragile embedded players.
- Filter list loading uses cached engines when available.
- All-time block counts are stored locally with the ad blocking settings.

## Verification

- `npm test`
- `npm run lint`
- `npm run build:ui`
