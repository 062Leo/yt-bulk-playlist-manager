# Build script for YT Bulk Playlist Manager (PowerShell).
# Thin wrapper around scripts/build.mjs (Node >= 20), which concatenates all
# @require'd sources (order from loader.user.js) into one standalone UTF-8 file.
#
# Usage:  .\build.ps1       (same as: npm run build)
# Output: dist\yt-bulk-playlist-manager.user.js
$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $MyInvocation.MyCommand.Path)
node scripts/build.mjs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
