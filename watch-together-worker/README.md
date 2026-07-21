# Watch Together Worker

This Worker package contains the minimal Watch Together coordination layer for AniPlay.

## Deploy

1. Install dependencies with `npm install`.
2. Set `VITE_WATCH_TOGETHER_URL` in the desktop app build or `ANIPLAY_WATCH_TOGETHER_URL` at runtime.
3. Run `npm run deploy`.

For the current setup, the desktop app defaults to `https://watch-together.vorlie.pl` when no override is provided.

## Routes

- `GET /health`
- `POST /v1/rooms`
- `GET /v1/rooms/:code/ws`
