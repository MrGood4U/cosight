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
    throw "命令失败（$LASTEXITCODE）：$FilePath $($Arguments -join ' ')"
  }
}

function Find-CommandPath {
  param([Parameter(Mandatory = $true)][string]$Name)
  $command = Get-Command $Name -ErrorAction SilentlyContinue
  if (-not $command) {
    throw "找不到 $Name。请先安装 Node.js 和 Python 3.12+，再运行打包脚本。"
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
    throw "COSIGHT_BUILD_PYTHON 指向的文件不存在：$configuredPython"
  }
  $pyLauncher = $null
  $python = [pscustomobject]@{ Source = (Resolve-Path -LiteralPath $configuredPython).Path }
}
if (-not $pyLauncher -and -not $python) {
  throw '找不到 Python。打包机需要 Python 3.12+，最终用户不需要安装 Python。'
}

$buildVenv = Join-Path $projectRoot '.venv-packaging'
$buildPython = Join-Path $buildVenv 'Scripts\python.exe'
$pythonDist = Join-Path $projectRoot 'build\python'
$pythonWork = Join-Path $projectRoot 'build\pyinstaller-work'
$electronBuilder = Join-Path $projectRoot 'node_modules\.bin\electron-builder.cmd'

if ($Clean) {
  foreach ($path in @(
    $buildVenv,
    $pythonDist,
    $pythonWork,
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
  throw "Python 虚拟环境创建失败：$buildPython"
}

Write-Host '[1/6] Installing build dependencies...' -ForegroundColor Cyan
Invoke-Checked $buildPython @('-m', 'pip', 'install', '--upgrade', 'pip')
Invoke-Checked $buildPython @('-m', 'pip', 'install', '--requirement', (Join-Path $projectRoot 'requirements-packaging.txt'))

if (-not $SkipNpmCi) {
  Write-Host '[2/6] Installing Node dependencies...' -ForegroundColor Cyan
  Invoke-Checked $npm @('ci')
}

Write-Host '[3/6] Building the renderer...' -ForegroundColor Cyan
Invoke-Checked $npm @('run', 'build')

Write-Host '[4/6] Bundling the Python realtime bridge...' -ForegroundColor Cyan
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
if (-not (Test-Path -LiteralPath $bridgeExe)) { throw "Python bridge 未生成：$bridgeExe" }
if (-not (Test-Path -LiteralPath $previewExe)) { throw "Prompt preview 未生成：$previewExe" }
if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'data\sample-roles.json'))) { throw '缺少 data/sample-roles.json。' }

if (-not (Test-Path -LiteralPath $electronBuilder)) {
  throw '找不到 electron-builder。请先运行 npm ci。'
}

Write-Host '[5/6] Building the Windows installer...' -ForegroundColor Cyan
Invoke-Checked $electronBuilder @('--win', 'nsis', '--x64', '--publish', 'never')

Write-Host '[6/6] Packaging complete.' -ForegroundColor Green
Get-ChildItem -LiteralPath (Join-Path $projectRoot 'release') -Filter '*.exe' | Select-Object FullName, Length
