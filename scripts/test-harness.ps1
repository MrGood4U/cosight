[CmdletBinding()]
param(
  [switch]$Integration
)

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$harnessRoot = Join-Path $projectRoot 'harness'
$testCache = Join-Path $projectRoot 'build\go-test-cache'

$goCommand = Get-Command 'go.exe' -ErrorAction SilentlyContinue
if (-not $goCommand) {
  $knownPath = 'D:\Program Files\Go\bin\go.exe'
  if (Test-Path -LiteralPath $knownPath) {
    $goPath = $knownPath
  } else {
    throw 'Go 1.27+ was not found. Install Go or add go.exe to PATH.'
  }
} else {
  $goPath = $goCommand.Source
}

New-Item -ItemType Directory -Path $testCache -Force | Out-Null
$previousCache = $env:GOCACHE
$env:GOCACHE = $testCache
try {
  $arguments = @('-C', $harnessRoot, 'test')
  if ($Integration) { $arguments += '-tags=integration' }
  $arguments += './...'
  & $goPath @arguments
  if ($LASTEXITCODE -ne 0) {
    $scope = if ($Integration) { 'integration' } else { 'unit' }
    throw "Harness $scope tests failed ($LASTEXITCODE)."
  }
} finally {
  if ($null -eq $previousCache) {
    Remove-Item Env:GOCACHE -ErrorAction SilentlyContinue
  } else {
    $env:GOCACHE = $previousCache
  }
}
