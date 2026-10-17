#Requires -Version 5.1
<#
.SYNOPSIS
  Parse the latest (or given) capture folder into a human-readable report.
#>
$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$Target = if ($args.Count -ge 1) { $args[0] } else { $null }

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  # Prefer system Node over Cursor's bundled node if PATH is odd
  $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
    [System.Environment]::GetEnvironmentVariable("Path", "User")
  $node = Get-Command node -ErrorAction SilentlyContinue
}
if (-not $node) {
  Write-Host "Node.js not found. Install Node LTS, then retry." -ForegroundColor Red
  exit 1
}

$parser = Join-Path $PSScriptRoot "parse-capture.mjs"
Write-Host "Running parser..." -ForegroundColor Cyan
if ($Target) {
  & node $parser $Target
} else {
  & node $parser
}
exit $LASTEXITCODE
