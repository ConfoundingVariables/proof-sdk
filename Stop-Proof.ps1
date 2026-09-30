$ErrorActionPreference = 'Stop'
$apiUrl = 'http://127.0.0.1:4000/health'
$editorUrl = 'http://127.0.0.1:3000/'

function Get-ListenerPids([int]$Port) {
  @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique)
}

function Test-ProofApi {
  try { return (Invoke-RestMethod -Uri $apiUrl -TimeoutSec 2).ok -eq $true }
  catch { return $false }
}

function Test-ProofEditor {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $editorUrl -TimeoutSec 2
    return $response.StatusCode -eq 200 -and $response.Content -match '<title>Proof Editor</title>'
  } catch { return $false }
}

$targets = @()
if (Test-ProofApi) { $targets += Get-ListenerPids 4000 }
if (Test-ProofEditor) { $targets += Get-ListenerPids 3000 }
$targets = @($targets | Sort-Object -Unique)

if ($targets.Count -eq 0) {
  Write-Host 'Proof is not running (or its ports are owned by another service).'
  exit 0
}

foreach ($processId in $targets) {
  & "$env:WINDIR\System32\taskkill.exe" /PID $processId /T /F | Out-Null
}
Write-Host 'Stopped the Proof processes. Your saved documents remain in %LOCALAPPDATA%\Proof.'
