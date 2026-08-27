[CmdletBinding()]
param(
  [switch]$Clean,
  [switch]$SkipNpmCi
)

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $projectRoot

function Invoke-Checked {
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [Parameter(Mandatory = $false)][string[]]$Arguments = @()
  )

  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed ($LASTEXITCODE): $FilePath $($Arguments -join ' ')"
  }
}

function Find-CommandPath {
  param([Parameter(Mandatory = $true)][string]$Name)
  $command = Get-Command $Name -ErrorAction SilentlyContinue
  if (-not $command) {
    throw "Command not found: $Name. Install Node.js and Python 3.12+ before packaging."
  }
  return $command.Source
}

$npm = Find-CommandPath 'npm.cmd'
$configuredPython = $env:COSIGHT_BUILD_PYTHON
if (-not $configuredPython) { $configuredPython = $env:COSIGHT_PYTHON }
$pyLauncher = Get-Command 'py' -ErrorAction SilentlyContinue
$python = Get-Command 'python' -ErrorAction SilentlyContinue
if ($configuredPython) {
  if (-not (Test-Path -LiteralPath $configuredPython)) {
    throw "COSIGHT_BUILD_PYTHON does not point to an existing file: $configuredPython"
  }
  $pyLauncher = $null
  $python = [pscustomobject]@{ Source = (Resolve-Path -LiteralPath $configuredPython).Path }
}
if (-not $pyLauncher -and -not $python) {
  throw 'Python was not found. The build machine needs Python 3.12+; end users do not need Python.'
}

$buildVenv = Join-Path $projectRoot '.venv-packaging'
$buildPython = Join-Path $buildVenv 'Scripts\python.exe'
$pythonDist = Join-Path $projectRoot 'build\python'
$pythonWork = Join-Path $projectRoot 'build\pyinstaller-work'
$harnessDist = Join-Path $projectRoot 'build\harness'
$electronBuilder = Join-Path $projectRoot 'node_modules\.bin\electron-builder.cmd'

if ($Clean) {
  foreach ($path in @(
    $buildVenv,
    $pythonDist,
    $pythonWork,
    $harnessDist,
    (Join-Path $projectRoot 'release')
  )) {
    if (Test-Path -LiteralPath $path) {
      Remove-Item -LiteralPath $path -Recurse -Force
    }
  }
}

if (-not (Test-Path -LiteralPath $buildPython)) {
  if ($pyLauncher) {
    Invoke-Checked $pyLauncher.Source @('-3', '-m', 'venv', $buildVenv)
  } else {
    Invoke-Checked $python.Source @('-m', 'venv', $buildVenv)
  }
}

if (-not (Test-Path -LiteralPath $buildPython)) {
  throw "Failed to create the Python packaging environment: $buildPython"
}

Write-Host '[1/6] Installing build dependencies...' -ForegroundColor Cyan
Invoke-Checked $buildPython @('-m', 'pip', 'install', '--upgrade', 'pip')
Invoke-Checked $buildPython @('-m', 'pip', 'install', '--requirement', (Join-Path $projectRoot 'requirements-packaging.txt'))

if (-not $SkipNpmCi) {
  Write-Host '[2/6] Installing Node dependencies...' -ForegroundColor Cyan
  Invoke-Checked $npm @('ci')
}

Write-Host '[3/7] Building the Go Harness...' -ForegroundColor Cyan
& (Join-Path $PSScriptRoot 'build-harness.ps1')
if ($LASTEXITCODE -ne 0) { throw "Harness build failed ($LASTEXITCODE)." }

Write-Host '[4/7] Building the renderer...' -ForegroundColor Cyan
Invoke-Checked $npm @('run', 'build')

Write-Host '[5/7] Bundling the Python realtime bridge...' -ForegroundColor Cyan
if (Test-Path -LiteralPath $pythonDist) {
  Remove-Item -LiteralPath $pythonDist -Recurse -Force
}
New-Item -ItemType Directory -Path $pythonDist -Force | Out-Null
New-Item -ItemType Directory -Path $pythonWork -Force | Out-Null

Invoke-Checked $buildPython @(
  '-m', 'PyInstaller',
  '--noconfirm',
  '--clean',
  '--distpath', $pythonDist,
  '--workpath', (Join-Path $pythonWork 'bridge'),
  (Join-Path $projectRoot 'packaging\bridge.spec')
)
Invoke-Checked $buildPython @(
  '-m', 'PyInstaller',
  '--noconfirm',
  '--clean',
  '--distpath', $pythonDist,
  '--workpath', (Join-Path $pythonWork 'prompt-preview'),
  (Join-Path $projectRoot 'packaging\prompt-preview.spec')
)

$bridgeExe = Join-Path $pythonDist 'cosight-bridge\cosight-bridge.exe'
$previewExe = Join-Path $pythonDist 'cosight-prompt-preview\cosight-prompt-preview.exe'
if (-not (Test-Path -LiteralPath $bridgeExe)) { throw "Python bridge was not generated: $bridgeExe" }
if (-not (Test-Path -LiteralPath $previewExe)) { throw "Prompt preview was not generated: $previewExe" }
if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'data\sample-roles.json'))) { throw 'Missing data/sample-roles.json.' }

if (-not (Test-Path -LiteralPath $electronBuilder)) {
  throw 'electron-builder was not found. Run npm ci first.'
}

Write-Host '[6/7] Building the Windows installer...' -ForegroundColor Cyan
Invoke-Checked $electronBuilder @('--win', 'nsis', '--x64', '--publish', 'never')

Write-Host '[7/7] Packaging complete.' -ForegroundColor Green
Get-ChildItem -LiteralPath (Join-Path $projectRoot 'release') -Filter '*.exe' | Select-Object FullName, Length
