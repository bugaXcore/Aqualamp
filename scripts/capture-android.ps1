#Requires -Version 5.1
<#
.SYNOPSIS
  Beginner-friendly Android Bluetooth capture for the Week Aqua S300 Pro.

.DESCRIPTION
  1) Checks the phone is connected with USB debugging (adb)
  2) Tries to turn on Bluetooth HCI logging
  3) Shows a simple numbered checklist of light moves
  4) Waits until you press Enter
  5) Pulls logs into files/captures/

  You do NOT need to understand BLE. Keep the Week Aqua app connected to the lamp.
#>

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$OutRoot = Join-Path $RepoRoot "files\captures"
$Stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$OutDir = Join-Path $OutRoot $Stamp

function Write-Step([string]$msg) {
  Write-Host ""
  Write-Host ("==> " + $msg) -ForegroundColor Cyan
}

function Write-Hint([string]$msg) {
  Write-Host ("    " + $msg) -ForegroundColor DarkGray
}

function Find-Adb {
  $cmd = Get-Command adb -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }

  $candidates = @(
    "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe",
    "$env:USERPROFILE\AppData\Local\Android\Sdk\platform-tools\adb.exe",
    "C:\Android\platform-tools\adb.exe",
    "C:\platform-tools\adb.exe"
  )
  foreach ($p in $candidates) {
    if (Test-Path $p) { return $p }
  }
  return $null
}

Write-Host ""
Write-Host "AquaLamp capture helper" -ForegroundColor Green
Write-Host "Phone should already be connected to the lamp in the Week Aqua app." -ForegroundColor Green
Write-Host ""

$adb = Find-Adb
if (-not $adb) {
  Write-Host "Could not find 'adb' (Android Debug Bridge)." -ForegroundColor Red
  Write-Host ""
  Write-Host "Install it once, then re-run this script:" -ForegroundColor Yellow
  Write-Host "  1. Install Google Platform Tools (search: 'SDK Platform Tools download')"
  Write-Host "  2. Unzip somewhere, e.g. C:\platform-tools"
  Write-Host "  3. Add that folder to your PATH, OR re-open this terminal after install"
  Write-Host "  4. On the phone: Settings -> Developer options -> USB debugging = ON"
  Write-Host "  5. Plug USB cable, tap 'Allow' on the phone if asked"
  exit 1
}

Write-Step ("Using adb: " + $adb)
& $adb version | Select-Object -First 2

Write-Step "Checking phone connection (adb devices)"
$devicesOut = & $adb devices
$devicesOut | ForEach-Object { Write-Host ("    " + $_) }
$ready = @($devicesOut | Select-Object -Skip 1 | Where-Object { $_ -match "\tdevice$" })
if ($ready.Count -lt 1) {
  Write-Host ""
  Write-Host "No phone ready." -ForegroundColor Red
  Write-Host "Fix checklist:" -ForegroundColor Yellow
  Write-Host "  - Unlock the phone"
  Write-Host "  - USB cable plugged into this PC"
  Write-Host "  - USB debugging ON (Developer options)"
  Write-Host "  - Tap Allow / Always allow this computer on the phone popup"
  Write-Host "  - If you see 'unauthorized', unplug/replug and Allow again"
  Write-Host "  - Run: adb devices   - you want one line ending with 'device'"
  exit 1
}

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
Write-Step ("Output folder: " + $OutDir)

# Best-effort enable HCI snoop
Write-Step "Trying to enable Bluetooth HCI logging on the phone"
$enableCmds = @(
  @("shell", "settings", "put", "secure", "bluetooth_hci_log", "1"),
  @("shell", "setprop", "persist.bluetooth.btsnooplogmode", "full"),
  @("shell", "setprop", "persist.bluetooth.btsnoopmode", "full")
)
foreach ($cmdArgs in $enableCmds) {
  try {
    & $adb @cmdArgs 2>$null | Out-Null
    Write-Hint ("ok: adb " + ($cmdArgs -join " "))
  } catch {
    Write-Hint ("skip: adb " + ($cmdArgs -join " "))
  }
}
Write-Hint "If logging was off before, toggle Bluetooth OFF then ON once on the phone."
Write-Hint "(Some phones also need: Developer options -> 'Enable Bluetooth HCI snoop log')"

# Known log locations to try later
$HciCandidates = @(
  "/data/misc/bluetooth/logs/btsnoop_hci.log",
  "/data/misc/bluetooth/logs/btsnooz_hci.log",
  "/sdcard/Android/data/btsnoop_hci.log",
  "/sdcard/btsnoop_hci.log",
  "/storage/emulated/0/Android/data/btsnoop_hci.log"
)

Write-Host ""
Write-Host "============================================================" -ForegroundColor Yellow
Write-Host "  DO THESE MOVES IN THE WEEK AQUA APP (on your phone)" -ForegroundColor Yellow
Write-Host "============================================================" -ForegroundColor Yellow
Write-Host ""
Write-Host "Keep the lamp CONNECTED in the app the whole time." -ForegroundColor White
Write-Host "Between each step, wait about 3 seconds (count slowly: 1...2...3)." -ForegroundColor White
Write-Host ""
Write-Host "  1. Red slider -> 0, wait, then Red -> 100, wait"
Write-Host "  2. Blue slider -> 0, wait, then Blue -> 100, wait"
Write-Host "  3. Green slider -> 0, wait, then Green -> 100, wait"
Write-Host "  4. White slider -> 0, wait, then White -> 100, wait"
Write-Host "  5. Turn the light OFF (power / all channels 0), wait"
Write-Host ""
Write-Host "Optional (helps find UUIDs later): install 'nRF Connect' from the" -ForegroundColor DarkGray
Write-Host "Play Store (Nordic Semiconductor), connect to B3.0-S300pro-03," -ForegroundColor DarkGray
Write-Host "and screenshot the service/characteristic list. Not required now." -ForegroundColor DarkGray
Write-Host ""
Write-Host "When you have finished ALL steps above, come back here and press Enter." -ForegroundColor Green
Write-Host ""
Read-Host "Press Enter to pull logs from the phone"

Write-Step "Pulling Bluetooth / bugreport files (this can take a minute)"

$pulled = @()
foreach ($remote in $HciCandidates) {
  $leaf = Split-Path $remote -Leaf
  $local = Join-Path $OutDir $leaf
  # try plain pull (may fail without root on /data)
  & $adb pull $remote $local 2>$null | Out-Null
  if (Test-Path $local) {
    $len = (Get-Item $local).Length
    if ($len -gt 64) {
      Write-Hint ("pulled " + $remote + " (" + $len + " bytes)")
      $pulled += $local
    } else {
      Remove-Item $local -Force -ErrorAction SilentlyContinue
    }
  }
}

Write-Hint "Generating bugreport (most reliable on modern phones)..."
$bugZip = Join-Path $OutDir "bugreport.zip"
try {
  & $adb bugreport $bugZip
  if (Test-Path $bugZip) {
    Write-Hint ("bugreport saved: " + $bugZip)
    $pulled += $bugZip

    # Expand and search for btsnoop inside
    $expandDir = Join-Path $OutDir "bugreport-expanded"
    New-Item -ItemType Directory -Force -Path $expandDir | Out-Null
    try {
      Expand-Archive -Path $bugZip -DestinationPath $expandDir -Force
    } catch {
      # some bugreports are already .txt; ignore
    }
    $found = Get-ChildItem -Path $expandDir -Recurse -File -ErrorAction SilentlyContinue |
      Where-Object { $_.Name -match "btsnoop|btsnooz" }
    foreach ($f in $found) {
      $dest = Join-Path $OutDir $f.Name
      Copy-Item $f.FullName $dest -Force
      Write-Hint ("found inside bugreport: " + $f.Name)
      $pulled += $dest
    }
  }
} catch {
  Write-Hint ("bugreport failed: " + $_.Exception.Message)
  Write-Hint "You can still manually share a bugreport ZIP into files\captures\"
}

# Manifest
$manifest = [ordered]@{
  createdAt = (Get-Date).ToString("o")
  outDir = $OutDir
  lightMac = "C8:47:80:70:BB:07"
  lightName = "B3.0-S300pro-03"
  checklist = @(
    "Red 0 then 100",
    "Blue 0 then 100",
    "Green 0 then 100",
    "White 0 then 100",
    "Off"
  )
  pulled = @($pulled | Select-Object -Unique)
  hciCandidatesTried = $HciCandidates
}
$manifestPath = Join-Path $OutDir "capture-manifest.json"
$manifest | ConvertTo-Json -Depth 5 | Set-Content -Path $manifestPath -Encoding UTF8

Write-Host ""
Write-Host "Capture folder ready:" -ForegroundColor Green
Write-Host ("  " + $OutDir)
Write-Host ""
Write-Host "Next: parse it with:" -ForegroundColor Cyan
Write-Host "  npm run capture:parse"
Write-Host "  (or)  powershell -File scripts\parse-capture.ps1"
Write-Host ""

# Write a pointer file for the parser (latest)
$latestPtr = Join-Path $OutRoot "LATEST.txt"
Set-Content -Path $latestPtr -Value $OutDir -Encoding UTF8
exit 0
