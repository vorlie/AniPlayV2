# AniPlay 1.16.3

This patch improves MegaPlay downloads, Linux AniList authentication, and embedded-player compatibility.

## MegaPlay download fix

- Fixed MegaPlay/KotoCDN downloads failing with FFmpeg errors such as `dimensions not set` or `Could not write header`.
- AniPlay now recognizes MPEG-TS segments disguised with a PNG wrapper and removes that wrapper before passing the stream to FFmpeg.
- The workaround uses a restricted temporary localhost relay and preserves the provider headers required by KotoCDN.
- Downloads remain stream copies: episodes are not transcoded or buffered in full by AniPlay.

## Linux AniList authentication

- Added Electron's portal-aware asynchronous secure-storage provider for improved Secret Service and desktop portal support.
- Retained compatibility with AniList tokens encrypted by the previous synchronous storage backend.
- Improved Linux errors with the Electron credential-backend name and actionable Secret Service or KWallet guidance.
- Documented explicit `gnome-libsecret`, `kwallet6`, and `kwallet5` launch options for systems where automatic backend detection fails.

## Embedded-player compatibility

- Provider-owned iframe requests now retain the provider's original headers, cookies, and CORS responses.
- AniPlay's provider header and CORS adjustments remain active for native video playback.
- This addresses an AniPlay-side cause of JW Player error `233011`; provider, CDN, ad-blocking, or network restrictions may still produce the same code.

## Validation

- Production build completed successfully.
- ESLint passed.
- All 79 tests passed.
- A live FFmpeg smoke test succeeded against the MegaPlay episode that reproduced the disguised-segment failure.

**Full changelog:** [1.16.2...1.16.3](https://github.com/vorlie/AniPlayV2/compare/1.16.2...1.16.3)
