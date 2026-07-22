# AniPlay 1.16.4

This patch fixes AniList sessions not surviving an AniPlay restart.

## AniList session persistence

- Updated Electron to 42.7.1, which includes the upstream fix for asynchronous secure storage incorrectly reporting unavailable immediately after application startup.
- Restored async-first credential storage across Windows, Linux, and macOS.
- Retained compatibility with tokens encrypted through the previous synchronous storage backend.
- Temporary network, rate-limit, or credential-storage failures no longer delete an otherwise valid saved session.
- AniPlay now removes a saved token only when AniList explicitly rejects it with HTTP 401 or the user signs out.

Linux users benefit in particular because Secret Service, desktop portal, and KWallet discovery can take longer after application startup. The underlying Electron race could affect every supported platform.

Users whose session was already lost may need to connect AniList once after installing 1.16.4. Later restarts should preserve the session.

## Validation

- Production build completed successfully with Electron 42.7.1.
- ESLint passed.
- All 79 tests passed.

**Full changelog:** [1.16.3...1.16.4](https://github.com/vorlie/AniPlayV2/compare/1.16.3...1.16.4)
