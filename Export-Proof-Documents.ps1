$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$nodeRoot = Join-Path $env:USERPROFILE 'Downloads\My_Apps\node-v24.14.1-win-x64'
$nodeExe = Join-Path $nodeRoot 'node.exe'
$tsxCli = Join-Path $projectRoot 'node_modules\tsx\dist\cli.mjs'
$dataRoot = Join-Path $env:LOCALAPPDATA 'Proof'
$targetDir = Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'Proof Exports'

if (-not (Test-Path $nodeExe)) { throw "Portable Node not found at $nodeRoot." }
if (-not (Test-Path $tsxCli)) { throw "tsx not found. Run npm install in $projectRoot." }
if (-not (Test-Path (Join-Path $dataRoot 'proof-share.db'))) {
  Write-Host 'No local Proof database yet — start Proof and save a document first.'
  exit 0
}

$env:DATABASE_PATH = Join-Path $dataRoot 'proof-share.db'
& $nodeExe $tsxCli (Join-Path $projectRoot 'scripts\export-documents.mjs') $targetDir
if ($LASTEXITCODE -ne 0) { throw "Export failed with exit code $LASTEXITCODE." }
Write-Host "`nMarkdown files are in $targetDir"
Start-Process $targetDir
