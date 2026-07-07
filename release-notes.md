# AniPlayV2 v1.9.3 Release Notes

## Highlights

- Added managed in-app service notices for provider outages and important operational messages.
- AniPlay can now show a clear warning when AllAnime, Desu, or another provider is temporarily broken.
- Notices are fetched from the AniPlay CDN and cached locally, so the last valid warning remains available during temporary CDN/network failures.

## Managed Service Notices

- Added a main-process remote notice service backed by `https://cdn.vorlie.pl/aniplay/status.json`.
- Added provider-aware notices, allowing messages to target AllAnime, Desu, or all users.
- Added support for severity levels, version ranges, start/end dates, dismissible notices, and optional HTTPS detail links.
- Notice links are opened through Electron's main process after validation; the renderer never accepts arbitrary executable content.
- Notice messages render as plain text only.
- Dismissed notices are stored locally without telemetry or account tracking.

## Reliability and Safety

- Cached the last valid notice payload under Electron user data.
- Kept notice refresh failures non-blocking so playback, search, downloads, AniList, Discord Rich Presence, and updates continue normally.
- Added startup refresh and periodic background refresh with short request timeouts.
- Added schema validation to ignore malformed or unsupported notice payloads.

## Validation

- Added unit coverage for active notices, dismissed notices, unsafe links, date/version gating, and unsupported schema versions.
- Passed TypeScript production build, ESLint, and all automated tests.

**Full changelog:** https://github.com/vorlie/AniPlayV2/compare/1.9.2...1.9.3
