# AniPlayV2 v1.9.0 Release Notes

## Highlights

- **Polish-subtitle catalog**: Browse and watch Polish-subtitled anime from Desu Online through a dedicated provider selector.
- **Supported native playback**: Dailymotion, Iframely-hosted Dailymotion, and Rumble streams play directly in AniPlay.
- **Browser fallback**: Episodes without a supported stream can be opened safely on their Desu Online page.
- **Provider-aware history**: Resume entries remember their catalog while existing history remains compatible.

## Desu Online Provider

- Added Desu Online as an explicit catalog option alongside AllAnime.
- Added a persistent provider selector to Browse.
- Desu results are labeled **PL SUB** and do not use the global Sub/Dub preference.
- Added parsing for Desu search results, anime episode lists, and Base64-encoded mirror entries.
- Added direct HLS resolution for Dailymotion and Rumble mirrors.
- Added support for Iframely wrappers that resolve to Dailymotion.
- Preserved AniList metadata enrichment and Discord artwork for Desu playback.

## Playback and Fallbacks

- Added scoped Electron request and response headers for Dailymotion HLS playback.
- Desu streams are marked as non-downloadable, and the download action is hidden during Desu playback.
- When no supported mirror resolves, AniPlay offers an **Open in browser** action for the selected episode.
- Browser fallback URLs are derived from the provider's episode list and validated in the main process before opening.
- MEGA, CDA, OK.ru, Byse, DoodStream/Playmogo, embedded third-party players, and Desu downloads remain unsupported.

## Reliability and Security

- Added realistic provider-specific request headers, timeouts, in-flight request deduplication, and bounded short-lived caches.
- Detects HTTP 403 responses, missing mirror data, and Cloudflare challenge pages without attempting to bypass them.
- Validates Desu anime IDs, episode URLs, decoded iframe URLs, resolved media URLs, and allowed streaming hosts.
- Returns a clear error when an episode contains only unsupported or unavailable mirrors.
- Existing history records without provider metadata automatically remain assigned to AllAnime.
- Added fixture-based tests covering search, episodes, mirror decoding, malformed data, Cloudflare challenges, Dailymotion metadata, Iframely wrappers, and Rumble embeds.

> **Availability:** Desu Online is an independent provider. Catalog access and individual mirrors may become temporarily unavailable or change without notice.

> **Downloads:** Desu playback is streaming-only in this release. Download support remains disabled until expiring links, required headers, and FFmpeg behavior can be validated reliably.

**Full changelog:** https://github.com/vorlie/AniPlayV2/compare/1.8.0...1.9.0
