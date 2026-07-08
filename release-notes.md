# AniPlayV2 v1.9.6 Release Notes

## Highlights

- Added Anikoto as a new selectable English provider candidate.
- Anikoto uses embedded MegaPlay playback while staying separate from the current default provider.

## Provider Updates

- Added `Anikoto · EN` to the catalog selector.
- Added Anikoto search through AniList, with recent Anikoto matches merged in when available.
- Added episode loading from Anikoto series data when catalog IDs are known, with AniList episode counts as fallback.
- Added MegaPlay embed lookup through Anikoto embed IDs, AniList IDs, and MAL IDs.
- Added browser fallback for Anikoto episodes using the selected Subbed/Dubbed mode.
- Added MegaPlay, MewStream, and subtitle host request headers for playback.
- Added EasyList-powered embedded-player ad blocking for MegaPlay embeds.

## Reliability

- Download jobs now keep the original catalog provider, so non-AllAnime downloads resolve against the correct source.
- FFmpeg downloads now send MegaPlay referer headers for MegaPlay-backed streams.
- Native MegaPlay source unwrapping is disabled by default because provider segment CDNs may Cloudflare-block direct HLS requests.
- Embedded playback blocks EasyList ad requests and denies popup windows inside AniPlay.
- Anikoto is selectable first and is not the default provider yet.

## Validation

- Added unit tests for Anikoto search normalization, episode parsing, MegaPlay source ID extraction, stream parsing, and subtitle parsing.
- Passed ESLint, TypeScript production build, and all automated tests.

**Full changelog:** https://github.com/vorlie/AniPlayV2/compare/1.9.4...1.9.6
