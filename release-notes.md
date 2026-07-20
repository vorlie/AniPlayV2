# AniPlay 1.15.2

## AllAnime playback

- Restored episode source resolution after AllAnime's latest crypto and API changes.
- AniPlay now follows the current MKissa API endpoint and sends crypto requests with the matching site identity.
- Improved fallback query signing for compatibility with current protected episode queries.
- Fixed internal provider URL resolution so decoded AllAnime sources can be loaded again.
- Fixed malformed Wix quality URLs that caused valid default-provider streams to return HTTP 403.
- Added rate-limit backoff and removed unnecessary legacy requests that could make temporary throttling worse.
- AllAnime diagnostics now report the dynamically discovered API endpoint.

## Verification

- All 62 automated tests pass.
- ESLint passes without errors.
- The production renderer and Electron bundles build successfully.
