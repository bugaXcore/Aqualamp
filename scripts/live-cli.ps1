#Requires -Version 5.1
<#
.SYNOPSIS
  One-shot live (or dry) CLI write to the Week Aqua lamp.

.EXAMPLE
  # Safest dry-run (mock — does not touch BLE)
  powershell -File scripts\live-cli.ps1 -Red 25 -Mock

.EXAMPLE
  # Supervised live attempt (Windows often blocked — see docs)
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

# Show expected frame without needing BLE
$wire = [int][Math]::Round($Red * 235 / 100.0)
$hex = ("fb f9 {0:x2} 00 00 00 55 55" -f $wire)
Write-Host ("Expected ATT payload: " + $hex) -ForegroundColor Green

if ($WhatIfEncodeOnly) { exit 0 }

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
  Write-Host "Mode: LIVE (requires working @abandonware/noble)" -ForegroundColor Yellow
  Write-Host "Close Week Aqua on the phone first." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Running: npm run cli -- --red $Red --green 0 --blue 0 --white 0"
& npm run cli -- --red $Red --green 0 --blue 0 --white 0
exit $LASTEXITCODE
