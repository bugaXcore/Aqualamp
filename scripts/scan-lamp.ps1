#Requires -Version 5.1
<#
.SYNOPSIS
  Scan ~40s for the Week Aqua lamp (MAC / FFF0). Does not connect.
#>
$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)

Write-Host "Scanning ~40s for C8:47:80:70:BB:07 / service FFF0 ..." -ForegroundColor Cyan
Write-Host "Force-close Week Aqua on the phone first." -ForegroundColor Yellow
Write-Host ""

node --input-type=module -e @"
import noble from '@abandonware/noble';
const TARGET = 'c8478070bb07';
const norm = (s) => String(s||'').replace(/[^0-9a-f]/gi,'').toLowerCase();
const hits = [];
noble.on('stateChange', async (s) => {
  console.log('adapter:', s);
  if (s !== 'poweredOn') return;
  await noble.startScanningAsync([], true);
  setTimeout(async () => {
    try { await noble.stopScanningAsync(); } catch {}
    if (!hits.length) {
      console.log('RESULT: lamp NOT seen. Close Week Aqua, move lamp closer, retry.');
      process.exit(2);
    }
    console.log('RESULT: lamp seen', hits.length, 'time(s)');
    hits.forEach(h => console.log(JSON.stringify(h)));
    process.exit(0);
  }, 40000);
});
noble.on('discover', (p) => {
  if (norm(p.address) !== TARGET && norm(p.id) !== TARGET) return;
  const e = {
    address: p.address,
    addressType: p.addressType,
    connectable: p.connectable,
    rssi: p.rssi,
    localName: p.advertisement?.localName || '',
    serviceUuids: p.advertisement?.serviceUuids || [],
  };
  hits.push(e);
  console.log('HIT', JSON.stringify(e));
});
"@
