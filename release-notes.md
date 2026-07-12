# AniPlay 1.12.0

AniPlay 1.12.0 adds provider language grouping, introduces Docchi as an experimental Polish catalog provider, and restores AllAnime playback against the current upstream crypto flow.

## Highlights

- Browse now separates catalog providers into **Polish sources** and **English sources**.
- Added **Docchi** as an experimental Polish source next to Desu.
- Docchi can search the catalog, load episode lists, and return supported embed playback links.
- Docchi Dailymotion and Mega players are shown as embed servers.
- Browser fallback is available for Docchi episodes when in-app playback cannot resolve a stream.
- AllAnime playback has been updated for the current MKissa/AllAnime crypto bootstrap and encrypted episode payload format.
- AllAnime direct media playback no longer forces browser CORS mode for plain MP4 mirrors.
- Existing English providers remain grouped separately: Anikoto, AllAnime, and Miruro.

## Notes

- Docchi is experimental in this release.
- Adult/hentai catalog entries are intentionally excluded.
- AniPlay downloads are disabled for Docchi embed-only links.
- Mega may offer manual downloads inside its own embed page, but AniPlay does not queue those downloads automatically.
- Some Docchi players may only work through browser fallback.
- Some AllAnime mirrors may timeout or return upstream 403/500 responses; AniPlay skips failed mirrors and tries the remaining resolved sources.
- Provider language grouping is only visual metadata. It does not change the app UI language or Sub/Dub playback controls.

## Technical Changes

- Added `docchi` to the shared catalog provider model.
- Wired Docchi through Electron search, episode loading, link loading, provider validation, browser fallback, AniList mapping normalization, history, and remote notice provider targeting.
- Updated AllAnime crypto discovery for the current `mkissa.to` bootstrap and `cdn.mkissa.net` bundle layout.
- Added AllAnime AES-GCM response fallback decoding for encrypted episode payloads.
- Expanded Electron media header handling for AllAnime mirror hosts and removed forced anonymous CORS mode from direct video playback.
- Added parser coverage for Docchi series matching, adult-entry filtering, episode sorting, and player embed mapping.

## Verification

- `npm test`
- `npm run lint`
- `npm run build:ui`
