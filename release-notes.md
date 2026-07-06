# AniPlayV2 v1.8.0 Release Notes

## Highlights

- **Discord Rich Presence**: Share the anime, episode, Sub/Dub mode, artwork, and remaining playback time on your Discord profile.
- **AniList cover artwork**: Playback launched from AniList uses the matching anime cover and provides a direct AniList link.
- **Automatic metadata resolution**: Catalog and legacy-history playback can resolve AniList metadata from high-confidence title and episode-count matches.
- **Privacy-first controls**: Rich Presence is disabled by default and can be enabled under Settings.

## Discord Rich Presence

- Added local Discord Desktop integration using application ID `1440472840578142381`.
- Displays the activity as **Watching on AniPlay** with the current anime and episode.
- Shows whether playback is Subbed or Dubbed.
- Displays a remaining-time countdown while playing.
- Freezes the remaining time and displays a Paused state when playback is paused.
- Recalculates the countdown after seeking or resuming.
- Clears the activity when playback ends, the player closes, the feature is disabled, or AniPlay exits.
- Added bounded reconnection when Discord is closed, launched later, or restarted.
- Added a Settings status indicator for connected and waiting states.

## Artwork and AniList Metadata

- Uses the AniList cover as Rich Presence artwork when a confirmed media match is available.
- Uses the uploaded `aniplay` Discord asset when no reliable cover is known or Discord rejects the external image.
- Adds a **View on AniList** button when an AniList media ID is available.
- Carries AniList media IDs and cover URLs through playback selection, local history, and resume flows.
- Searches AniList using scraper titles when playback lacks metadata.
- Scores candidates using normalized titles, alternate titles, and episode counts.
- Saves only high-confidence, unambiguous scraper-to-AniList mappings; uncertain results retain fallback artwork.
- Existing `watch.history.v1` entries remain compatible.

## Security and Reliability

- Rich Presence runs exclusively in Electron's main process through Discord's local IPC transport.
- Added sender validation and typed preload APIs for settings, playback updates, and activity clearing.
- Validates title lengths, playback values, AniList IDs, and HTTPS cover URLs before publishing.
- Throttles routine presence synchronization while immediately updating play, pause, seek, and metadata changes.
- Discord failures are isolated from search, playback, history, downloads, and AniList synchronization.
- Externalized the CommonJS Discord RPC dependency from the ESM Electron bundle to prevent startup failures.
- Added automated tests for activity generation, timestamps, paused state, artwork fallback, input validation, connection failure, and reconnection behavior.

## Configuration

- End users do not need to configure a Discord application.
- Developers and forks can override the bundled application ID using `DISCORD_CLIENT_ID`.
- Discord Desktop must be running locally for Rich Presence to connect.

> **Privacy:** Playback activity is publicly visible according to the user's Discord activity-sharing settings. AniPlay therefore keeps Rich Presence disabled until the user explicitly enables it.

> **Current limitation:** AniList artwork is used only when AniPlay can establish a sufficiently confident media match. Ambiguous titles intentionally use the static AniPlay image.

**Full changelog:** https://github.com/vorlie/AniPlayV2/compare/1.7.0...1.8.0
