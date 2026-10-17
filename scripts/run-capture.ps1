#Requires -Version 5.1
<#
.SYNOPSIS
  One-shot: capture from phone, then parse into a readable report.

.DESCRIPTION
  For Stav: plug in phone (USB debugging on), keep Week Aqua connected to the lamp,
  run this script, follow the on-screen checklist, press Enter when done.
#>
$ErrorActionPreference = "Stop"
$here = $PSScriptRoot

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  AquaLamp - capture light commands" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Before you start:" -ForegroundColor Yellow
Write-Host "  1. Phone unlocked, USB cable to this PC"
Write-Host "  2. USB debugging ON (Developer options)"
Write-Host "  3. Week Aqua app open and lamp CONNECTED"
Write-Host ""

& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $here "capture-android.ps1")
if ($LASTEXITCODE -ne 0) {
  Write-Host "Capture stopped early (fix above). Fix the issue and run again:" -ForegroundColor Red
  Write-Host "  npm run capture"
  exit $LASTEXITCODE
}

Write-Host ""
Write-Host "Parsing what we pulled..." -ForegroundColor Cyan
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $here "parse-capture.ps1")
$code = $LASTEXITCODE

$latest = Join-Path (Split-Path -Parent $here) "files\captures\LATEST.txt"
if (Test-Path $latest) {
  $dir = Get-Content $latest -Raw
  $dir = $dir.Trim()
  $report = Join-Path $dir "capture-report.md"
  Write-Host ""
  Write-Host "Done." -ForegroundColor Green
  if (Test-Path $report) {
    Write-Host "Open this report:" -ForegroundColor Green
    Write-Host ("  " + $report)
  } else {
    Write-Host "Capture folder:" -ForegroundColor Yellow
    Write-Host ("  " + $dir)
  }
}

exit $code
