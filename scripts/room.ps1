# Room helper: append a message / tail transcript (ASCII-safe, path from script root)
# Usage:
#   Append : powershell -NoProfile -ExecutionPolicy Bypass -File room.ps1 -Role wby -Text "hello"
#   Tail   : powershell -NoProfile -ExecutionPolicy Bypass -File room.ps1 -Tail 30
param(
  [string]$Role,
  [string]$Text,
  [int]$Tail = 0
)
$ProjectRoot = Split-Path $PSScriptRoot -Parent
$Transcript   = Join-Path $ProjectRoot "room\transcript.md"

if ($Tail -gt 0) {
  if (-not (Test-Path $Transcript)) { Write-Host "[room] transcript not found: $Transcript"; exit 1 }
  Get-Content $Transcript -Encoding UTF8 | Select-Object -Last $Tail
  exit 0
}
if (-not $Role -or -not $Text) {
  Write-Host "Usage: -Role <dsh|wby|human> -Text <body>   or   -Tail <count>"
  exit 1
}
if (-not (Test-Path (Split-Path $Transcript))) { New-Item -ItemType Directory -Force -Path (Split-Path $Transcript) | Out-Null }
$ts = Get-Date -Format "yyyy-MM-dd HH:mm"
$block = "## [$ts] @$Role`r`n$Text`r`n"
Add-Content -Path $Transcript -Value $block -Encoding UTF8
Write-Host "appended @$Role at $ts"