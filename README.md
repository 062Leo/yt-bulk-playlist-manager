# YT Bulk Playlist Manager

A Tampermonkey/Violentmonkey userscript that adds multi-select checkboxes to YouTube playlist pages. Select multiple videos at once and **copy**, **move**, or **remove** them across playlists in bulk — using YouTube's internal API. No Google API key, no OAuth, no quota limits.

## Features

| Feature                         | What it does                                                       |
| ------------------------------- | ------------------------------------------------------------------ |
| Checkboxes                      | On every playlist row; **Shift+Click** selects a range             |
| Copy / Move / Remove            | Bulk add to another playlist, add + remove from current, or remove |
| Duplicate detection             | Videos already in the target are listed and skipped                |
| SongVoyage import               | `#sv-import=…` link opens an import dialog on any youtube.com page |
| Progress + confirmation dialogs | Every action is confirmed; long runs show a progress bar           |
| Safe batching                   | Sequential chunks of 50, ≥ 500 ms apart, 429 back-off              |
| SPA-aware                       | Re-initialises on YouTube's virtual navigation                     |

## SongVoyage import

SongVoyage opens `https://www.youtube.com/feed/playlists#sv-import=<payload>`.

| Item        | Contract                                                                                                                                 |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `<payload>` | base64url (RFC 4648 §5, no padding) of UTF-8 JSON `{"v":1,"title":"…","ids":["<11-char id>", …]}`                                        |
| ids         | Must match `/^[A-Za-z0-9_-]{11}$/`; invalid ones dropped, duplicates removed (order kept), up to ~5000                                   |
| Unknown `v` | Dialog "Update the userscript"                                                                                                           |
| Hash        | Captured and removed at `document-start` (`history.replaceState`), before YouTube can rewrite the URL, so a reload does not import again |

Flow: dialog "Import N songs from SongVoyage" → **Create new playlist** (name prefilled, Private / Unlisted / Public) or **Add to existing playlist** (shows "X already in playlist, will be skipped") → progress → "Added N, skipped M (duplicates), failed K" with an _Open playlist_ link.

New playlists are created with `POST /youtubei/v1/playlist/create` (first 10 videos); the rest is added via `edit_playlist` in chunks of 50. If the create call with videos fails, an empty playlist is created and everything is added in chunks. YouTube limits a playlist to 5000 videos.

## Installation

### Option 1: Quick install (end users)

1. Install the [Tampermonkey](https://www.tampermonkey.net/) extension for your browser (Chrome, Firefox, Edge, or Brave).
2. **[Download the latest release](https://github.com/062Leo/yt-bulk-playlist-manager/releases/tag/Release)** — a `.user.js` file.
3. Add the `.user.js` file to Tampermonkey (see Tampermonkey docs for how to install a userscript).
4. Navigate to any YouTube playlist page — the checkboxes and floating toolbar appear automatically.

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

## Development

Requires Node ≥ 20. Runtime stays dependency-free: the output is one plain `.user.js`.

| Command          | What                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------ |
| `npm ci`         | Install dev dependencies                                                             |
| `npm run build`  | Build `dist/yt-bulk-playlist-manager.user.js` (same as `./build.sh` / `.\build.ps1`) |
| `npm test`       | Vitest + jsdom tests                                                                 |
| `npm run lint`   | ESLint (flat config)                                                                 |
| `npm run format` | Prettier (write)                                                                     |
| `npm run check`  | lint → format check → tests → build → `node --check` on the build (CI)               |

The build concatenates the sources in the `@require` order of `loader.user.js` (single source of truth) and uses the version from `package.json` (must match `loader.user.js`).

Tests evaluate the global-scope sources (no `module.exports` footer) inside one function scope in jsdom and get every top-level declaration back (`tests/load.js`). `main.js` is not loaded in tests (it patches history and starts timers).

## Project Structure

```
yt-bulk-playlist-manager/
├── loader.user.js              ← Dev loader (requires source files from disk)
├── main.js                     ← Application entry point, wires all modules
├── build.sh / build.ps1        ← Wrappers for `node scripts/build.mjs`
├── scripts/                    ← build.mjs (bundle), globals.mjs (top-level names for lint/tests)
├── tests/                      ← Vitest tests + loader for the global-scope sources
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
│   │   ├── importDialog.js     ← SongVoyage import / error / result dialogs
│   │   └── state.js            ← Selection state manager (selectedIds, shift-click index)
│   ├── api/
│   │   ├── playlists.js        ← Fetch user playlists, check existing videos, resolve setVideoIds
│   │   └── dispatcher.js       ← Batch add/remove (edit_playlist), playlist/create
│   ├── import/
│   │   ├── payload.js          ← #sv-import parsing + validation, hash removal
│   │   └── songvoyage.js       ← Import flow (dialog → create/add → result)
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
- No build step for development — the `loader.user.js` approach gives instant hot-reload. New files need an `@require` line there (the build reads it).
- YouTube's internal API is used (`/youtubei/v1/browse/edit_playlist`) — no official Google API calls, no quota.
- Rate-limiting is avoided by sequential chunked requests with 500 ms minimum spacing.
- All user-facing errors are shown in the floating toolbar; technical details are logged to the console under the `[YT-BULK]` filter.

## Disclaimer

This script was created in **May 2026** and relies on YouTube's internal, undocumented API endpoints (`/youtubei/v1/browse/edit_playlist`) and DOM selectors. If YouTube changes its frontend architecture or API contracts, the script may stop working and will need to be updated.
