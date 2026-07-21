# Watch Together Worker

This independently deployable Cloudflare Worker coordinates AniPlay Watch Together rooms. Each room is a SQLite-backed Durable Object using the WebSocket Hibernation API.

The Worker stores room metadata, playback state, public client-asserted AniList identity, readiness, and the last 50 chat messages. It never receives provider media URLs, request headers, cookies, AniList tokens, or local watch history.

## Local validation

```powershell
npm install
npm test
npm run check
```

`npm test` runs protocol and local Durable Object/WebSocket integration tests. `npm run check` verifies generated bindings, TypeScript, and a Wrangler deployment dry run.

For local desktop testing:

```powershell
npm run dev
$env:ANIPLAY_WATCH_TOGETHER_URL = "http://127.0.0.1:8787"
```

## Deployment

1. Authenticate Wrangler with `npx wrangler login`.
2. Review the Worker name, Custom Domain, and rate-limit namespace IDs in `wrangler.jsonc`.
3. Run `npm run deploy`.
4. Verify `https://watch-together.vorlie.pl/health` before enabling the feature in a release.

The configured `custom_domain` creates the required DNS record through Cloudflare. If a fork uses a different domain, change the route before deploying. The production desktop endpoint can be supplied with `VITE_WATCH_TOGETHER_URL`; `ANIPLAY_WATCH_TOGETHER_URL` overrides it at runtime.

## Routes and limits

- `GET /health` returns service and protocol status.
- `POST /v1/rooms` validates content/playback state and returns a ten-character Crockford Base32 code plus a 256-bit host capability.
- `GET /v1/rooms/:code/ws` upgrades to the room WebSocket.

Rooms allow 12 participants, 8 KiB protocol frames, 500-character chat messages, five chat messages per ten seconds per connection, and four host commands per second. Rooms expire after 12 hours, after 30 minutes empty, or after two minutes if their creator never connects.

Only a SHA-256 hash of the host capability is persisted. The current host alone may change playback or content. A disconnected host has ten seconds to reconnect before control transfers to the longest-connected guest.
