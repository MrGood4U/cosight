[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$pythonCommand = Get-Command 'python.exe' -ErrorAction SilentlyContinue
if (-not $pythonCommand) {
  $pythonCommand = Get-Command 'py.exe' -ErrorAction SilentlyContinue
}

if (-not $pythonCommand) {
  Write-Warning 'Python was not found; skipping Legacy bridge tests. CI installs Python explicitly.'
  exit 0
}

Push-Location $projectRoot
try {
  if ($pythonCommand.Name -eq 'py.exe') {
    & $pythonCommand.Source '-3' '-m' 'unittest' 'discover' '-s' 'tests/python' '-p' 'test_*.py' '-v'
  } else {
    & $pythonCommand.Source '-m' 'unittest' 'discover' '-s' 'tests/python' '-p' 'test_*.py' '-v'
  }
  if ($LASTEXITCODE -ne 0) { throw "Python tests failed ($LASTEXITCODE)." }
} finally {
  Pop-Location
}
