# Build script for YT Bulk Playlist Manager (PowerShell)
# Concatenates all source modules into a single standalone .user.js file
# for direct installation in Tampermonkey / Violentmonkey.
#
# Usage:  .\build.ps1
# Output: dist\yt-bulk-playlist-manager.user.js

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$Src = Join-Path $ProjectRoot "src"
$Dist = Join-Path $ProjectRoot "dist"
$Out = Join-Path $Dist "yt-bulk-playlist-manager.user.js"

New-Item -ItemType Directory -Force -Path $Dist | Out-Null

# ─── Write standalone userscript header ───────────────────────────────────────
@"
// ==UserScript==
// @name         YT Bulk Playlist Manager
// @namespace    https://github.com/local/yt-bulk-manager
// @version      1.0.0
// @description  Adds multi-select checkboxes to YouTube playlist pages. Bulk-copy, move, or remove videos across playlists via YouTube's internal API.
// @author       local
// @match        https://www.youtube.com/playlist?list=*
// @match        https://www.youtube.com/feed/library
// @match        https://www.youtube.com/my_videos*
// @match        https://www.youtube.com/playlist*
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @noframes
// @run-at       document-idle
// ==/UserScript==
"@ | Set-Content $Out -Encoding ASCII

# ─── Source files in dependency order ─────────────────────────────────────────
$Files = @(
    "core\config.js"
    "core\logger.js"
    "core\errors.js"
    "core\session.js"
    "ui\state.js"
    "ui\checkbox.js"
    "ui\overlay.js"
    "api\playlists.js"
    "api\dispatcher.js"
    "observer.js"
    "..\main.js"
)

foreach ($relPath in $Files) {
    $fullPath = Join-Path $Src $relPath
    $normalized = $relPath -replace '\\', '/'
    Add-Content $Out "" -Encoding ASCII
    Add-Content $Out "// ─── src/$normalized ───────────────────────────────────────────────────────" -Encoding ASCII
    Get-Content $fullPath | Add-Content $Out -Encoding ASCII
}

$bytes = (Get-Item $Out).Length
$lines = (Get-Content $Out).Length
Write-Host ""
Write-Host "  ✓  $Out  ($bytes bytes, $lines lines)"
Write-Host ""
