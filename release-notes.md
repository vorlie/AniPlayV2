# AniPlay Docchi Provider Test Build

This test build adds provider language grouping in Browse and introduces Docchi as an experimental Polish catalog provider.

## Highlights

- This build is versioned as `1.12.0-test.1`.
- AniPlay now shows a small in-app test build badge for prerelease versions.
- Browse now separates catalog providers into **Polish sources** and **English sources**.
- Added **Docchi** as an experimental Polish source next to Desu.
- Docchi can search the catalog, load episode lists, and return supported embed playback links.
- Docchi Dailymotion and Mega players are shown as embed servers.
- Mega may offer manual downloads inside its own embed page, but AniPlay does not queue those downloads automatically.
- Browser fallback is available for Docchi episodes when in-app playback cannot resolve a stream.
- Existing English providers remain grouped separately: Anikoto, AllAnime, and Miruro.

## Testing Focus

- Search a few known Docchi titles and confirm results appear under the Docchi provider.
- Open a Docchi result and confirm the episode list loads in numeric order.
- Start playback from at least one Docchi episode.
- Confirm Dailymotion and Mega embed servers play in-app when available.
- Confirm AniPlay does not expose its own Download button for Docchi embed servers.
- Confirm Mega manual downloads, when offered by Mega itself, are handled by the user outside AniPlay's download queue.
- Confirm browser fallback opens the matching Docchi episode page.
- Confirm the app header shows the `1.12.0-test.1` test build badge.
- Switch between Desu, Docchi, Anikoto, AllAnime, and Miruro and confirm old search results clear.
- Confirm saved history and AniList playback mappings keep the selected provider correctly.

## Known Limits

- Docchi is experimental in this build.
- Adult/hentai catalog entries are intentionally excluded.
- AniPlay downloads are disabled for Docchi embed-only links.
- Mega downloads are manual only when Mega exposes them in its own embed UI.
- Some Docchi players may only work through browser fallback.
- Provider language grouping is only visual metadata. It does not change the app UI language or Sub/Dub playback controls.

## Technical Notes

- Added `docchi` to the shared catalog provider model.
- Set the packaged app version to `1.12.0-test.1` for test release artifacts.
- Added an automatic prerelease badge for versions containing `test`, `alpha`, `beta`, or `rc`.
- Wired Docchi through Electron search, episode loading, link loading, provider validation, browser fallback, AniList mapping normalization, history, and remote notice provider targeting.
- Added parser coverage for Docchi series matching, adult-entry filtering, episode sorting, and player embed mapping.
- Verified with `npm test`, `npm run lint`, and `npm run build:ui`.
