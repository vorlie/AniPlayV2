# AniPlayV2 v1.7.0 Release Notes

## Highlights

- **AniList account integration**: Sign in through the system browser and access personalized AniList data directly in AniPlay.
- **Personalized home dashboard**: Browse currently watching and planning lists, recommendations, upcoming episodes, trending titles, and the current season.
- **Rich anime details**: View banners, covers, descriptions, genres, scores, formats, airing information, and related recommendations before watching.
- **AniList list management**: Explicitly add, update, or remove titles and edit status, progress, score, and repeat count.
- **Safer playback matching**: AniPlay ranks scraper results against AniList titles and episode counts instead of blindly opening the first result.

## AniList Authentication and Sync

- Added browser-based AniList OAuth using the public AniPlay client ID.
- Added a temporary localhost callback that works with installed and portable builds.
- AniList access tokens are encrypted using Electron secure storage and never exposed to the renderer.
- Sessions are validated when AniPlay starts and invalid or expired credentials are removed automatically.
- Account integration remains optional; public discovery, search, history, and playback continue to work while signed out.
- List changes are always explicit. Playback does not automatically update AniList progress.

## Discovery and Details

- Replaced the previous Home-page GraphQL request with a dedicated main-process AniList service.
- Added personalized Watching, Planning, Completed, and recommendation sections.
- Added public Trending, Popular This Season, and Airing Soon sections.
- Added Continue Watching shortcuts backed by AniPlay's existing local history.
- Added detailed anime pages with list controls and a dedicated Watch action.
- Converted AniList description markup into safe, readable plain text.
- Improved wide AniList banner rendering to fill the details hero without a bottom bar.
- Added cached-data fallback when AniList is temporarily unavailable.

## Playback Catalog Matching

- Searches English, romaji, preferred, and synonym titles when resolving an AniList entry.
- Scores candidates using normalized titles and episode counts.
- Automatically opens only high-confidence matches.
- Shows a candidate picker when a match is uncertain.
- Remembers confirmed mappings for each Sub/Dub mode.
- Added an option to reset a saved playback match.

## Security and Reliability

- Added typed and sender-validated IPC APIs for authentication, dashboard data, media details, list mutations, and mappings.
- Added request timeouts, in-flight request deduplication, bounded caching, stale-data fallback, and AniList rate-limit errors.
- Keeps AniList DTOs and credentials out of renderer-owned UI code.
- Added automated tests for response normalization, HTML description conversion, alternate-title matching, and episode-count conflicts.

## Configuration

- AniPlay includes AniList client ID `45193`; end users do not need to configure a developer client.
- Developers and forks can override it using `ANILIST_CLIENT_ID`.
- The registered OAuth callback is `http://127.0.0.1:42819/anilist/callback`.

> **Privacy:** AniList sign-in grants AniPlay permission to access and modify the signed-in user's AniList data. Tokens stay encrypted in the local Electron user-data directory.

> **Current limitation:** AniList progress is not updated automatically during playback. Users must save progress from the anime details page.

**Full changelog:** https://github.com/vorlie/AniPlayV2/compare/1.6.0...1.7.0
