# Anikoto 2 (`anikoto.cz`) Resolution

Contributor notes for the Anikoto 2 implementation in AniPlay.

Last verified: 2026-07-27

## Purpose

This document explains how AniPlay turns an `anikoto.cz` search result into an episode-specific embedded player:

1. search the provider catalog;
2. preserve the provider's canonical show identity;
3. discover episodes and their language availability;
4. load the selected episode page to initialize the provider session;
5. resolve the episode's server matrix;
6. exchange an opaque server token for a third-party embed URL.

It also documents the distinction between Anikoto 1 and Anikoto 2, the optional NekoStream mapper request, current playback limitations, security boundaries, and the parts of the workflow that can be reused by other projects.

Although this document describes AniPlay's implementation, it may be used as a reference by ani-cli contributors and other projects integrating `anikoto.cz` or another catalog-to-server-matrix provider. The endpoint shapes described here are observed private implementation details, not a stable public API. Isolate them behind a provider module and expect them to change.

The implementation discussed here lives primarily in:

- `ani-cli-gui/electron/providers/anikoto2.ts`
- `ani-cli-gui/electron/scrape.ts`
- `ani-cli-gui/electron/main.ts`
- `ani-cli-gui/src/catalog-types.ts`
- `ani-cli-gui/src/pages/BrowsePage.tsx`
- `ani-cli-gui/src/lib/watch-together-content.ts`

Deterministic parser tests live in:

- `ani-cli-gui/electron/providers/anikoto2.test.ts`

## Anikoto 1 and Anikoto 2 are separate providers

AniPlay intentionally presents two independent Anikoto entries:

| AniPlay name | Catalog | Player workflow | Current capability |
| --- | --- | --- | --- |
| Anikoto 1 | `anikotoapi.site` | Anikoto API -> MegaPlay -> native media or iframe | Native HLS, subtitles, downloads, and Watch Together where resolution succeeds |
| Anikoto 2 | `anikoto.cz` | Website AJAX catalog -> episode server matrix -> third-party iframe | Embedded playback and browser fallback |

Anikoto 2 does not reuse Anikoto 1 IDs, catalog responses, MegaPlay mappings, cookies, or media-header policies. AniPlay does not silently switch between them.

The name "Anikoto 2" is an AniPlay UI distinction. It should not be interpreted as an official upstream version number.

## Important terminology

| Layer | Current service | Purpose |
| --- | --- | --- |
| Catalog and episode index | `anikoto.cz` | Search suggestions, canonical show page, episodes, language availability, and opaque server tokens |
| Supplemental mapping | `mapper.nekostream.site` | Optional additional server tokens associated with MAL and episode metadata |
| Server-token exchange | `anikoto.cz/ajax/server` | Converts an opaque `data-link-id` token into an embed URL |
| Embed/player | VidPlay, Vidstream, VidCloud, HD, Kiwi-Stream, and others | Hosts the actual browser player |
| Media delivery | Provider-dependent third-party CDNs | Serves media used internally by an embed; not currently resolved by AniPlay |

The server label is not a stable media-provider API contract. The same visible label can change implementation, and new labels can appear without notice.

## Complete resolution flow

```text
Search term
    |
    v
GET /ajax/anime/search?keyword=...
    |
    +-- parse /watch/<slug> results
    |
    v
anikoto2:<Base64URL JSON metadata>
    |
    v
GET /watch/<slug>
    |
    +-- #watch-main[data-id]
    +-- #watch-main[data-url]
    |
    v
GET /ajax/episode/list/<show-id>?style=grid&vrf=
    |
    +-- episode number and slug
    +-- opaque server-list token
    +-- SUB/DUB availability
    +-- MAL ID and timestamp, when present
    |
    v
Selected episode and translation mode
    |
    +-- GET /watch/<slug>/ep-<episode-slug>
    |       initializes the persistent provider session
    |
    +-- GET /ajax/server/list?servers=<episode-token>
    |       returns SUB/H-SUB/DUB server groups
    |
    +-- optional mapper.nekostream.site lookup
    |       returns supplemental provider tokens
    |
    v
For each selected-language data-link-id
    |
    v
GET /ajax/server?get=<opaque-token>
    |
    v
Validated HTTPS embed StreamLink
```

The final result is currently an iframe URL, not a native HLS or MP4 URL.

## Request context and isolated session

AniPlay uses an Electron persistent session partition dedicated to this provider:

```text
persist:aniplay-anikoto2
```

This is important because the server-token exchange can depend on cookies established by loading the show and episode pages. A stateless request to `/ajax/server` may return `Bad request` even when the token is current.

The partition also prevents provider cookies from being mixed with AniPlay's default renderer session or with the Anikoto 1 integration.

Normal document requests use browser-oriented headers:

```http
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) ...
Accept: text/html,application/xhtml+xml,*/*;q=0.8
Accept-Language: en-US,en;q=0.9
Referer: https://anikoto.cz/
```

AJAX requests additionally use:

```http
Accept: application/json, text/javascript, */*; q=0.01
X-Requested-With: XMLHttpRequest
Referer: <the relevant show or episode page>
```

Requests include session credentials, follow redirects, and have a bounded timeout. HTTP 429 is surfaced as a rate-limit error and is not retried aggressively.

Do not copy cookies from this session into third-party embed requests.

## 1. Searching the catalog

Search uses the website's autocomplete request:

```text
GET https://anikoto.cz/ajax/anime/search?keyword=<URL-encoded query>
```

The response is a JSON envelope whose `result` contains HTML:

```json
{
  "status": 200,
  "result": "<a class=\"item\" href=\"/watch/example-slug\">...</a>"
}
```

AniPlay parses anchors matching:

```text
/watch/<canonical-slug>
```

It extracts:

- the canonical provider slug from the URL;
- the displayed title from `.name` or `.d-title`;
- a cover from `img[src]` or `img[data-src]`, when safe.

Results are deduplicated by slug. A guessed title slug is never treated as authoritative because punctuation, aliases, seasons, and provider-specific suffixes can make it incorrect.

Search results are cached for five minutes. Failed requests are removed from the cache so a temporary provider failure does not poison later searches.

## 2. Creating a stable internal ID

AniPlay stores Anikoto 2 identity as Base64URL JSON prefixed with `anikoto2:`:

```json
{
  "slug": "black-torch-1d364",
  "title": "Black Torch",
  "coverUrl": "https://..."
}
```

Conceptually:

```ts
const showId =
  `anikoto2:${Buffer.from(JSON.stringify(metadata), 'utf8').toString('base64url')}`
```

The prefix provides provider routing for history, playback, notices, and future migrations. It also prevents a numeric or slug-like ID from being mistaken for an AllAnime or Anikoto 1 identifier.

When decoding the ID, AniPlay validates that:

- the prefix is exactly `anikoto2:`;
- the payload is valid JSON;
- the slug contains only the expected alphanumeric and hyphen characters;
- the slug length is bounded;
- an optional cover URL passes normal URL safety checks.

The encoded title and cover are display metadata. The canonical slug remains the provider identity.

## 3. Loading the canonical show identity

Episode discovery begins with:

```text
GET https://anikoto.cz/watch/<slug>
```

The page contains a root element similar to:

```html
<div
  id="watch-main"
  data-id="12345"
  data-url="https://anikoto.cz/watch/example-slug"
></div>
```

AniPlay reads:

- `data-id`: the provider's numeric show ID used by the episode-list request;
- `data-url`: the provider's canonical show URL and later episode-page base.

Both values are validated. The show ID must be numeric, and the canonical URL must remain on the exact `https://anikoto.cz` origin.

Do not assume the encoded slug, numeric show ID, episode ID, server-list token, and server link token are interchangeable. They belong to different stages.

## 4. Loading and parsing episodes

The numeric show ID is used here:

```text
GET https://anikoto.cz/ajax/episode/list/<show-id>?style=grid&vrf=
```

At the time of verification, an empty `vrf` value is accepted. It remains part of a private website workflow and may change.

The JSON `result` is another HTML fragment. Episode anchors currently expose data attributes similar to:

```html
<a
  data-id="134023"
  data-num="1"
  data-slug="1"
  data-ids="OPAQUE_SERVER_LIST_TOKEN"
  data-mal="61512"
  data-timestamp="..."
  data-sub="1"
  data-dub="1"
></a>
```

AniPlay records:

| Attribute | Meaning |
| --- | --- |
| `data-num` | User-visible episode number |
| `data-slug` | Episode path component used by the canonical page and mapper |
| `data-ids` | Opaque token used by `/ajax/server/list` |
| `data-id` | Internal episode ID, retained for diagnostics/future use |
| `data-mal` | MAL identity used only for optional mapper lookup |
| `data-timestamp` | Mapper input associated with the episode |
| `data-sub` | Whether a SUB selection is advertised |
| `data-dub` | Whether a DUB selection is advertised |

Episode numbers may be fractional. AniPlay accepts numeric forms such as `1`, `12`, and `12.5`, normalizes them, removes duplicates, and sorts numerically.

Language selection is strict:

- SUB mode includes episodes with `data-sub="1"`;
- DUB mode includes episodes with `data-dub="1"`;
- AniPlay does not silently substitute SUB for a missing DUB.

The complete parsed series response is cached for five minutes.

## 5. Initializing the episode session

Before requesting server information, AniPlay loads:

```text
GET https://anikoto.cz/watch/<canonical-slug>/ep-<episode-slug>
```

This is not redundant. It initializes or refreshes the isolated provider session and establishes the episode page as the referer for subsequent AJAX requests.

Skipping this step can produce:

```text
Bad request
```

from the final server-token endpoint.

If recreating the workflow with a non-Electron client, use one cookie jar for the show page, episode page, server list, and server-token exchange. Do not resolve each stage with an unrelated stateless HTTP client.

## 6. Loading the server matrix

The episode's `data-ids` value is passed unchanged to:

```text
GET https://anikoto.cz/ajax/server/list?servers=<URL-encoded episode token>
```

The JSON `result` contains server groups:

```html
<div class="servers">
  <div class="type" data-type="sub">
    <label>SUB</label>
    <ul>
      <li
        data-ep-id="134023"
        data-sv-id="8e4"
        data-link-id="OPAQUE_LINK_TOKEN"
      >VidPlay-1</li>
    </ul>
  </div>
</div>
```

A show may expose multiple groups:

- `SUB`;
- `H-SUB` or `HSUB`;
- `DUB`;
- supplemental download-only rows that do not contain `data-link-id`.

AniPlay classifies groups using both `data-type` and the visible label. This matters because an H-SUB group can sometimes use `data-type="sub"` even though its label says `H-SUB`.

Current selection behavior:

- SUB mode accepts soft-sub and hard-sub groups;
- DUB mode accepts only dub groups;
- rows without `data-link-id` are not treated as playable servers;
- duplicate link tokens are removed.

The visible server name and `data-sv-id` are useful diagnostics, but `data-link-id` is the value used for resolution.

## 7. Understanding `data-link-id`

The `data-link-id` may look like Base64 text. It is still an opaque provider token.

Do not:

- treat its decoded bytes as a final media URL;
- invent or modify token contents;
- persist it as a stable episode identifier;
- publish real tokens in fixtures or bug reports;
- assume two visually similar tokens point to the same server.

AniPlay sends the exact token returned by the current server-list response back to `anikoto.cz`.

This design keeps provider-specific token handling isolated and avoids depending on the provider's internal encryption or serialization format.

## 8. Optional NekoStream mapper lookup

When `data-mal`, `data-slug`, and `data-timestamp` are all present, AniPlay also attempts:

```text
GET https://mapper.nekostream.site/api/mal/<mal-id>/<episode-slug>/<timestamp>
```

This mapper can return supplemental provider entries. AniPlay currently recognizes nested `sub` and `dub` objects whose `url` field contains another token suitable for the normal Anikoto 2 server exchange.

Observed provider names are normalized for display:

| Mapper key | AniPlay label |
| --- | --- |
| `gogoanime` | Vidstream |
| `animepahe` | Kiwi-Stream |
| `anivibe` | Vibe-Stream |
| other keys | Original provider key |

Mapper sources are categorized as H-SUB for SUB mode or A-DUB for DUB mode, appended after the base server list, and deduplicated by token.

The mapper is supplemental:

- its failure does not fail the episode;
- it receives no Anikoto session cookies;
- it is not treated as the catalog authority;
- AniPlay does not depend on it for the canonical show or episode list.

## 9. Exchanging a server token

Each selected-language server token is resolved sequentially through:

```text
GET https://anikoto.cz/ajax/server?get=<URL-encoded link token>
```

The request uses:

- the same `persist:aniplay-anikoto2` session;
- credentials/cookies from earlier page loads;
- the canonical episode page as `Referer`;
- `X-Requested-With: XMLHttpRequest`;
- a browser User-Agent and AJAX-compatible `Accept`.

A successful response resembles:

```json
{
  "status": 200,
  "result": {
    "url": "https://THIRD_PARTY_EMBED/..."
  }
}
```

Some responses may place the URL directly in `result`; the parser accepts both shapes defensively.

AniPlay attempts all parsed servers so the player can expose a server selector. A failed server does not prevent another server from resolving. Final links are deduplicated by URL.

If no server resolves, AniPlay reports the first useful resolution error or a general no-playable-embeds error.

## 10. Validating the returned embed URL

The server endpoint returns a third-party URL controlled by upstream data. Treat it as untrusted input.

AniPlay accepts only URLs that:

- use HTTPS;
- contain no embedded username or password;
- do not target `localhost` or a `.localhost` name;
- do not target a literal IPv4 or IPv6 address;
- remain below the configured maximum length;
- parse as a valid absolute URL.

The validated result becomes:

```ts
{
  url: 'https://THIRD_PARTY_EMBED/...',
  resolution: 'Embed',
  hls: false,
  provider: 'Anikoto 2 · SUB · VidPlay-1',
  downloadable: false,
  embed: true,
}
```

Provider cookies, AJAX tokens, and the Anikoto referer are not forwarded automatically to the third-party host.

Literal-IP and loopback rejection reduces accidental local-network access, but it is not a complete SSRF defense against DNS rebinding. Any future main-process prefetching of returned URLs should add DNS resolution and redirect validation rather than relying only on the current string-level checks.

## 11. Why AniPlay currently keeps these sources embedded

Anikoto 2 exposes a server matrix, but the resolved result is an embed URL. Each embed provider has its own player, scripts, source endpoint, headers, cookies, token lifetime, subtitle format, and possible anti-bot behavior.

A working iframe does not prove that a stable native media API exists.

AniPlay therefore does not currently:

- scrape native HLS or MP4 URLs from Anikoto 2 embeds;
- inject Anikoto cookies into embed hosts;
- classify embed URLs as downloadable media;
- claim subtitle tracks exposed only inside the iframe;
- apply broad media-header or CORS rules to unknown hosts.

VidPlay, Vidstream, VidCloud, HD, Kiwi-Stream, and future servers should each be evaluated as separate native-source integrations.

## 12. Playback and server selection

Every resolved embed becomes an independent source entry. AniPlay's normal server selector can switch between them.

Because these are browser embeds:

- resolution is labeled `Embed`;
- quality selection remains inside the provider player;
- subtitles remain controlled by the provider player;
- AniPlay cannot guarantee uniform keyboard controls;
- embed-provider availability can vary by country, ISP, VPN, or content item.

If native source extraction is added later, retain the iframe as a graceful fallback whenever possible.

## 13. Downloads

Anikoto 2 links are currently marked:

```ts
downloadable: false
```

AniPlay's downloader requires a validated native media URL and, when applicable, known provider-scoped request headers. Passing an iframe URL to FFmpeg does not turn it into a media source.

Do not enable downloads by merely changing the flag. A proper implementation must first:

1. resolve a native HLS or direct-media URL;
2. determine token lifetime and redirect behavior;
3. identify required manifest, segment, key, and subtitle headers;
4. scope those headers to exact trusted delivery domains;
5. parse subtitle tracks;
6. test cancellation and partial-file cleanup;
7. retain the embed fallback independently.

## 14. Watch Together

AniPlay's Watch Together synchronization needs direct control over play, pause, seek, playback rate, buffering state, and current time.

An arbitrary third-party iframe does not provide a trusted common control protocol. Anikoto 2 is therefore considered uncontrollable while it resolves only embed sources.

Consequences:

- AniPlay does not create a synchronized room from an Anikoto 2 embed;
- an existing room cannot use the iframe as a fully synchronized source;
- chat and content identity alone would not make playback controllable;
- no resolved embed or media URL should be stored in the Worker.

If native playback is implemented later, participants should continue resolving their own current media URLs. Watch Together should share only stable content identity:

```json
{
  "provider": "anikoto2",
  "showId": "anikoto2:BASE64URL_METADATA",
  "animeName": "Example title",
  "episode": "1",
  "translationType": "sub"
}
```

## 15. Browser fallback

AniPlay can construct the canonical episode page from its stored slug:

```text
https://anikoto.cz/watch/<slug>/ep-<normalized episode>
```

This provides a browser fallback when embedded playback cannot be used inside AniPlay.

The fallback normalizes the episode number but should not be considered a substitute for a successfully parsed episode slug in every future provider revision. If `data-slug` diverges from the visible number, prefer the parsed canonical episode metadata.

## Caching and rate limits

AniPlay caches successful search and series/episode results for five minutes.

The cache:

- is bounded;
- reuses in-flight promises;
- removes failed requests;
- does not aggressively retry HTTP 403 or 429;
- does not treat server link tokens as permanent media identifiers.

Provider token lifetimes are undocumented. Do not persist resolved embed URLs or tokens as durable playback history.

Respect upstream capacity. Avoid concurrently resolving a large number of episodes or putting diagnostic commands in a tight loop.

## Manual diagnostics

These examples inspect response structure. They intentionally avoid resolving or printing real third-party embed URLs.

Use a cookie jar for the complete episode workflow:

```sh
curl -fsS \
  -A 'Mozilla/5.0' \
  -c anikoto2-cookies.txt \
  -b anikoto2-cookies.txt \
  'https://anikoto.cz/watch/SHOW_SLUG' \
  | rg -o 'id="watch-main"[^>]+'
```

### Search without printing provider tokens

```sh
curl -fsS \
  -A 'Mozilla/5.0' \
  -H 'Accept: application/json, text/javascript, */*; q=0.01' \
  -H 'Referer: https://anikoto.cz/' \
  -H 'X-Requested-With: XMLHttpRequest' \
  'https://anikoto.cz/ajax/anime/search?keyword=black%20torch' \
  | jq '{status, resultType: (.result | type), resultLength: (.result | length)}'
```

### Inspect episode-list metadata

First obtain the numeric show ID from `#watch-main`, then:

```sh
curl -fsS \
  -A 'Mozilla/5.0' \
  -b anikoto2-cookies.txt \
  -H 'Accept: application/json, text/javascript, */*; q=0.01' \
  -H 'Referer: https://anikoto.cz/watch/SHOW_SLUG' \
  -H 'X-Requested-With: XMLHttpRequest' \
  'https://anikoto.cz/ajax/episode/list/SHOW_ID?style=grid&vrf=' \
  | jq '{status, resultType: (.result | type), resultLength: (.result | length)}'
```

### Initialize the selected episode session

```sh
curl -fsS \
  -A 'Mozilla/5.0' \
  -c anikoto2-cookies.txt \
  -b anikoto2-cookies.txt \
  'https://anikoto.cz/watch/SHOW_SLUG/ep-EPISODE_SLUG' \
  -o /dev/null
```

### Inspect the server-list envelope

Do not paste a real token into a public log:

```sh
curl -fsS \
  -A 'Mozilla/5.0' \
  -b anikoto2-cookies.txt \
  -H 'Accept: application/json, text/javascript, */*; q=0.01' \
  -H 'Referer: https://anikoto.cz/watch/SHOW_SLUG/ep-EPISODE_SLUG' \
  -H 'X-Requested-With: XMLHttpRequest' \
  'https://anikoto.cz/ajax/server/list?servers=REDACTED_EPISODE_TOKEN' \
  | jq '{status, resultType: (.result | type), resultLength: (.result | length)}'
```

Delete the temporary cookie jar after debugging:

```sh
rm -f anikoto2-cookies.txt
```

On PowerShell, use `Remove-Item -LiteralPath .\anikoto2-cookies.txt` instead.

## Common failures

| Symptom | Likely cause | Check |
| --- | --- | --- |
| Search returns no results | Provider autocomplete markup changed or the title is absent | Inspect the sanitized anchor classes and canonical `/watch/` paths |
| Search returns invalid JSON | An error/challenge page replaced the AJAX response | Log status, content type, and final hostname without dumping the body |
| HTTP 429 | Requests are too frequent | Stop retrying, retain five-minute caches, and wait |
| Show identity is missing | `#watch-main`, `data-id`, or `data-url` changed | Inspect the show page structure and canonical origin |
| Episode list is empty | AJAX attributes changed or the show has no indexed episodes | Check `data-num`, `data-ids`, `data-sub`, and `data-dub` |
| SUB exists but no server is parsed | H-SUB group labeling or server markup changed | Compare `data-type`, visible label, and `li[data-link-id]` |
| DUB request returns unavailable | The episode advertises no dub | Do not silently fall back to SUB |
| `/ajax/server` says `Bad request` | Episode page was not loaded in the same cookie session, or the token expired | Repeat show -> episode -> server list -> server exchange with one cookie jar |
| One embed server fails | Third-party host is unavailable, blocked, or its token expired | Continue trying the remaining server tokens |
| Every embed fails on one network | ISP, DNS, filtering, geography, or third-party host availability | Try the canonical browser fallback; do not claim it is an AniPlay catalog bug without testing the endpoint stages |
| Embed plays but AniPlay has no subtitles | Subtitles are internal to the iframe | Native subtitle support requires a provider-specific extractor |
| Download is unavailable | Only iframe links resolved | Do not pass embed URLs directly to FFmpeg |
| Watch Together is unavailable | Only uncontrollable iframe links resolved | Native media or a documented bidirectional player API is required |
| Mapper is down | Supplemental mapping service failed | Base `anikoto.cz` servers should still be attempted |

## Logging safely

Useful diagnostics:

- workflow stage: search, show page, episode list, episode page, server list, mapper, or server exchange;
- response status and content type;
- final scheme and hostname after redirects;
- whether `#watch-main` identity was found;
- number of parsed episodes;
- advertised SUB/DUB availability;
- number of SUB, H-SUB, and DUB servers;
- visible server labels and sanitized server IDs;
- number of successfully validated embed URLs.

Do not log:

- complete `data-ids` or `data-link-id` values;
- resolved third-party URLs with signed paths or query strings;
- cookies;
- complete show/episode HTML in normal logs;
- full AJAX response bodies;
- mapper tokens;
- Watch Together room capability tokens.

For debug output, reduce resolved URLs to their scheme and hostname wherever possible.

## Tests in AniPlay

`electron/providers/anikoto2.test.ts` covers:

- search HTML parsing and prefixed ID creation;
- encoded-ID validation;
- canonical show identity extraction;
- episode parsing and numeric ordering;
- SUB, H-SUB, and DUB server grouping;
- mapper response normalization;
- server-response URL validation;
- browser fallback construction.

Live tests should remain opt-in. Search markup, tokens, server labels, embed hosts, and availability are too volatile for deterministic CI.

Recommended additional tests when extending the provider:

- cached request expiry and failed-promise eviction;
- 403/429 behavior;
- session/cookie isolation;
- malformed JSON envelopes;
- missing `result` fields;
- unsafe URL schemes and credentials;
- loopback, literal-IP, and lookalike-host rejection;
- partial server failure;
- mapper failure with working base servers;
- fractional episode selection;
- strict missing-DUB behavior.

## Adding native extraction for one embed provider

Treat every embed host as a new provider-specific layer.

### Discovery

- Identify whether the embed provider documents a source API.
- Record redirects, cookies, referer, origin, and player initialization.
- Determine whether source URLs are temporary, IP-bound, or signed.
- Verify whether subtitles are soft tracks or burned into the video.

### Extraction

- Keep the extractor in its own module.
- Accept only known embed origins; reject lookalikes.
- Parse source responses defensively.
- Validate every returned media and subtitle URL.
- Preserve the iframe as fallback.
- Never forward Anikoto cookies to the media provider.

### Media headers

- Determine exact headers required by manifests, variants, segments, keys, maps, and subtitles.
- Scope headers to exact domains and real subdomains.
- Revalidate redirected hosts.
- Never install a global Electron referer, origin, or CORS override.

### Playback and quality

- Distinguish HLS from direct media.
- Expand HLS master variants into stable quality labels.
- Deduplicate equivalent sources.
- Retain subtitle language, label, and default status.
- Test seeking and source expiry.

### Downloads

- Verify FFmpeg can read manifests, segments, keys, and subtitles with the scoped headers.
- Keep partial-file cleanup and cancellation.
- Do not mark a source downloadable until a native URL is proven.

### Watch Together

- Share only stable provider/show/episode/language identity.
- Resolve media independently on every participant.
- Do not store temporary URLs, cookies, or headers in the room.
- Mark iframe-only clients unready.
- Test two clients on different networks.

## Reusing this workflow in another project

Keep the layers separate:

```text
Anikoto 2 search parser
        !=
show and episode discovery
        !=
server-matrix parser
        !=
optional NekoStream mapper
        !=
opaque token exchange
        !=
third-party embed playback
        !=
future native media extraction
```

A practical integration checklist:

1. Use a persistent cookie jar for the complete provider flow.
2. Preserve canonical slugs instead of guessing them from titles.
3. Keep internal IDs prefixed by provider.
4. Treat all AJAX HTML fragments as untrusted input.
5. Enforce strict SUB/DUB selection.
6. Classify H-SUB using both markup attributes and visible labels.
7. Treat provider tokens as opaque and short-lived.
8. Make mapper sources optional.
9. Validate the final embed URL before opening it.
10. Isolate every native embed extractor.
11. Never confuse an iframe URL with a downloadable media URL.
12. Keep rate-limit, parsing, mapping, and embed failures distinguishable.

## Maintenance warning

All endpoints in this document are observed website implementation details. The request parameters, HTML classes, data attributes, token format, mapper contract, server labels, and embed hosts may change without notice.

The most important maintenance rule is to preserve the boundaries:

```text
Catalog identity
    -> episode identity
    -> server-list token
    -> link token
    -> validated embed
```

Do not collapse those values into one assumed identifier. That separation makes provider changes diagnosable and prevents an embed-host change from corrupting catalog or history identity.
