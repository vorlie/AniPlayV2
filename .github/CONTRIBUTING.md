# Contributing

Thanks for helping improve AniPlay.

## Local Setup

```powershell
cd ani-cli-gui
npm install
npm run dev
```

## Before Opening a PR

Run the checks that match your change:

```powershell
npm run lint
npm run build:ui
npm test
```

For provider changes, also manually test:

- search by title
- episode list loading
- one sub episode
- one dub episode when available
- playback after restarting the app

## Provider Reports

When reporting provider breakage, include the provider, title, episode, Sub/Dub mode, AniPlay version, and relevant logs. Do not post cookies, account tokens, or private request headers.

## Release Notes

User-facing changes should update `release-notes.md`. Commit summaries can be staged in `commit-message.txt` when preparing a release branch.
