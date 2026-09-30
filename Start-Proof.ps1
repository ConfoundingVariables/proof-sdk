param([switch]$SkipBrowser)

$ErrorActionPreference = 'Stop'

$projectRoot = $PSScriptRoot
$nodeRoot = Join-Path $env:USERPROFILE 'Downloads\My_Apps\node-v24.14.1-win-x64'
$nodeExe = Join-Path $nodeRoot 'node.exe'
$npmCli = Join-Path $nodeRoot 'node_modules\npm\bin\npm-cli.js'
$dataRoot = Join-Path $env:LOCALAPPDATA 'Proof'
$logsRoot = Join-Path $dataRoot 'logs'
$apiUrl = 'http://127.0.0.1:4000/health'
$editorUrl = 'http://127.0.0.1:3000/'

if (-not (Test-Path $nodeExe) -or -not (Test-Path $npmCli)) {
  throw "The pinned portable Node runtime was not found at $nodeRoot. No Node installation was changed."
}
New-Item -ItemType Directory -Force -Path $logsRoot | Out-Null

# Keep the runtime override local to this launcher and its child processes.
$env:Path = "$nodeRoot;$env:Path"
$env:DATABASE_PATH = Join-Path $dataRoot 'proof-share.db'
$secretFile = Join-Path $dataRoot 'collab-signing.key'
$collabSecret = if (Test-Path $secretFile) { (Get-Content $secretFile -Raw).Trim() } else { '' }
if ($collabSecret.Length -lt 64) {
  $secretBytes = New-Object byte[] 32
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($secretBytes) } finally { $rng.Dispose() }
  $collabSecret = [BitConverter]::ToString($secretBytes).Replace('-', '').ToLowerInvariant()
  [System.IO.File]::WriteAllText($secretFile, $collabSecret)
}
$env:PROOF_COLLAB_SIGNING_SECRET = $collabSecret
$env:PROOF_ENV = 'development'
$env:COLLAB_EMBEDDED_WS = '1'
$env:PORT = '4000'

function Test-ProofApi {
  try {
    $result = Invoke-RestMethod -Uri $apiUrl -TimeoutSec 3
    return $result.ok -eq $true
  } catch {
    return $false
  }
}

function Test-ProofEditor {
  try {
    $result = Invoke-WebRequest -UseBasicParsing -Uri $editorUrl -TimeoutSec 3
    return $result.StatusCode -eq 200 -and $result.Content -match '<title>Proof Editor</title>'
  } catch {
    return $false
  }
}

function Assert-PortFree([int]$Port, [string]$ServiceName) {
  $listeners = @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)
  if ($listeners.Count -gt 0) {
    throw "Port $Port is already in use by another service; Proof did not stop or replace it."
  }
}

function Wait-ForService([string]$Kind, $Process, [int]$TimeoutSeconds) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    if ($Kind -eq 'api' -and (Test-ProofApi)) { return $true }
    if ($Kind -eq 'editor' -and (Test-ProofEditor)) { return $true }
    if ($Process.HasExited) { return $false }
    Start-Sleep -Seconds 1
  }
  return $false
}

function Show-StartupLogs {
  foreach ($name in @('server.stdout.log', 'server.stderr.log', 'editor.stdout.log', 'editor.stderr.log')) {
    $file = Join-Path $logsRoot $name
    if (Test-Path $file) {
      Write-Host "`n--- $file (last 35 lines) ---"
      Get-Content $file -Tail 35
    }
  }
}

$apiProcess = $null
if (-not (Test-ProofApi)) {
  Assert-PortFree 4000 'Proof API'
  $apiProcess = Start-Process -FilePath $nodeExe `
    -ArgumentList @($npmCli, 'run', 'serve') `
    -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput (Join-Path $logsRoot 'server.stdout.log') `
    -RedirectStandardError (Join-Path $logsRoot 'server.stderr.log')
  if (-not (Wait-ForService 'api' $apiProcess 90)) {
    Show-StartupLogs
    throw 'Proof API failed to start. See the logs above.'
  }
}

$editorProcess = $null
if (-not (Test-ProofEditor)) {
  Assert-PortFree 3000 'Proof editor'
  $editorProcess = Start-Process -FilePath $nodeExe `
    -ArgumentList @($npmCli, 'run', 'dev', '--', '--host', '127.0.0.1') `
    -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput (Join-Path $logsRoot 'editor.stdout.log') `
    -RedirectStandardError (Join-Path $logsRoot 'editor.stderr.log')
  if (-not (Wait-ForService 'editor' $editorProcess 90)) {
    Show-StartupLogs
    throw 'Proof editor failed to start. See the logs above.'
  }
}

Write-Host "Proof is ready at $editorUrl"
Write-Host "Documents are stored in $env:DATABASE_PATH"
if (-not $SkipBrowser) {
  Start-Process $editorUrl
}
