# AniDB.app provider

AniPlay uses AniDB.app as an independent English catalog provider. It is unrelated to the metadata database at `anidb.net`.

## Request flow

1. Search calls `https://anidb.app/search/suggestions?q=...` and parses every returned anime card.
2. AniPlay stores a prefixed, Base64URL-encoded ID containing the native numeric ID and canonical slug.
3. Episodes come from `/api/frontend/anime/{id}/episodes`.
4. Audio choices come from `/api/frontend/episode/{episodeId}/languages`. Sub requires `jpn`; dub requires `eng`.
5. AniPlay loads the selected embed, extracts native HTTPS MP4/HLS sources and subtitle tracks, and expands HLS master qualities.
6. The embed origin, referer, and browser user agent are retained for playback and FFmpeg downloads.

AniPlay never silently changes the selected audio language. If a native source cannot be resolved, the browser fallback opens the canonical AniDB.app title page.

## Cloudflare verification

AniDB.app may return a managed browser challenge even when requests use normal browser headers. AniPlay keeps this provider in an isolated persistent Electron session. When verification is required, it opens a sandboxed AniDB.app window that shares only that provider session, then retries the original operation once.

The verification window has Node.js disabled, rejects permissions, popups, downloads, non-HTTPS navigation, and navigation away from AniDB.app. AniPlay does not implement a challenge bypass.

## Adult content

Adult results remain disabled by default. The shared adult-content setting applies to both Docchi and AniDB.app and migrates the previous Docchi-only preference.

## Troubleshooting

- A 429 response means AniDB.app has rate limited the current connection. Wait before retrying.
- Repeated verification generally indicates the network or IP address is being challenged. A different network may behave differently.
- “Selected language unavailable” means that episode does not expose the requested `jpn` or `eng` entry.
- Provider HTML and private endpoints can change without notice. Update parser fixtures alongside any resolver change.
