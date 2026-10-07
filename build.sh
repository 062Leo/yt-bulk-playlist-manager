#!/bin/bash
# Build script for YT Bulk Playlist Manager.
# Thin wrapper around scripts/build.mjs (Node >= 20), which concatenates all
# @require'd sources (order from loader.user.js) into one standalone file.
#
# Usage:  ./build.sh        (same as: npm run build)
# Output: dist/yt-bulk-playlist-manager.user.js
set -euo pipefail
cd "$(dirname "$0")"
node scripts/build.mjs
