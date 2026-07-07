# AniPlayV2 v1.9.4 Release Notes

## Highlights

- Added Miruro as a new English anime catalog provider.
- Restored AllAnime episode source lookup after the latest upstream crypto change.
- Miruro entries can be opened directly in the browser when native stream extraction is blocked by provider-side protections.

## Provider Updates

- Added Miruro to the catalog selector as `Miruro · EN`.
- Added Miruro search, episode listing, source probing, playback history, notice targeting, and browser fallback wiring.
- Added Miruro and UltraCloud request headers for embedded playback.
- Added support for AllAnime `aaReq` tokens on persisted episode-source requests.
- Updated AllAnime encrypted episode payload handling to support the new AES-GCM format and derived key.
- Kept a legacy AllAnime AES-CTR fallback for older payloads.

## Reliability

- AllAnime still resolves supported existing providers such as Mp4Upload, fast4speed, and AllAnime internal proxy links.
- Miruro source lookup fails closed and keeps the browser fallback available when Cloudflare or provider-side protections block native requests.

## Validation

- Verified the AllAnime `aaReq` placement against the live API.
- Confirmed live AllAnime AES-GCM episode payload decryption.
- Passed TypeScript production build and all automated tests.

**Full changelog:** https://github.com/vorlie/AniPlayV2/compare/1.9.3...1.9.4
