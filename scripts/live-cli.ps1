#Requires -Version 5.1
<#
.SYNOPSIS
  One-shot live (or dry) CLI write to the Week Aqua lamp.

.EXAMPLE
  powershell -File scripts\live-cli.ps1 -Red 25 -Mock

.EXAMPLE
  powershell -File scripts\live-cli.ps1 -Red 25
#>
param(
  [ValidateSet(0, 25, 50, 75, 100)]
  [int]$Red = 25,
  [switch]$Off,
  [switch]$Mock,
  [switch]$WhatIfEncodeOnly
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

if ($Off) { $Red = 0 }

Write-Host "AquaLamp live CLI helper" -ForegroundColor Cyan
Write-Host "  Target MAC : C8:47:80:70:BB:07"
Write-Host "  Service    : FFF0"
Write-Host "  Char       : FFF2 (write without response)"
Write-Host "  Red        : $Red  (wire = round(red*235/100))"
Write-Host ""

$wire = [int][Math]::Round($Red * 235 / 100.0)
$hex = ("fb f9 {0:x2} 00 00 00 55 55" -f $wire)
Write-Host ("Expected ATT payload: " + $hex) -ForegroundColor Green

if ($WhatIfEncodeOnly) { exit 0 }

# Force process env so .env placeholders (XX:XX / MOCK=1) cannot win.
# loadEnvFile does not override existing keys; npm children inherit these.
$env:LIGHT_ADDRESS = "C8:47:80:70:BB:07"
$env:SERVICE_UUID = "0000fff0-0000-1000-8000-00805f9b34fb"
$env:CHARACTERISTIC_UUID = "0000fff2-0000-1000-8000-00805f9b34fb"
$env:AQUALAMP_AUTO_RECONNECT = "0"

if ($Mock) {
  $env:AQUALAMP_MOCK = "1"
  Remove-Item Env:AQUALAMP_ALLOW_HARDWARE -ErrorAction SilentlyContinue
  Write-Host "Mode: MOCK (no radio)" -ForegroundColor Yellow
} else {
  $env:AQUALAMP_MOCK = "0"
  $env:AQUALAMP_ALLOW_HARDWARE = "1"
  Write-Host "Mode: LIVE" -ForegroundColor Yellow
  Write-Host "Close Week Aqua on the phone first." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Env check:" -ForegroundColor DarkGray
Write-Host ("  AQUALAMP_MOCK=" + $env:AQUALAMP_MOCK)
Write-Host ("  AQUALAMP_ALLOW_HARDWARE=" + $env:AQUALAMP_ALLOW_HARDWARE)
Write-Host ("  LIGHT_ADDRESS=" + $env:LIGHT_ADDRESS)
Write-Host ("  SERVICE_UUID=" + $env:SERVICE_UUID)
Write-Host ("  CHARACTERISTIC_UUID=" + $env:CHARACTERISTIC_UUID)
Write-Host ""
Write-Host "Rebuilding controller (avoids stale dist/ gate)..." -ForegroundColor DarkGray
& npm run build -w @aqualamp/controller
if ($LASTEXITCODE -ne 0) {
  Write-Host "Controller build failed." -ForegroundColor Red
  exit $LASTEXITCODE
}

Write-Host ""
Write-Host "Running: npm run cli -- --red $Red --green 0 --blue 0 --white 0"

# Use cmd so npm.cmd reliably sees the same environment block.
$argLine = "--red $Red --green 0 --blue 0 --white 0"
cmd /c "npm run cli -- $argLine"
exit $LASTEXITCODE
