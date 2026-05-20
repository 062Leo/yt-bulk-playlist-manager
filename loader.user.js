// ==UserScript==
// @name         YT Bulk Playlist Manager – Loader
// @namespace    https://github.com/local/yt-bulk-manager
// @version      1.0.0
// @description  Loader for local dev – hot reload via file:// require
// @author       local
// @match        https://www.youtube.com/playlist?list=*
// @match        https://www.youtube.com/feed/library
// @match        https://www.youtube.com/my_videos*
// @match        https://www.youtube.com/playlist*
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @noframes
// @run-at       document-idle
// @require      file:///C:/LEO/Projekte/GitHub/yt-bulk-playlist-manager/src/core/config.js
// @require      file:///C:/LEO/Projekte/GitHub/yt-bulk-playlist-manager/src/core/logger.js
// @require      file:///C:/LEO/Projekte/GitHub/yt-bulk-playlist-manager/src/core/errors.js
// @require      file:///C:/LEO/Projekte/GitHub/yt-bulk-playlist-manager/src/core/session.js
// @require      file:///C:/LEO/Projekte/GitHub/yt-bulk-playlist-manager/src/ui/state.js
// @require      file:///C:/LEO/Projekte/GitHub/yt-bulk-playlist-manager/src/ui/checkbox.js
// @require      file:///C:/LEO/Projekte/GitHub/yt-bulk-playlist-manager/src/ui/overlay.js
// @require      file:///C:/LEO/Projekte/GitHub/yt-bulk-playlist-manager/src/api/playlists.js
// @require      file:///C:/LEO/Projekte/GitHub/yt-bulk-playlist-manager/src/api/dispatcher.js
// @require      file:///C:/LEO/Projekte/GitHub/yt-bulk-playlist-manager/src/observer.js
// @require      file:///C:/LEO/Projekte/GitHub/yt-bulk-playlist-manager/main.js
// ==/UserScript==

// All code is loaded via @require above

/*
 * ─── README ─────────────────────────────────────────────────────────────────
 *
 * 1. Enable file:// access in Tampermonkey:
 *    Tampermonkey Dashboard → Settings → Security →
 *    [✓] Allow access to file URLs (Allow file:// access)
 *
 * 2. Enable file:// access in Chrome extension settings:
 *    Navigate to: chrome://extensions
 *    Find Tampermonkey → Details →
 *    [✓] Allow access to file URLs
 *
 * 3. Paths must match your actual folder on disk:
 *    All @require directives point to: C:/LEO/Projekte/GitHub/yt-bulk-playlist-manager/
 *    Make sure your local checkout lives at that exact path,
 *    or update every file:///C:/LEO/... path in this file accordingly.
 *
 * 4. Hot-reload workflow:
 *    - Edit any .js file in the project and save it
 *    - Switch to the YouTube tab and press F5
 *    - Tampermonkey re-reads every @require file from disk on reload
 *    - Changes are live — no rebuild, no repaste, no restart
 * ────────────────────────────────────────────────────────────────────────────
 */
