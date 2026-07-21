# AniPlay 1.16.0

## Watch Together beta

- Added a new Watch Together experience with room creation and joining, participant presence, chat, and basic playback-state sharing.
- Added a dedicated desktop UI panel plus player-page entry points for quick access to the feature.
- Added Electron IPC and deep-link invite handling so rooms can be joined from `aniplay://watch/<code>` links.
- Added a Cloudflare Worker and Durable Object backend for room coordination and WebSocket-based sync.

## Deployment readiness

- Added a deployable Worker package with health checks and support for custom domains such as `watch-together.vorlie.pl`.
- Defaulted the desktop app to the custom Worker URL when no override is supplied.
- Added a deployment checklist in the ignore folder to guide a safer rollout.

## Verification

- The desktop app production build succeeds.
- The Worker configuration validates successfully with Wrangler dry-run for the custom route.
