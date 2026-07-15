# AniPlay 1.13.1

AniPlay 1.13.1 expands profile achievements with richer AniList milestones and a private, local viewing ledger for activity-based challenges.

## Achievement collection

- Expanded the profile collection to 32 unique achievements across library, episode, completion, watch-time, discovery, and activity categories.
- Added a dedicated achievement browser with All, Earned, and Locked filters, while keeping the profile overview compact.
- Kept one badge per trigger and introduced clearer themed milestones, including Otaku Starter Pack, Collector, Library of Alexandria, Isekai Protagonist, 5k Club, and Year of Anime.
- Added English and Polish text for the new achievements and browser UI.

## AniList-powered milestones

- Added Trendsetter for listing 50 currently airing anime.
- Added Hidden Gem Hunter for finding 10 titles with fewer than 5,000 AniList users.
- Added Marathon Runner and Long-Running Legend for completing series with at least 50 and 100 episodes.
- Added Short & Sweet for completing 20 series with 12 or fewer episodes.
- Added Shounen Regular for completing 10 anime carrying AniList's Shounen tag.
- Added Slice of Life for logging 1,000 episodes from Slice of Life anime.
- Added Filler Skipper for reaching 1,000 episodes without a currently dropped series.
- Improved profile aggregation so custom lists and status lists do not count the same media entry twice.

## Local viewing activity

- Added an append-only local viewing ledger and a rebuildable summary for time-based achievements.
- Added Binge Master for watching 24 hours within a rolling seven-day window.
- Added Weekend Warrior for watching 12 hours during a single weekend.
- Added Night Owl for watching 100 hours between midnight and 6 AM.
- Added Golden Week for completing at least one episode on seven consecutive days.
- Native playback now records active viewing segments across play, pause, buffering, seeking, completion, visibility changes, and periodic checkpoints.
- Embedded players record activity when their provider supplies trusted playback events.

Viewing activity remains on the device and starts accumulating after upgrading to 1.13.1; earlier sessions cannot be reconstructed retroactively.

## Reliability

- Viewing events are validated and written serially to protect the local ledger from overlapping updates.
- Summary rebuilding tolerates incomplete or malformed trailing log entries.
- Refreshed AniList profile caching for the expanded milestone data.

## Verification

- Passed 17 focused tests covering AniList normalization, achievement evaluation, viewing-log aggregation, and profile-share rendering.
- Passed the production UI build and scoped lint checks.
