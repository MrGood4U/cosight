[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$sourceRoot = Join-Path $projectRoot 'native\system-audio-go'
$outputRoot = Join-Path $projectRoot 'build\system-audio'
$outputFile = Join-Path $outputRoot 'cosight-system-audio-loopback.exe'

if (-not (Test-Path -LiteralPath (Join-Path $sourceRoot 'go.mod'))) {
  throw "System audio Go module was not found: $sourceRoot"
}

function Find-GoPath {
  if ($env:COSIGHT_GO -and (Test-Path -LiteralPath $env:COSIGHT_GO)) {
    return (Resolve-Path -LiteralPath $env:COSIGHT_GO).Path
  }
  $command = Get-Command 'go.exe' -ErrorAction SilentlyContinue
  if ($command) { return $command.Source }
  $knownPath = 'D:\Program Files\Go\bin\go.exe'
  if (Test-Path -LiteralPath $knownPath) { return $knownPath }
  throw 'Go 1.27+ was not found. Install Go or set COSIGHT_GO to go.exe.'
}

$go = Find-GoPath

New-Item -ItemType Directory -Path $outputRoot -Force | Out-Null
Write-Host '[System Audio] Compiling Go Windows Process Loopback helper...' -ForegroundColor Cyan
$goCache = Join-Path $projectRoot 'build\go-cache'
$previousCache = $env:GOCACHE
$env:GOCACHE = $goCache
try {
  & $go -C $sourceRoot fmt ./...
  if ($LASTEXITCODE -ne 0) { throw "System audio Go fmt failed ($LASTEXITCODE)." }
  & $go -C $sourceRoot test ./...
  if ($LASTEXITCODE -ne 0) { throw "System audio Go tests failed ($LASTEXITCODE)." }
  & $go -C $sourceRoot build -trimpath -ldflags '-s -w' -o $outputFile .
} finally {
  $env:GOCACHE = $previousCache
}
if ($LASTEXITCODE -ne 0) { throw "System audio Go helper build failed ($LASTEXITCODE)." }
if (-not (Test-Path -LiteralPath $outputFile)) { throw "System audio helper was not generated: $outputFile" }
Write-Host "[System Audio] Ready: $outputFile" -ForegroundColor Green
