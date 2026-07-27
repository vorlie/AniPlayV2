# Anikoto 2 provider

AniPlay treats `anikoto.cz` as **Anikoto 2**, a provider independent from the existing Anikoto API/MegaPlay path.

For the complete request sequence, response shapes, token handling, diagnostics, security guidance, and an integration
checklist for other projects, see [`anikoto2-resolving.md`](./resolving/anikoto2-resolving.md).

| AniPlay name | Catalog and player workflow |
| --- | --- |
| Anikoto 1 | `anikotoapi.site` → MegaPlay → native media or MegaPlay embed |
| Anikoto 2 | `anikoto.cz` → episode server matrix → third-party embed |

The providers have separate IDs, caches, errors, and history entries. AniPlay does not silently switch between them.

## Catalog identity

Search uses the same public autocomplete request as the website:

```text
GET https://anikoto.cz/ajax/anime/search?keyword=<query>
X-Requested-With: XMLHttpRequest
Referer: https://anikoto.cz/
```

AniPlay parses canonical `/watch/<slug>` results and stores a Base64URL JSON ID prefixed with `anikoto2:`. The payload
contains the slug and display metadata. It never treats a title-derived slug as authoritative.

## Episode discovery

1. Load `https://anikoto.cz/watch/<slug>`.
2. Read the numeric `data-id` and canonical `data-url` from `#watch-main`.
3. Request `/ajax/episode/list/<id>?style=grid&vrf=`.
4. Parse each episode's number, slug, encrypted server-list token, MAL ID, timestamp, and SUB/DUB availability.

Episode numbers remain provider-owned and are sorted numerically. AniPlay does not silently substitute SUB for DUB.

## Server resolution

For the selected episode:

1. Load `/watch/<slug>/ep-<episode>` to initialize the isolated provider session.
2. Request `/ajax/server/list?servers=<episode-token>`.
3. Parse server groups and `data-link-id` values.
4. Request `/ajax/server?get=<link-token>` for each selected-language server.
5. Validate the returned HTTPS embed URL and expose it as a non-downloadable embedded source.

The visible `data-link-id` is Base64 around an opaque provider token, not a media URL. AniPlay does not attempt to
decrypt or manufacture these values.

Groups are classified using both `data-type` and their visible label. This is necessary because supplemental H-SUB
groups can use `data-type="sub"`.

## Supplemental mapper sources

When an episode exposes a MAL ID, slug, and timestamp, AniPlay also attempts:

```text
GET https://mapper.nekostream.site/api/mal/<mal-id>/<episode-slug>/<timestamp>
```

Mapper failures are non-fatal. Returned provider tokens are resolved through the normal anikoto.cz server endpoint and
deduplicated against the base server list.

## Session and security

Catalog and server requests use the persistent, isolated Electron partition:

```text
persist:aniplay-anikoto2
```

This preserves only the cookies needed by the provider workflow and keeps them separate from AniPlay's default session.
Resolved embed URLs must:

- use HTTPS;
- contain no embedded username or password;
- avoid localhost and literal IP destinations;
- remain below the configured URL-size limit.

Provider cookies and AJAX tokens are never forwarded to third-party embed hosts.

## Current limitations

Anikoto 2 initially exposes embedded players only:

- no native HLS/MP4 extraction;
- no AniPlay download support;
- no controllable Watch Together playback;
- subtitle handling remains inside the selected embedded player.

Watch Together requires a controllable native media source, so Anikoto 2 links are intentionally marked as embeds.
Browser fallback opens the canonical anikoto.cz episode page.

VidPlay, Vidstream, VidCloud, HD, Kiwi-Stream, and other hosts must each be evaluated separately before native playback
is enabled. A working iframe does not imply a stable or safe native-media API.

## Maintenance checklist

When the provider changes:

1. Record search, show, episode-list, server-list, and server-resolution responses without publishing signed tokens.
2. Update parser fixtures before changing live request code.
3. Confirm SUB, H-SUB, and DUB grouping independently.
4. Verify session initialization is still required before `/ajax/server`.
5. Keep mapper failure optional.
6. Confirm unsafe URLs are rejected and provider cookies remain isolated.
7. Test browser fallback when every embed resolution fails.
