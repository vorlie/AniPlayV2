# AniPlay website

Static source for <https://vorlie.github.io/AniPlayV2/>.

The site is intentionally dependency-free. `build.mjs` copies the source and
existing project artwork into `website/dist`, which is ignored and deployed by
the GitHub Pages workflow.

## Build locally

From the repository root:

```powershell
node website/build.mjs
```

Serve the result with any static file server:

```powershell
npx --yes serve website/dist
```

The source uses only relative asset paths so it works under the GitHub Pages
project prefix `/AniPlayV2/`.

## Deployment

`.github/workflows/pages.yml` builds and publishes the site after changes to
the website, its copied assets, or the workflow reach `main`. It can also be
run manually.

GitHub repository settings must use **GitHub Actions** as the Pages source.
