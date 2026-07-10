# AniPlay v1.11.0

This release adds the first app translation pass, with English and Polish available across the main renderer UI.

## Highlights

- Added English and Polish app translations.
- Added **Settings -> Advanced -> Language** so the interface can switch language immediately without restarting.
- The selected language is saved and reused on the next launch.
- Translated the main visible app surfaces, including navigation, pages, settings, buttons, placeholders, empty states, and toast text.
- Support/debug-facing content stays in English for now to avoid making troubleshooting harder.

## Translations

- Added renderer-only localization using `i18next` and `react-i18next`.
- Added English and Polish resource strings for the main visible UI.
- Translated navigation, Browse, Anime details, Player, History, Downloads, Home, Settings, app toasts, empty states, placeholders, buttons, and shell labels.
- Kept provider names, anime titles, filenames, remote notice content, logs, debug messages, Discord Rich Presence, and main-process errors in English for easier support and debugging.
- Missing Polish strings fall back to English instead of exposing raw translation keys.

## Settings

- Added a language picker under **Settings -> Advanced**.
- Supported languages are **English** and **Polski**.
- Changing the language updates the renderer immediately without an app restart.
- The preference is stored as `app.language`.

## Technical Notes

- Added `i18next` and `react-i18next` dependencies.
- Added `app.language` local storage preference for renderer language selection.
- No preload, Electron main-process IPC, scraper, AniList, download manager, or Discord Rich Presence API changes were made for translations.
- Verified with `npm run lint` and `npm run build:ui`.

**Full changelog:** https://github.com/vorlie/AniPlayV2/compare/1.10.3...1.11.0
