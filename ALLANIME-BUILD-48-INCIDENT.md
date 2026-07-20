# AllAnime build 48 episode-loading incident

Last updated: July 20, 2026

## Summary

AllAnime rolled out a new request-encryption generation identified as epoch `6884`, build `48`. AniPlay versions through `1.15.2` could still search the AllAnime catalog and list episodes, but loading an episode's playable sources could fail because the episode endpoint uses a separate encrypted request and response workflow.

AniPlay `1.15.3` updates the bundled build material and makes the episode request fallback sequence resilient to short-lived disagreements between AllAnime's bootstrap CDN and GraphQL API.

This is an upstream compatibility incident. It is not caused by the media player, local history, antivirus software, or AniPlay modifying a `countryOfOrigin` property.

## User-visible symptoms

Affected requests may fail with one or more of these messages:

```text
Episode response could not be decoded: Cannot set properties of undefined (setting 'countryOfOrigin')
AA_CRYPTO_CROSS_KEY
AA_CRYPTO_STALE
Too many requests, please try again in 5 seconds.
No working streams were found for this episode.
```

Debug logs may also show persisted or full GraphQL requests failing for different epoch/build combinations. A separate partial-failure mode can extract a source list successfully and then receive HTTP 500 responses while resolving individual provider URLs; that happens later in the pipeline and is not the `countryOfOrigin` failure itself.

The `countryOfOrigin` exception is returned by AllAnime's GraphQL backend. AniPlay does not contain an assignment to that property. The previous error wrapper described every failure as a decoding error, which made this upstream GraphQL exception look like a local JSON-processing bug.

## Affected versions

- AniPlay `1.9.4` through `1.15.2`: the current remote notice recommends updating.
- AniPlay `1.15.3` and newer: includes the build-48 compatibility update.
- AniPlay `1.9.3` and older: already covered by the earlier AllAnime backend migration notice and should update directly to the newest release.

Other catalog providers are independent of this incident. Anikoto remains the recommended English fallback while AllAnime is unavailable or unstable.

## What changed upstream

On July 20, AniPlay's runtime bootstrap discovery reported:

```text
epoch: 6884
build: 48
API: https://api.mkissa.net/api
bootstrap: https://mkissa.to/
```

The build also supplied new XOR key material used to derive the AES-256 request key. The key material in AniPlay's diagnostic export matched the current MKissa application bundle.

The older persisted episode-query hash remained in ani-cli-compatible clients but was no longer present in the current MKissa application chunks. Depending on which CDN and API nodes handled a request, the old persisted request could return a GraphQL resolver exception, a crypto mismatch, or a stale-token error. Trying every persisted candidate before attempting a full GraphQL query also increased the chance of reaching AllAnime's rate limiter.

Search and episode listing could continue working because those operations do not use the same encrypted episode-source response pipeline. A successful search therefore did not prove that source loading was healthy.

## Request workflow

For each crypto candidate, AniPlay now performs the episode request in this order:

1. Construct a five-minute-bucketed `aaReq` token using the candidate epoch, build ID, query hash, and AES-256-GCM key.
2. Try the persisted episode query.
3. If it fails for a reason other than rate limiting, immediately try the complete GraphQL query with a token derived from that query's SHA-256 hash.
4. Decode a returned `tobeparsed` payload with the candidate key, response fallback key, or legacy CTR mode when appropriate.
5. Continue to the next candidate only when the current candidate cannot produce a source list.
6. Stop after an exhausted rate-limit retry instead of multiplying requests across every fallback.

The candidate order is:

1. Runtime-discovered epoch and build.
2. The previous epoch with the discovered build and key.
3. The next epoch with the discovered build and key.
4. Bundled epoch `6884`, build `48` material.
5. Legacy epoch `4128`, build `12` material.
6. Legacy epoch `4128`, build `9` material.

Adjacent epochs cover brief bootstrap/API rollout skew. The bundled current material allows episode requests to continue when the bootstrap page or crypto chunk cannot be fetched. The legacy material remains available for older response formats and rollback windows.

## Fixes in AniPlay 1.15.3

- Updated the bundled AllAnime fallback to epoch `6884`, build `48`, using the matching current key material.
- Preserved the older epoch `4128` key separately for builds `12` and `9`; old build IDs are no longer paired with the new key.
- Added previous- and next-epoch candidates around dynamically discovered material.
- Changed request ordering from "all persisted queries, then all full queries" to "persisted then full query per candidate."
- Stopped fallback expansion after an exhausted GraphQL rate-limit retry.
- Added epoch and build IDs to episode-request debug messages.
- Replaced the misleading blanket decoding error with an error that identifies exhausted request and decode fallbacks.
- Added regression coverage for candidate order and the exact build-48 derived key.

The Rust port received the same current and legacy bundled material and the same per-candidate request ordering.

## Workarounds

The preferred resolution is to update to AniPlay `1.15.3` or newer.

If an update is not yet available or AllAnime remains unstable:

1. Open AniPlay's catalog-provider selector.
2. Select **Anikoto** for English sources.
3. Search for the title again so its provider-specific ID is used.

Do not reuse an AllAnime show ID with another provider. Catalog identifiers are provider-specific.

A VPN may help only when a network filter blocks `mkissa.to`, `api.mkissa.net`, or a media host. It does not correct stale crypto material or a GraphQL resolver failure. For example, a FortiGuard category block is a separate network-policy problem even when it produces a similar top-level network error.

## Diagnostics

Enable AllAnime diagnostics before launching AniPlay:

```powershell
$env:ANIPLAY_DEBUG_ALLANIME = "1"
```

Use `full` instead of `1` only when the complete raw episode response is needed:

```powershell
$env:ANIPLAY_DEBUG_ALLANIME = "full"
```

The standard debug export includes the discovered epoch, build ID, key derivation inputs, API URL, application bundle URL, cache timestamps, and cipher-map metadata. When reporting a new incident, include:

- AniPlay version.
- Selected catalog provider and sub/dub mode.
- Anime title and episode number.
- Whether search and episode listing succeeded.
- The exported AllAnime debug JSON.
- The relevant request classifications and errors from the console log.
- Whether the same request succeeds on another network.

Review full logs before publishing them. Provider URLs can be temporary, and future diagnostic formats may contain information that should not be posted publicly.

## Distinguishing common failures

| Error | Likely meaning | Recommended action |
| --- | --- | --- |
| `AA_CRYPTO_CROSS_KEY` | Request key and API-side rollout generation disagree | Refresh crypto material or update AniPlay |
| `AA_CRYPTO_STALE` | Epoch, build, or time-bucket material is no longer accepted | Update AniPlay and retry after refreshing diagnostics |
| `countryOfOrigin` property exception | Upstream GraphQL resolver failed while handling the episode request | Use the full-query/current-build fallback or switch providers |
| `Too many requests` | AllAnime rate limiter rejected repeated attempts | Stop retrying and wait for the stated interval |
| Network request to MKissa fails | DNS, TLS, filtering, proxy, or upstream reachability problem | Check the debug error chain and try another permitted network |
| Sources extract successfully but a media URL returns 403/500 | Individual host requires headers, expired, or is down | Try another resolved source/provider |

## Maintainer references

- AllAnime scraper and crypto workflow: [`ani-cli-gui/electron/scrape.ts`](ani-cli-gui/electron/scrape.ts)
- Build-48 regression test: [`ani-cli-gui/electron/scrape.test.ts`](ani-cli-gui/electron/scrape.test.ts)
- Remote notice validation: [`ani-cli-gui/electron/services/remote-notices.test.ts`](ani-cli-gui/electron/services/remote-notices.test.ts)
- Current notice feed source: [`status.json`](status.json)

AllAnime is an external service and may change again without notice. Runtime discovery remains the primary path; bundled material exists only as a controlled fallback.
