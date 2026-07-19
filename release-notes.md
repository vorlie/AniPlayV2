# AniPlay 1.15.0

## AniList workspace

- Combined the previous Home and Profile destinations into one AniList workspace.
- Added separate Overview, Discover, and My Library views.
- Added AniList title search alongside trending, seasonal, airing, and recommended collections.
- Added full library browsing for Watching, Planning, Completed, Paused, Dropped, and Rewatching lists.
- Added library title filtering and direct access to progress, score, status, and repeat management.
- Kept Continue Watching available inside My Library.

## Navigation

- Added Back and Forward navigation within the AniList workspace.
- Added clickable, origin-aware breadcrumbs for profile favourites, discovery collections, library statuses, related anime, and recommendations.
- Restored the previous scroll position when navigating backward or forward.
- Preserved discovery searches, collection selection, library filters, and active list status while viewing anime details.
- Stabilized the page scrollbar gutter to prevent horizontal layout movement between views.

## Verification

- All 61 automated tests pass.
- ESLint passes without errors.
- The production renderer and Electron bundles build successfully.
