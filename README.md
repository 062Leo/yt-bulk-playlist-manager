# YT Bulk Playlist Manager

A Tampermonkey/Violentmonkey userscript that adds multi-select checkboxes to YouTube playlist pages. Select multiple videos at once and **copy**, **move**, or **remove** them across playlists in bulk — using YouTube's internal API. No Google API key, no OAuth, no quota limits.

## Features

- **Checkboxes** on every video row in a playlist — click to select, **Shift+Click** to range-select
- **Copy** — add selected videos to another playlist (originals stay)
- **Move** — copy selected videos to another playlist **and** remove them from the current one
- **Remove** — delete selected videos from the current playlist
- **Duplicate detection** — warns you before copying/moving videos that already exist in the target playlist, and lets you skip them
- **Confirmation dialogs** — every action prompts you before executing, with clear descriptions of what will happen
- **Progress dialog** — shows a progress bar and status message during long operations (e.g. moving 40 videos)
- **Safe batching** — dispatches requests in chunks of 50 with 500 ms delays to avoid rate-limiting
- **SPA-aware** — automatically re-initialises on YouTube's virtual navigation (`yt-navigate-finish`)

## Installation

### Option 1: Quick install (end users)

1. Install [Tampermonkey](https://www.tampermonkey.net/) (or Violentmonkey) for your browser.
2. Open the raw `dist/yt-bulk-playlist-manager.user.js` file from this repository in your browser — Tampermonkey will offer to install it.
3. Navigate to any YouTube playlist page — the checkboxes and toolbar appear automatically.

### Option 2: Development setup (hot-reload)

For developers who want to edit the source and see changes immediately without re-installing:

1. Clone the repository to your local machine.
2. Enable `file://` access in Tampermonkey:
   - Dashboard → Settings → Security → **Allow access to file URLs**
   - Also enable in your browser's extension settings for Tampermonkey
3. Create a new userscript in Tampermonkey and paste the contents of `loader.user.js`.
4. Adjust the `@require` file paths in the script to match your local checkout path.
5. Save — now Tampermonkey loads each module from disk on every page refresh.
6. Edit any `.js` file → save → **F5** on the YouTube tab.

> **WSL note:** If you develop from WSL but the project lives on Windows (`C:\...`), the `@require` paths must use Windows-style paths (`file:///C:/...`), not `/mnt/c/...`).

## Build

To produce the standalone userscript from source, run one of the following in the project root:

| Platform | Command |
|----------|---------|
| Linux / macOS / WSL | `./build.sh` |
| Windows (PowerShell) | `.\build.ps1` |

Output: `dist/yt-bulk-playlist-manager.user.js`

Both build scripts concatenate all source modules in dependency order into a single `.user.js` file. No bundler, no npm, no dependencies required.

## Project Structure

```
yt-bulk-playlist-manager/
├── loader.user.js              ← Dev loader (requires source files from disk)
├── main.js                     ← Application entry point, wires all modules
├── build.sh                    ← Build script for Linux/macOS/WSL → dist/*.user.js
├── build.ps1                   ← Build script for Windows (PowerShell) → dist/*.user.js
├── dist/
│   └── yt-bulk-playlist-manager.user.js  ← Standalone userscript (ready to install)
├── src/
│   ├── core/
│   │   ├── config.js           ← Constants, batch limits, selectors
│   │   ├── logger.js           ← Console logger with [YT-BULK] prefix
│   │   ├── errors.js           ← Custom error types (SessionError, ApiError, …)
│   │   └── session.js          ← YouTube session extraction (ytcfg polling + SAPISID auth)
│   ├── ui/
│   │   ├── checkbox.js         ← Injects checkboxes into playlist video rows
│   │   ├── overlay.js          ← Floating toolbar + confirmation/progress dialogs
│   │   └── state.js            ← Selection state manager (selectedIds, shift-click index)
│   ├── api/
│   │   ├── playlists.js        ← Fetch user playlists, check existing videos, resolve setVideoIds
│   │   └── dispatcher.js       ← Batch add/remove via YouTube's edit_playlist endpoint
│   └── observer.js             ← MutationObserver for lazy-loaded video rows
```

## How It Works

1. **Session acquisition** — on page load, the script polls for `window.ytcfg` (YouTube's internal config) to extract the API key and request context. It also computes a SAPISID-based auth header for write operations.
2. **Checkbox injection** — a MutationObserver watches for new `ytd-playlist-video-renderer` elements and prepends a checkbox to each one (only within the actual playlist contents, not recommended/suggested sections).
3. **Selection state** — clicking a checkbox adds/removes the video ID from a central `SelectionState`. Shift+Click selects a contiguous range. The floating toolbar toggles visibility based on selection count.
4. **Playlist dropdown** — fetched from YouTube's browse endpoint (`FEplaylist_aggregation`) on initialisation.
5. **Duplicate pre-check** — before showing the confirmation dialog, the script fetches the target playlist's contents to detect which selected videos already exist there.
6. **Batch dispatch** — videos are added via `POST /youtubei/v1/browse/edit_playlist` in chunks of 50 with 500 ms delays. Removals require `setVideoId` (a playlist-specific identifier), fetched separately per playlist.
7. **Progress dialog** — during long operations, a modal overlay with a progress bar and status message tells the user what is happening and asks them not to leave the tab.

## Architecture Notes

- No `import`/`export` — Tampermonkey evaluates `@require`d files sequentially in the same global scope. File order **is** the dependency chain.
- No build step for development — the `loader.user.js` approach gives instant hot-reload.
- YouTube's internal API is used (`/youtubei/v1/browse/edit_playlist`) — no official Google API calls, no quota.
- Rate-limiting is avoided by sequential chunked requests with 500 ms minimum spacing.
- All user-facing errors are shown in the floating toolbar; technical details are logged to the console under the `[YT-BULK]` filter.

## License

MIT
