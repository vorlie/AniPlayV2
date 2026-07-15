# AniPlay 1.13.0

AniPlay 1.13.0 turns the AniList integration into a more personal experience with a dedicated profile dashboard, franchise relations, improved list editing, and shareable profile cards.

## Highlights

- Added a dedicated AniList Profile page with profile artwork, biography, viewing statistics, total watch time, mean score, and favourite anime.
- Added an Anime DNA view that visualizes the genres appearing most often in your AniList library.
- Added viewing milestones for completed anime, watched episodes, and total time spent watching.
- Added shareable 1200 x 630 profile images in two styles:
  - Hero: a cinematic, artwork-led profile card.
  - Stats: a clean, data-focused card with genre visualization.
- Styled exported profile cards with Material You surfaces, tonal containers, expressive shapes, and Google Sans typography.
- Added anime relations to detail pages, including prequels, sequels, side stories, spin-offs, adaptations, and alternative versions.
- Made related anime and profile favourites directly navigable inside AniPlay.

## AniList list improvements

- Replaced the old list form with localized status chips, progress and rewatch steppers, a score slider, reset support, and clearer Add/Save states.
- Prevented unchanged list entries from being submitted again.
- Replaced full AniList cache clearing with targeted invalidation of only the affected profile, private dashboard, and media details.
- Preserved public dashboard, search, and unrelated media caches after list updates to reduce unnecessary AniList API requests.
- Persisted cache invalidation so stale list data is not restored on the next launch.

## Profile sharing and privacy

- Profile cards are generated locally and saved through the native Windows Save dialog.
- Profile data is not uploaded to a separate sharing service.
- Avatar and banner downloads are restricted to AniList-owned HTTPS hosts and limited in size.
- Exported profile text is escaped before rendering.
- Added English and Polish translations for the profile, relations, milestones, list editor, and export flow.

## Notes

- An AniList account connection is required for profile statistics and profile-card exports.
- Google Sans is used when available, with local system-font fallbacks when Google Fonts cannot be reached.
- AniList profile data remains cached briefly to keep navigation responsive and reduce API traffic.

## Verification

- 11 focused AniList and profile-card tests passed.
- `npm run build:ui`
- Scoped ESLint and diff checks passed.
