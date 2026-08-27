[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$harnessRoot = Join-Path $projectRoot 'harness'
$outputRoot = Join-Path $projectRoot 'build\harness'
$outputFile = Join-Path $outputRoot 'cosight-harness.exe'

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
$goCache = Join-Path $projectRoot 'build\go-cache'
New-Item -ItemType Directory -Path $outputRoot -Force | Out-Null

Write-Host '[Harness] Formatting and compiling the Go orchestrator...' -ForegroundColor Cyan
$previousCache = $env:GOCACHE
$env:GOCACHE = $goCache
try {
  & $go -C $harnessRoot fmt ./...
  if ($LASTEXITCODE -ne 0) { throw "Go fmt failed ($LASTEXITCODE)." }
  & $go -C $harnessRoot build -o $outputFile ./...
  if ($LASTEXITCODE -ne 0) { throw "Harness build failed ($LASTEXITCODE)." }
} finally {
  $env:GOCACHE = $previousCache
}

if (-not (Test-Path -LiteralPath $outputFile)) {
  throw "Harness executable was not generated: $outputFile"
}
Write-Host "[Harness] Ready: $outputFile" -ForegroundColor Green
