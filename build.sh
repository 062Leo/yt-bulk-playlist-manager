#!/bin/bash
# Build script for YT Bulk Playlist Manager
# Concatenates all source modules into a single standalone .user.js file
# for direct installation in Tampermonkey / Violentmonkey.
#
# Usage:  ./build.sh
# Output: dist/yt-bulk-playlist-manager.user.js

set -euo pipefail

SRC="src"
DIST="dist"
OUT="$DIST/yt-bulk-playlist-manager.user.js"
HEADER="loader.user.js"

mkdir -p "$DIST"

# ─── Write standalone userscript header ───────────────────────────────────────
cat > "$OUT" << 'HEADER'
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
HEADER

# ─── Concatenate source files in dependency order ────────────────────────────
# Order matters: each module may reference globals from the previous one.
FILES=(
  "$SRC/core/config.js"
  "$SRC/core/logger.js"
  "$SRC/core/errors.js"
  "$SRC/core/session.js"
  "$SRC/ui/state.js"
  "$SRC/ui/checkbox.js"
  "$SRC/ui/overlay.js"
  "$SRC/api/playlists.js"
  "$SRC/api/dispatcher.js"
  "$SRC/observer.js"
  "main.js"
)

for f in "${FILES[@]}"; do
  echo "" >> "$OUT"
  echo "// ─── $f ───────────────────────────────────────────────────────" >> "$OUT"
  cat "$f" >> "$OUT"
done

echo ""
echo "  ✓  $OUT  ($(wc -c < "$OUT") bytes, $(wc -l < "$OUT") lines)"
echo ""
