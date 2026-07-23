$ErrorActionPreference = 'Stop'

function Invoke-NpmScript([string] $Name) {
  & npm run $Name
  if ($LASTEXITCODE -ne 0) {
    throw "npm run $Name failed with exit code $LASTEXITCODE"
  }
}

Invoke-NpmScript 'showcase:install'
Invoke-NpmScript 'showcase:prepare'
Invoke-NpmScript 'showcase:record'
Invoke-NpmScript 'showcase:render'

Write-Host ''
Write-Host 'AniPlay showcase complete.'
Write-Host 'MP4: showcase/output/final/aniplay-showcase.mp4'
Write-Host 'GIF: ../docs/assets/aniplay-showcase.gif'
