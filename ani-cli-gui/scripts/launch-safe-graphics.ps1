param(
  [string]$ExecutablePath
)

$ErrorActionPreference = 'Stop'
$env:ANIPLAY_SAFE_GRAPHICS = '1'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$candidates = @()

if ($ExecutablePath) {
  $candidates += $ExecutablePath
}

$candidates += @(
  (Join-Path $scriptDir 'AniPlay.exe'),
  (Join-Path $scriptDir '..\AniPlay.exe'),
  (Join-Path $scriptDir '..\..\AniPlay.exe'),
  (Join-Path $env:LOCALAPPDATA 'Programs\AniPlay\AniPlay.exe'),
  (Join-Path $env:ProgramFiles 'AniPlay\AniPlay.exe')
)

if (${env:ProgramFiles(x86)}) {
  $candidates += (Join-Path ${env:ProgramFiles(x86)} 'AniPlay\AniPlay.exe')
}

$exe = $candidates |
  Where-Object { $_ -and (Test-Path -LiteralPath $_ -PathType Leaf) } |
  Select-Object -First 1

if (-not $exe) {
  Write-Host 'Could not find AniPlay.exe automatically.'
  Write-Host 'Drag AniPlay.exe onto this script, or run:'
  Write-Host 'powershell -ExecutionPolicy Bypass -File launch-safe-graphics.ps1 "C:\Path\To\AniPlay.exe"'
  Read-Host 'Press Enter to close'
  exit 1
}

Write-Host "Starting AniPlay in safe graphics mode: $exe"
Start-Process -FilePath $exe -ArgumentList '--safe-graphics' -WorkingDirectory (Split-Path -Parent $exe)
