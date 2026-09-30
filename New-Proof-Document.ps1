$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$startScript = Join-Path $projectRoot 'Start-Proof.ps1'

& $startScript -SkipBrowser

$title = (Read-Host 'Title for the new shared document').Trim()
if ([string]::IsNullOrWhiteSpace($title)) {
  Write-Host 'No title entered; no document was created.'
  exit 0
}

$bundlePath = Join-Path $projectRoot 'dist\assets\editor.js'
if (-not (Test-Path $bundlePath)) {
  throw "The shared-document editor bundle is missing. Run 'npm run build' in $projectRoot, then try again."
}

$body = @{
  title = $title
  markdown = "# $title`n`n"
} | ConvertTo-Json

$created = Invoke-RestMethod -Uri 'http://127.0.0.1:4000/documents' `
  -Method Post -ContentType 'application/json' -Body $body -TimeoutSec 15
$tokenUri = [Uri]$created.tokenUrl
$editorUrl = 'http://127.0.0.1:3000' + $tokenUri.PathAndQuery

Write-Host "Created '$title'. It auto-saves locally at $editorUrl"
Start-Process $editorUrl
