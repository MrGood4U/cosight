[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$sourceRoot = Join-Path $projectRoot 'native\system-audio-go'

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
$testCache = Join-Path $projectRoot 'build\go-system-audio-test-cache'
New-Item -ItemType Directory -Path $testCache -Force | Out-Null
$previousCache = $env:GOCACHE
$env:GOCACHE = $testCache
try {
  & $go -C $sourceRoot test ./...
  if ($LASTEXITCODE -ne 0) { throw "System audio Go tests failed ($LASTEXITCODE)." }
} finally {
  if ($null -eq $previousCache) {
    Remove-Item Env:GOCACHE -ErrorAction SilentlyContinue
  } else {
    $env:GOCACHE = $previousCache
  }
}
