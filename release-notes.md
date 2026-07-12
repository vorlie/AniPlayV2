# AniPlay 1.12.0 Release Candidate 1

This release candidate adds provider language grouping, introduces Docchi as an experimental Polish catalog provider, and restores AllAnime playback against the current upstream crypto flow.

## Highlights

- This build is versioned as `1.12.0-rc.1`.
- AniPlay shows a small in-app prerelease badge for `test`, `alpha`, `beta`, and `rc` builds.
- Browse now separates catalog providers into **Polish sources** and **English sources**.
- Added **Docchi** as an experimental Polish source next to Desu.
- Docchi can search the catalog, load episode lists, and return supported embed playback links.
- Docchi Dailymotion and Mega players are shown as embed servers.
- AllAnime playback has been updated for the current MKissa/AllAnime crypto bootstrap and encrypted episode payload format.
- AllAnime direct media playback no longer forces browser CORS mode for plain MP4 mirrors.
- Mega may offer manual downloads inside its own embed page, but AniPlay does not queue those downloads automatically.
- Browser fallback is available for Docchi episodes when in-app playback cannot resolve a stream.
- Existing English providers remain grouped separately: Anikoto, AllAnime, and Miruro.

## Testing Focus

- Confirm the app header shows the `1.12.0-rc.1` prerelease badge.
- Search a few known Docchi titles and confirm results appear under the Docchi provider.
- Open a Docchi result and confirm the episode list loads in numeric order.
- Start playback from at least one Docchi episode.
- Confirm Dailymotion and Mega embed servers play in-app when available.
- Confirm AniPlay does not expose its own Download button for Docchi embed servers.
- Search an AllAnime title, load episodes, and confirm at least one Sub episode plays.
- Test AllAnime direct MP4 mirrors such as fast4speed/mp4upload when they appear.
- Test AllAnime downloads when the selected source supports them.
- Confirm Mega manual downloads, when offered by Mega itself, are handled by the user outside AniPlay's download queue.
- Confirm browser fallback opens the matching Docchi episode page.
- Switch between Desu, Docchi, Anikoto, AllAnime, and Miruro and confirm old search results clear.
- Confirm saved history and AniList playback mappings keep the selected provider correctly.

## Known Limits

- Docchi is experimental in this build.
- Adult/hentai catalog entries are intentionally excluded.
- AniPlay downloads are disabled for Docchi embed-only links.
- Mega downloads are manual only when Mega exposes them in its own embed UI.
- Some Docchi players may only work through browser fallback.
- Some AllAnime mirrors may timeout or return upstream 403/500 responses; AniPlay skips failed mirrors and tries the remaining resolved sources.
- Provider language grouping is only visual metadata. It does not change the app UI language or Sub/Dub playback controls.

## Technical Notes

- Added `docchi` to the shared catalog provider model.
- Set the packaged app version to `1.12.0-rc.1` for release candidate artifacts.
- Added an automatic prerelease badge for versions containing `test`, `alpha`, `beta`, or `rc`.
- Wired Docchi through Electron search, episode loading, link loading, provider validation, browser fallback, AniList mapping normalization, history, and remote notice provider targeting.
- Updated AllAnime crypto discovery for the current `mkissa.to` bootstrap and `cdn.mkissa.net` bundle layout.
- Added AllAnime AES-GCM response fallback decoding for encrypted episode payloads.
- Expanded Electron media header handling for AllAnime mirror hosts and removed forced anonymous CORS mode from direct video playback.
- Added parser coverage for Docchi series matching, adult-entry filtering, episode sorting, and player embed mapping.
- Verified with `npm test`, `npm run lint`, and `npm run build:ui`.
