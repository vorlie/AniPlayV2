# Anikoto 2 scraping commands

Command reference for reproducing AniPlay's observed `anikoto.cz` request flow.

Last verified: 2026-07-27

This is the command-focused companion to
[`anikoto2-resolving.md`](./anikoto2-resolving.md). Read that document for the
identifier model, response interpretation, security boundaries, application
behavior, and maintenance guidance.

These endpoints are private website implementation details rather than a
public API. Use them sparingly, retain one provider session between stages,
and do not publish cookies, server tokens, or resolved embed URLs.

## Requirements

The examples use:

- `curl.exe` or curl;
- `jq`;
- `rg`;
- a temporary cookie jar;
- optionally Microsoft Edge for browser-level inspection.

On Windows, use `curl.exe` explicitly. Windows PowerShell 5.1 can map `curl`
to `Invoke-WebRequest`, whose arguments are incompatible with curl.

### Verify the tools

```powershell
curl.exe --version
jq --version
rg --version
```

```sh
curl --version
jq --version
rg --version
```

## Set up temporary values

Replace example identifiers only with values obtained from the immediately
preceding provider response. Do not reuse tokens from an old session.

### PowerShell

```powershell
$AnikotoBase = 'https://anikoto.cz'
$MapperBase = 'https://mapper.nekostream.site/api/mal'
$SearchQuery = 'black torch'
$ShowSlug = 'black-torch-1d364'
$CookieJar = Join-Path $env:TEMP 'aniplay-anikoto2-cookies.txt'
$WorkDir = Join-Path $env:TEMP 'aniplay-anikoto2-inspect'
$UserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36'

New-Item -ItemType Directory -Force -Path $WorkDir | Out-Null
```

### Bash

```sh
ANIKOTO_BASE='https://anikoto.cz'
MAPPER_BASE='https://mapper.nekostream.site/api/mal'
SEARCH_QUERY='black torch'
SHOW_SLUG='black-torch-1d364'
COOKIE_JAR="${TMPDIR:-/tmp}/aniplay-anikoto2-cookies.txt"
WORK_DIR="${TMPDIR:-/tmp}/aniplay-anikoto2-inspect"
USER_AGENT='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36'

mkdir -p "$WORK_DIR"
```

## Complete request order

```text
1. GET /ajax/anime/search?keyword=...
2. GET /watch/<show-slug>
3. GET /ajax/episode/list/<show-id>?style=grid&vrf=
4. GET /watch/<show-slug>/ep-<episode-slug>
5. GET /ajax/server/list?servers=<episode-token>
6. Optional: GET mapper.nekostream.site/api/mal/<mal>/<slug>/<timestamp>
7. GET /ajax/server?get=<server-link-token>
```

Stages 2 through 7 should use the same cookie jar. Loading the episode page
before the server-token exchange is important; otherwise `/ajax/server` can
return `Bad request`.

## 1. Search the catalog

Search returns a JSON envelope whose `result` field contains HTML.

### PowerShell

```powershell
$EncodedQuery = [uri]::EscapeDataString($SearchQuery)
$SearchJson = Join-Path $WorkDir 'search.json'
$SearchHtml = Join-Path $WorkDir 'search.html'

curl.exe --fail-with-body --silent --show-error `
  --user-agent $UserAgent `
  --header 'Accept: application/json, text/javascript, */*; q=0.01' `
  --header "Referer: $AnikotoBase/" `
  --header 'X-Requested-With: XMLHttpRequest' `
  --cookie-jar $CookieJar `
  --cookie $CookieJar `
  --output $SearchJson `
  "$AnikotoBase/ajax/anime/search?keyword=$EncodedQuery"

jq '{status, resultType: (.result | type), resultLength: (.result | length)}' $SearchJson
jq --raw-output '.result // ""' $SearchJson |
  Set-Content -LiteralPath $SearchHtml -Encoding utf8

rg --only-matching `
  'href="[^"]*/watch/[^"]+"|class="(?:name|d-title)"[^>]*>[^<]+' `
  $SearchHtml
```

### Bash

```sh
ENCODED_QUERY="$(printf '%s' "$SEARCH_QUERY" | jq -sRr @uri)"
SEARCH_JSON="$WORK_DIR/search.json"
SEARCH_HTML="$WORK_DIR/search.html"

curl --fail-with-body --silent --show-error \
  --user-agent "$USER_AGENT" \
  --header 'Accept: application/json, text/javascript, */*; q=0.01' \
  --header "Referer: $ANIKOTO_BASE/" \
  --header 'X-Requested-With: XMLHttpRequest' \
  --cookie-jar "$COOKIE_JAR" \
  --cookie "$COOKIE_JAR" \
  --output "$SEARCH_JSON" \
  "$ANIKOTO_BASE/ajax/anime/search?keyword=$ENCODED_QUERY"

jq '{status, resultType: (.result | type), resultLength: (.result | length)}' "$SEARCH_JSON"
jq --raw-output '.result // ""' "$SEARCH_JSON" > "$SEARCH_HTML"
rg --only-matching \
  'href="[^"]*/watch/[^"]+"|class="(?:name|d-title)"[^>]*>[^<]+' \
  "$SEARCH_HTML"
```

Select the exact `/watch/<slug>` returned by the provider. Do not manufacture
the slug from the displayed title.

## 2. Load the show page

This establishes the cookie session and exposes the provider's numeric show
ID and canonical URL on `#watch-main`.

### PowerShell

```powershell
$ShowUrl = "$AnikotoBase/watch/$ShowSlug"
$ShowHtml = Join-Path $WorkDir 'show.html'

curl.exe --fail-with-body --silent --show-error --location `
  --user-agent $UserAgent `
  --header 'Accept: text/html,application/xhtml+xml,*/*;q=0.8' `
  --header "Referer: $AnikotoBase/" `
  --cookie-jar $CookieJar `
  --cookie $CookieJar `
  --output $ShowHtml `
  $ShowUrl

$WatchMain = rg --only-matching '<[^>]+id="watch-main"[^>]*>' $ShowHtml |
  Select-Object -First 1
$ShowId = [regex]::Match($WatchMain, 'data-id="([0-9]+)"').Groups[1].Value
$CanonicalShowUrl = [regex]::Match(
  $WatchMain,
  'data-url="([^"]+)"'
).Groups[1].Value

[pscustomobject]@{
  ShowId = $ShowId
  CanonicalShowUrl = $CanonicalShowUrl
}
```

### Bash

```sh
SHOW_URL="$ANIKOTO_BASE/watch/$SHOW_SLUG"
SHOW_HTML="$WORK_DIR/show.html"

curl --fail-with-body --silent --show-error --location \
  --user-agent "$USER_AGENT" \
  --header 'Accept: text/html,application/xhtml+xml,*/*;q=0.8' \
  --header "Referer: $ANIKOTO_BASE/" \
  --cookie-jar "$COOKIE_JAR" \
  --cookie "$COOKIE_JAR" \
  --output "$SHOW_HTML" \
  "$SHOW_URL"

WATCH_MAIN="$(rg --only-matching '<[^>]+id="watch-main"[^>]*>' "$SHOW_HTML" | head -n 1)"
SHOW_ID="$(printf '%s' "$WATCH_MAIN" | rg --only-matching 'data-id="[0-9]+"' | rg --only-matching '[0-9]+')"
CANONICAL_SHOW_URL="$(printf '%s' "$WATCH_MAIN" | rg --only-matching 'data-url="[^"]+"' | sed -E 's/^data-url="|"$//g')"

printf 'Show ID: %s\nCanonical URL: %s\n' "$SHOW_ID" "$CANONICAL_SHOW_URL"
```

Verify that the canonical URL uses the exact `https://anikoto.cz` origin
before using it as a referer.

## 3. Request the episode list

At the time of verification, the website accepts an empty `vrf` parameter.

### PowerShell

```powershell
$EpisodeListJson = Join-Path $WorkDir 'episode-list.json'
$EpisodeListHtml = Join-Path $WorkDir 'episode-list.html'

curl.exe --fail-with-body --silent --show-error `
  --user-agent $UserAgent `
  --header 'Accept: application/json, text/javascript, */*; q=0.01' `
  --header "Referer: $CanonicalShowUrl" `
  --header 'X-Requested-With: XMLHttpRequest' `
  --cookie-jar $CookieJar `
  --cookie $CookieJar `
  --output $EpisodeListJson `
  "$AnikotoBase/ajax/episode/list/$ShowId`?style=grid&vrf="

jq '{status, resultType: (.result | type), resultLength: (.result | length)}' `
  $EpisodeListJson
jq --raw-output '.result // ""' $EpisodeListJson |
  Set-Content -LiteralPath $EpisodeListHtml -Encoding utf8
```

Display episode rows while redacting server-list tokens:

```powershell
(Get-Content -Raw -LiteralPath $EpisodeListHtml) `
  -replace 'data-ids="[^"]+"', 'data-ids="[REDACTED]"' |
  rg --only-matching '<a[^>]+data-num="[^"]+"[^>]*>'
```

### Bash

```sh
EPISODE_LIST_JSON="$WORK_DIR/episode-list.json"
EPISODE_LIST_HTML="$WORK_DIR/episode-list.html"

curl --fail-with-body --silent --show-error \
  --user-agent "$USER_AGENT" \
  --header 'Accept: application/json, text/javascript, */*; q=0.01' \
  --header "Referer: $CANONICAL_SHOW_URL" \
  --header 'X-Requested-With: XMLHttpRequest' \
  --cookie-jar "$COOKIE_JAR" \
  --cookie "$COOKIE_JAR" \
  --output "$EPISODE_LIST_JSON" \
  "$ANIKOTO_BASE/ajax/episode/list/$SHOW_ID?style=grid&vrf="

jq '{status, resultType: (.result | type), resultLength: (.result | length)}' \
  "$EPISODE_LIST_JSON"
jq --raw-output '.result // ""' "$EPISODE_LIST_JSON" > "$EPISODE_LIST_HTML"
sed -E 's/data-ids="[^"]+"/data-ids="[REDACTED]"/g' "$EPISODE_LIST_HTML" \
  | rg --only-matching '<a[^>]+data-num="[^"]+"[^>]*>'
```

For the selected episode, obtain these attributes from the unredacted local
file:

| Attribute | Use |
| --- | --- |
| `data-num` | Visible episode number |
| `data-slug` | Canonical episode path and mapper input |
| `data-ids` | Opaque `/ajax/server/list` token |
| `data-id` | Internal episode ID |
| `data-mal` | Optional mapper MAL ID |
| `data-timestamp` | Optional mapper timestamp |
| `data-sub` | Advertised SUB availability |
| `data-dub` | Advertised DUB availability |

### Extract one episode in PowerShell

```powershell
$SelectedEpisode = '1'
$EpisodeAnchor = [regex]::Matches(
  (Get-Content -Raw -LiteralPath $EpisodeListHtml),
  '<a\b[^>]*data-num="[^"]+"[^>]*>'
) | Where-Object {
  $_.Value -match ('data-num="' + [regex]::Escape($SelectedEpisode) + '"')
} | Select-Object -First 1

$EpisodeMarkup = $EpisodeAnchor.Value
$EpisodeSlug = [regex]::Match(
  $EpisodeMarkup,
  'data-slug="([^"]+)"'
).Groups[1].Value
$EpisodeToken = [regex]::Match(
  $EpisodeMarkup,
  'data-ids="([^"]+)"'
).Groups[1].Value
$MalId = [regex]::Match(
  $EpisodeMarkup,
  'data-mal="([^"]+)"'
).Groups[1].Value
$EpisodeTimestamp = [regex]::Match(
  $EpisodeMarkup,
  'data-timestamp="([^"]+)"'
).Groups[1].Value

[pscustomobject]@{
  Episode = $SelectedEpisode
  Slug = $EpisodeSlug
  HasServerToken = [bool]$EpisodeToken
  MalId = $MalId
  HasTimestamp = [bool]$EpisodeTimestamp
}
```

The output deliberately reports only whether sensitive values exist.

### Extract one episode in Bash

```sh
SELECTED_EPISODE='1'
EPISODE_MARKUP="$(
  rg --only-matching '<a\b[^>]*data-num="[^"]+"[^>]*>' "$EPISODE_LIST_HTML" \
    | rg "data-num=\"$SELECTED_EPISODE\"" \
    | head -n 1
)"

attribute_value() {
  printf '%s' "$EPISODE_MARKUP" \
    | sed -nE "s/.*$1=\"([^\"]+)\".*/\1/p"
}

EPISODE_SLUG="$(attribute_value data-slug)"
EPISODE_TOKEN="$(attribute_value data-ids)"
MAL_ID="$(attribute_value data-mal)"
EPISODE_TIMESTAMP="$(attribute_value data-timestamp)"

printf 'Episode: %s\nSlug: %s\nHas server token: %s\nMAL ID: %s\nHas timestamp: %s\n' \
  "$SELECTED_EPISODE" \
  "$EPISODE_SLUG" \
  "$([ -n "$EPISODE_TOKEN" ] && printf yes || printf no)" \
  "$MAL_ID" \
  "$([ -n "$EPISODE_TIMESTAMP" ] && printf yes || printf no)"
```

The token and timestamp remain in shell variables but are not printed.

## 4. Load the selected episode page

This initializes the episode session before the token exchange.

### PowerShell

```powershell
$EpisodeUrl = "$CanonicalShowUrl/ep-$EpisodeSlug"
$EpisodeHtml = Join-Path $WorkDir 'episode.html'

curl.exe --fail-with-body --silent --show-error --location `
  --user-agent $UserAgent `
  --header 'Accept: text/html,application/xhtml+xml,*/*;q=0.8' `
  --header "Referer: $CanonicalShowUrl" `
  --cookie-jar $CookieJar `
  --cookie $CookieJar `
  --output $EpisodeHtml `
  $EpisodeUrl
```

### Bash

```sh
EPISODE_URL="$CANONICAL_SHOW_URL/ep-$EPISODE_SLUG"
EPISODE_HTML="$WORK_DIR/episode.html"

curl --fail-with-body --silent --show-error --location \
  --user-agent "$USER_AGENT" \
  --header 'Accept: text/html,application/xhtml+xml,*/*;q=0.8' \
  --header "Referer: $CANONICAL_SHOW_URL" \
  --cookie-jar "$COOKIE_JAR" \
  --cookie "$COOKIE_JAR" \
  --output "$EPISODE_HTML" \
  "$EPISODE_URL"
```

## 5. Request the server matrix

Pass the exact `data-ids` value through URL encoding.

### PowerShell

```powershell
$EncodedEpisodeToken = [uri]::EscapeDataString($EpisodeToken)
$ServerListJson = Join-Path $WorkDir 'server-list.json'
$ServerListHtml = Join-Path $WorkDir 'server-list.html'

curl.exe --fail-with-body --silent --show-error `
  --user-agent $UserAgent `
  --header 'Accept: application/json, text/javascript, */*; q=0.01' `
  --header "Referer: $EpisodeUrl" `
  --header 'X-Requested-With: XMLHttpRequest' `
  --cookie-jar $CookieJar `
  --cookie $CookieJar `
  --output $ServerListJson `
  "$AnikotoBase/ajax/server/list?servers=$EncodedEpisodeToken"

jq '{status, resultType: (.result | type), resultLength: (.result | length)}' `
  $ServerListJson
jq --raw-output '.result // ""' $ServerListJson |
  Set-Content -LiteralPath $ServerListHtml -Encoding utf8
```

Display language groups and server names without link tokens:

```powershell
(Get-Content -Raw -LiteralPath $ServerListHtml) `
  -replace 'data-link-id="[^"]+"', 'data-link-id="[REDACTED]"' |
  rg --only-matching `
    '<div class="type"[^>]*>|<label[^>]*>.*?</label>|<li[^>]*>[^<]*</li>'
```

### Bash

```sh
ENCODED_EPISODE_TOKEN="$(printf '%s' "$EPISODE_TOKEN" | jq -sRr @uri)"
SERVER_LIST_JSON="$WORK_DIR/server-list.json"
SERVER_LIST_HTML="$WORK_DIR/server-list.html"

curl --fail-with-body --silent --show-error \
  --user-agent "$USER_AGENT" \
  --header 'Accept: application/json, text/javascript, */*; q=0.01' \
  --header "Referer: $EPISODE_URL" \
  --header 'X-Requested-With: XMLHttpRequest' \
  --cookie-jar "$COOKIE_JAR" \
  --cookie "$COOKIE_JAR" \
  --output "$SERVER_LIST_JSON" \
  "$ANIKOTO_BASE/ajax/server/list?servers=$ENCODED_EPISODE_TOKEN"

jq '{status, resultType: (.result | type), resultLength: (.result | length)}' \
  "$SERVER_LIST_JSON"
jq --raw-output '.result // ""' "$SERVER_LIST_JSON" > "$SERVER_LIST_HTML"
sed -E 's/data-link-id="[^"]+"/data-link-id="[REDACTED]"/g' "$SERVER_LIST_HTML" \
  | rg --only-matching \
    '<div class="type"[^>]*>|<label[^>]*>.*?</label>|<li[^>]*>[^<]*</li>'
```

Selection rules:

- SUB mode can use SUB and H-SUB groups;
- DUB mode uses only DUB groups;
- rows without `data-link-id` are not playable servers.

## 6. Query the optional mapper

Run this only when the episode exposes a MAL ID, slug, and timestamp. Mapper
failure must not prevent base Anikoto server resolution.

### PowerShell

```powershell
$EncodedMalId = [uri]::EscapeDataString($MalId)
$EncodedEpisodeSlug = [uri]::EscapeDataString($EpisodeSlug)
$EncodedTimestamp = [uri]::EscapeDataString($EpisodeTimestamp)
$MapperJson = Join-Path $WorkDir 'mapper.json'

curl.exe --fail-with-body --silent --show-error `
  --user-agent $UserAgent `
  --header 'Accept: application/json, text/plain, */*' `
  --header "Referer: $AnikotoBase/" `
  --output $MapperJson `
  "$MapperBase/$EncodedMalId/$EncodedEpisodeSlug/$EncodedTimestamp"

jq 'to_entries | map(select(.value | type == "object") | {
  provider: .key,
  hasSub: (.value.sub.url? | type == "string"),
  hasDub: (.value.dub.url? | type == "string")
})' $MapperJson
```

### Bash

```sh
ENCODED_MAL_ID="$(printf '%s' "$MAL_ID" | jq -sRr @uri)"
ENCODED_EPISODE_SLUG="$(printf '%s' "$EPISODE_SLUG" | jq -sRr @uri)"
ENCODED_TIMESTAMP="$(printf '%s' "$EPISODE_TIMESTAMP" | jq -sRr @uri)"
MAPPER_JSON="$WORK_DIR/mapper.json"

curl --fail-with-body --silent --show-error \
  --user-agent "$USER_AGENT" \
  --header 'Accept: application/json, text/plain, */*' \
  --header "Referer: $ANIKOTO_BASE/" \
  --output "$MAPPER_JSON" \
  "$MAPPER_BASE/$ENCODED_MAL_ID/$ENCODED_EPISODE_SLUG/$ENCODED_TIMESTAMP"

jq 'to_entries | map(select(.value | type == "object") | {
  provider: .key,
  hasSub: (.value.sub.url? | type == "string"),
  hasDub: (.value.dub.url? | type == "string")
})' "$MAPPER_JSON"
```

Mapper `url` fields are additional opaque server tokens, not media URLs.

## 7. Exchange a server link token

Extract a current `data-link-id` from the local unredacted server-list HTML.
Do not paste it into documentation, shell output shared with others, or an
issue report.

### Extract and resolve one server in PowerShell

```powershell
$SelectedServerName = 'VidPlay-1'
$ServerItem = [regex]::Matches(
  (Get-Content -Raw -LiteralPath $ServerListHtml),
  '<li\b[^>]*data-link-id="[^"]+"[^>]*>.*?</li>'
) | Where-Object {
  $_.Value -match [regex]::Escape($SelectedServerName)
} | Select-Object -First 1

$ServerToken = [regex]::Match(
  $ServerItem.Value,
  'data-link-id="([^"]+)"'
).Groups[1].Value
$EncodedServerToken = [uri]::EscapeDataString($ServerToken)
$ServerJson = Join-Path $WorkDir 'server.json'

curl.exe --fail-with-body --silent --show-error `
  --user-agent $UserAgent `
  --header 'Accept: application/json, text/javascript, */*; q=0.01' `
  --header "Referer: $EpisodeUrl" `
  --header 'X-Requested-With: XMLHttpRequest' `
  --cookie-jar $CookieJar `
  --cookie $CookieJar `
  --output $ServerJson `
  "$AnikotoBase/ajax/server?get=$EncodedServerToken"
```

Inspect only the response status and resolved origin:

```powershell
$ServerPayload = Get-Content -Raw -LiteralPath $ServerJson | ConvertFrom-Json
$ResolvedValue = if ($ServerPayload.result.url) {
  $ServerPayload.result.url
} else {
  $ServerPayload.result
}
$ResolvedUri = [uri]$ResolvedValue

[pscustomobject]@{
  Status = $ServerPayload.status
  Scheme = $ResolvedUri.Scheme
  Host = $ResolvedUri.DnsSafeHost
}
```

### Bash

Set `SERVER_TOKEN` from a current local response:

```sh
ENCODED_SERVER_TOKEN="$(printf '%s' "$SERVER_TOKEN" | jq -sRr @uri)"
SERVER_JSON="$WORK_DIR/server.json"

curl --fail-with-body --silent --show-error \
  --user-agent "$USER_AGENT" \
  --header 'Accept: application/json, text/javascript, */*; q=0.01' \
  --header "Referer: $EPISODE_URL" \
  --header 'X-Requested-With: XMLHttpRequest' \
  --cookie-jar "$COOKIE_JAR" \
  --cookie "$COOKIE_JAR" \
  --output "$SERVER_JSON" \
  "$ANIKOTO_BASE/ajax/server?get=$ENCODED_SERVER_TOKEN"

jq '{
  status,
  resolvedOrigin: (
    (.result.url? // .result // "")
    | capture("^(?<origin>https://[^/]+)").origin?
  )
}' "$SERVER_JSON"
```

Avoid commands that print `.result.url` directly. The URL may be temporary,
signed, region-specific, or otherwise sensitive.

## 8. Inspect status, headers, and redirects

When a request returns an unexpected body, print headers without printing the
body.

### Document request

```powershell
curl.exe --silent --show-error --location `
  --dump-header - `
  --output $null `
  --user-agent $UserAgent `
  --cookie $CookieJar `
  $EpisodeUrl
```

```sh
curl --silent --show-error --location \
  --dump-header - \
  --output /dev/null \
  --user-agent "$USER_AGENT" \
  --cookie "$COOKIE_JAR" \
  "$EPISODE_URL"
```

### AJAX request

```powershell
curl.exe --silent --show-error `
  --dump-header - `
  --output $null `
  --user-agent $UserAgent `
  --header 'Accept: application/json, text/javascript, */*; q=0.01' `
  --header "Referer: $EpisodeUrl" `
  --header 'X-Requested-With: XMLHttpRequest' `
  --cookie $CookieJar `
  "$AnikotoBase/ajax/server/list?servers=$EncodedEpisodeToken"
```

Inspect:

- status code;
- content type;
- redirect locations and final hostname;
- rate-limit headers, when present.

Headers can include cookies. Redact `Set-Cookie` before sharing output.

## 9. Observe the browser workflow

Use a real browser when the curl sequence differs from the website. It can
reveal a changed request order, cookie requirement, AJAX parameter, or
referer.

Start Edge with an isolated temporary profile:

```powershell
$Edge = Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'
$EdgeProfile = Join-Path $env:TEMP 'aniplay-anikoto2-edge'

& $Edge `
  --user-data-dir=$EdgeProfile `
  --remote-debugging-port=9222 `
  --new-window `
  "$AnikotoBase/watch/$ShowSlug"
```

Open DevTools, select **Network**, filter to **Fetch/XHR**, then select an
episode and change servers. Relevant request names include:

```text
anime/search
episode/list
server/list
ajax/server
```

Confirm that the debugging endpoint is active:

```powershell
curl.exe --silent http://127.0.0.1:9222/json/version |
  jq '{Browser, webSocketDebuggerUrl}'
curl.exe --silent http://127.0.0.1:9222/json/list |
  jq 'map({title, url})'
```

Do not share an unsanitized HAR export. HAR files can contain complete tokens,
cookies, response bodies, and resolved embed URLs.

Close the isolated window manually if other Edge instances are running.

## 10. Run AniPlay's parser tests

The deterministic tests use sanitized fixtures and do not scrape the live
provider:

```powershell
cd D:\Projekty\AniPlayV2\ani-cli-gui
npx vitest run electron/providers/anikoto2.test.ts
```

Run the complete project validation:

```powershell
npm test
npm run lint
npm run build:ui
```

Live provider checks should remain manual or explicitly opt-in. Normal CI
should not scrape `anikoto.cz`.

## 11. Sanitize files before sharing

Search for common sensitive fields:

```powershell
rg --line-number `
  'data-ids=|data-link-id=|Set-Cookie:|https://[^ ]+\?.*(token|sig|expires)=' `
  $WorkDir
```

```sh
rg --line-number \
  'data-ids=|data-link-id=|Set-Cookie:|https://[^ ]+\?.*(token|sig|expires)=' \
  "$WORK_DIR"
```

Create redacted HTML copies:

```powershell
Get-ChildItem -LiteralPath $WorkDir -Filter '*.html' | ForEach-Object {
  $SanitizedPath = Join-Path $WorkDir ($_.BaseName + '.sanitized.html')
  (Get-Content -Raw -LiteralPath $_.FullName) `
    -replace 'data-ids="[^"]+"', 'data-ids="[REDACTED]"' `
    -replace 'data-link-id="[^"]+"', 'data-link-id="[REDACTED]"' |
    Set-Content -LiteralPath $SanitizedPath -Encoding utf8
}
```

```sh
for source in "$WORK_DIR"/*.html; do
  [ -e "$source" ] || continue
  sed -E \
    -e 's/data-ids="[^"]+"/data-ids="[REDACTED]"/g' \
    -e 's/data-link-id="[^"]+"/data-link-id="[REDACTED]"/g' \
    "$source" > "${source%.html}.sanitized.html"
done
```

Review sanitized output manually. Automated replacement cannot recognize
every future signed URL or token format.

## 12. Clean up

Raw HTML, JSON, and the cookie jar contain provider state and opaque tokens.

### PowerShell

Resolve and inspect the exact paths first:

```powershell
$ResolvedWorkDir = [System.IO.Path]::GetFullPath($WorkDir)
$ResolvedCookieJar = [System.IO.Path]::GetFullPath($CookieJar)
$ResolvedTemp = [System.IO.Path]::GetFullPath($env:TEMP)

[pscustomobject]@{
  WorkDir = $ResolvedWorkDir
  CookieJar = $ResolvedCookieJar
  TempRoot = $ResolvedTemp
}
```

After confirming both targets are inside the intended temporary directory:

```powershell
Remove-Item -LiteralPath $ResolvedCookieJar -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $ResolvedWorkDir -Recurse -Force
```

### Bash

Inspect the expanded paths before recursive cleanup:

```sh
printf 'Cookie jar: %s\nWork directory: %s\n' "$COOKIE_JAR" "$WORK_DIR"
rm -f -- "$COOKIE_JAR"
rm -rf -- "$WORK_DIR"
```

## Minimal request checklist

```text
Search
  -> choose canonical slug
  -> load show page in cookie jar
  -> extract numeric show ID
  -> load episode list
  -> select episode token and slug
  -> load episode page in the same cookie jar
  -> load server matrix
  -> optionally load mapper tokens
  -> exchange each selected-language token
  -> validate the returned HTTPS embed URL
```

Do not skip the full examples when diagnosing a provider change: the request
headers, referer, cookie continuity, URL encoding, and redaction steps are all
part of the observed workflow.
