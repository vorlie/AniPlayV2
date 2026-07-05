# AniPlayV2 v1.6.0 Release Notes

## Highlights

- **Episode downloads**: Download the currently playing episode using the active server, quality, and Sub/Dub selection.
- **Persistent download queue**: Downloads continue while you browse, change tabs, or switch to another anime.
- **Built-in FFmpeg**: HLS and direct media sources are downloaded and remuxed to MP4 without requiring a separate FFmpeg installation.
- **Downloads dashboard**: Monitor progress, cancel queued or active jobs, retry interrupted downloads, and reveal completed files.

## Download Management

- Added a dedicated Downloads tab with an active-job badge.
- Downloads run one at a time to avoid overwhelming providers or network connections.
- Stream URLs are refreshed immediately before each job begins, reducing failures caused by expired links.
- Added determinate progress when episode duration is available and an activity indicator otherwise.
- Interrupted downloads are detected after restarting AniPlay and can be retried.
- Partial files are cleaned up after cancellation, failure, or interruption.
- Completed filenames include the anime, episode, Sub/Dub mode, and resolution.
- Existing files are preserved by automatically adding `(2)`, `(3)`, and subsequent suffixes.

## Settings and Storage

- Downloads default to the system Downloads folder under `AniPlay`.
- Added a native folder picker under Settings for selecting a custom download location.
- Download history and destination settings persist between sessions.
- Added Open Folder, Clear Finished, Cancel, and Retry actions.

## Security and Reliability

- Download work runs exclusively in the Electron main process.
- The renderer sends episode and source metadata instead of arbitrary URLs or filesystem paths.
- Added strict IPC validation for download requests and job actions.
- Added typed download APIs and isolated progress-event subscriptions.
- Added automated tests for filename sanitization, collision handling, queue ordering, restart recovery, provider headers, and FFmpeg progress parsing.

## Packaging and Licensing

- FFmpeg 6.1.1 is bundled with Windows and Linux packages.
- Added FFmpeg GPL licensing, attribution, binary-provider information, and corresponding-source links.
- FFmpeg is packaged outside the Electron ASAR archive so it remains executable.

> **Package size:** Bundling FFmpeg increases download and installation size by approximately 83 MB.

> **Current limitation:** v1.6.0 supports downloading one selected episode at a time. Batch and season downloads are not included.

**Full changelog:** https://github.com/vorlie/AniPlayV2/compare/1.5.1...1.6.0
