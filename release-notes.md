# AniPlayV2 v1.9.2 Release Notes

## Highlights

- Fixed an application startup failure introduced with automatic updates in v1.9.1.
- Restored normal startup for development, installed, and portable Windows builds.

## Auto-Updater Fix

- Corrected interoperability between AniPlay's ES module main process and the CommonJS `electron-updater` package.
- Replaced the unsupported named runtime import with a CommonJS-compatible default package import.
- Kept `electron-updater` external to the Electron main-process bundle so its Node.js dependencies load correctly at runtime.
- Automatic update checks, download progress, and restart-to-install behavior remain unchanged for installed NSIS builds.
- Portable builds continue to use manual updates.

## Validation

- Verified the generated Electron main bundle uses the compatible updater import.
- Passed TypeScript production builds, ESLint, and all automated tests.

**Full changelog:** https://github.com/vorlie/AniPlayV2/compare/1.9.1...1.9.2
