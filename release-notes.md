## AniPlay 1.16.1 — Watch Together Stability Update

AniPlay 1.16.1 is a major stabilization and UX pass for the Watch Together beta introduced in 1.16.0.

### Highlights

- Redesigned the Watch Together interface with separate lobby and connected-room views.
- Added synchronized play, pause, seek, episode, and sub/dub changes.
- Added room chat, participant avatars, readiness indicators, and host identification.
- Added automatic reconnection and host transfer when the original host disconnects.
- Added `aniplay://watch/<code>` invite links with cold-start and running-app handling.
- Participants resolve streams locally, allowing different providers when necessary.

### Fixes

- Fixed playback updates creating a feedback loop and triggering “Playback commands are arriving too quickly.”
- Fixed packaged Electron builds crashing while loading `ws` with `require("events")`.
- Fixed room snapshots repeatedly restarting playback synchronization.
- Prevented guests from changing synchronized episodes or playback state.
- Prevented chat and participant updates from unnecessarily navigating the application.
- Automatically selects a direct source when an embedded player cannot be synchronized.
- Improved handling for blocked autoplay, buffering, drift correction, and reconnect failures.

### Worker improvements

- Rebuilt room coordination around Cloudflare Durable Objects and WebSocket hibernation.
- Added persistent room state, bounded chat history, participant limits, and room expiration.
- Added server-authoritative playback revisions and host roles.
- Added secure host capability tokens with only their SHA-256 hashes stored.
- Added validation, message-size limits, command throttling, and room creation/join rate limits.
- Added deterministic protocol and Durable Object integration tests.

### Privacy

Watch Together never sends media URLs, provider headers, cookies, AniList OAuth tokens, or local watch history to the coordination Worker. Each participant independently resolves and plays the episode.

Watch Together requires:

- An AniList account.
- A direct video or HLS source.
- Access to the configured Watch Together Worker.

Existing rooms from older beta builds should be recreated after updating.

### Validation

- 69 desktop tests passing.
- Worker protocol and integration tests passing.
- ESLint, TypeScript, production builds, and Wrangler deployment checks passing.