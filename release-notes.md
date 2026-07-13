# AniPlay 1.12.1

AniPlay 1.12.1 is a small follow-up release focused on clearer provider behavior and safer catalog controls.

## Highlights

- Added an explicit Docchi adult catalog opt-in under Settings -> Search.
- Docchi adult entries remain hidden by default and only appear when the opt-in is enabled.
- Added clearer source-loading status text while AniPlay resolves episode streams.
- AllAnime now shows more specific loading steps while fetching encrypted episode data and resolving mirrors.
- Updated the Scraper settings page to explain that AllAnime crypto handling is automatic, while the cipher map update only refreshes mirror URL decoding.
- Reorganized Electron internals into provider, service, and download folders for easier maintenance.

## Notes

- The Docchi adult catalog setting only affects Docchi search results.
- Provider language grouping, playback language, and UI language remain separate settings.
- Some AllAnime mirrors may still timeout or return upstream 403/500 responses; AniPlay skips failed mirrors and tries remaining sources.

## Verification

- `npm test`
- `npm run lint`
- `npm run build:ui`
