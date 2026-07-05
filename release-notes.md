# AniPlayV2 v1.5.0 Release Notes

## Highlights

- **Dubbed anime support**: Choose between Subbed and Dubbed under Settings. The preference applies consistently to search results, episode lists, and stream lookup.
- **Persistent playback**: The new Playing tab keeps the active video, playback position, selected server, and controls intact while you visit other parts of the app.
- **More servers**: Added MP4Upload scraping and playback support alongside the existing stream providers.
- **Major interface refresh**: Improved responsive navigation, browse results, episode selection, loading states, empty states, and keyboard accessibility.

## Player and Browsing

- Added a visible Sub/Dub catalog indicator to Browse.
- Added episode filtering for shows with long episode lists.
- Replaced blocking playback alerts with dismissible inline errors.
- Added clearer stream-loading and no-stream states.
- Improved server persistence when navigating between tabs.
- Added safer watch-history clearing with confirmation.

## Interface and Accessibility

- Added mobile-friendly bottom navigation and refined desktop navigation.
- Redesigned search around a compact, search-first workflow.
- Replaced the plain result list with responsive title cards.
- Improved focus indicators and keyboard navigation.
- Added reduced-motion support for users who disable animations.
- Improved spacing, hierarchy, responsive sizing, and empty-state guidance throughout the app.

## Packaging and Releases

- Windows and Linux packages now build on their native GitHub-hosted runners.
- Updated the release workflow and actions for Node.js 24.
- Release publishing now waits for both platform builds and combines their artifacts into one GitHub release.

**Full changelog:** https://github.com/vorlie/AniPlayV2/compare/v1.4.0...v1.5.0
