Param(
    [string]$PythonExe = "python"
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = Split-Path -Parent $ScriptDir
$AgentDir = Join-Path $RootDir "desktop_agent"
$OutDir = Join-Path $AgentDir "dist-artifacts"

Set-Location $RootDir

& $PythonExe -m venv .venv-agent-build
& .\.venv-agent-build\Scripts\python.exe -m pip install --upgrade pip
& .\.venv-agent-build\Scripts\python.exe -m pip install -r "$AgentDir\requirements-build.txt"

& .\.venv-agent-build\Scripts\pyinstaller.exe `
  --clean `
  --noconfirm `
  --onefile `
  --name npamx-agent `
  "$AgentDir\npamx_agent.py"

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$artifactName = "npamx-agent-windows-amd64.exe"
Copy-Item -Force ".\dist\npamx-agent.exe" (Join-Path $OutDir $artifactName)

Write-Host "Build complete. Artifact: $(Join-Path $OutDir $artifactName)"
