# AGENTS.md — YouTube Bulk Playlist Manager

## Overview

A Tampermonkey userscript that injects multi-select checkboxes into YouTube playlist pages, batch-dispatches playlist edits via YouTube's internal API, and imports SongVoyage song lists (`#sv-import=` hash, any youtube.com page). Plain vanilla JS in one global scope, loaded via `@require file:///` from disk (dev) or as one built `dist/*.user.js`. npm is dev tooling only — no runtime dependencies.

## Architecture: `@require` load order matters

Tampermonkey evaluates `@require`d files sequentially in the **same global scope**. No `import`/`export`. The `@require` list in `loader.user.js` **is** the dependency chain and the single source of truth for the build and the tests:

| #   | File                       | Uses                                                            |
| --- | -------------------------- | --------------------------------------------------------------- |
| 1   | `src/core/config.js`       | — (`CONFIG`, `pluralize`)                                       |
| 2   | `src/core/logger.js`       | `CONFIG`                                                        |
| 3   | `src/core/errors.js`       | —                                                               |
| 4   | `src/core/session.js`      | `Logger`, errors (`getSession`, `getRequestHeaders`)            |
| 5   | `src/ui/state.js`          | — (`selectionState`)                                            |
| 6   | `src/ui/checkbox.js`       | state, `CONFIG`, `Logger`                                       |
| 7   | `src/ui/overlay.js`        | state, `CONFIG`, `Logger` (toolbar, confirm + progress dialogs) |
| 8   | `src/ui/importDialog.js`   | `Logger`, `pluralize` (SongVoyage dialogs)                      |
| 9   | `src/api/playlists.js`     | session, `CONFIG`, errors                                       |
| 10  | `src/api/dispatcher.js`    | session, `CONFIG`, errors (edit_playlist, playlist/create)      |
| 11  | `src/import/payload.js`    | `CONFIG` (parse/validate hash)                                  |
| 12  | `src/import/songvoyage.js` | everything above (import flow)                                  |
| 13  | `src/observer.js`          | checkbox, `CONFIG`, `Logger`                                    |
| 14  | `main.js`                  | wires all modules, SPA listeners, `checkSongVoyageImport()`     |

A new file needs an `@require` line in `loader.user.js` **after** its dependencies — nothing else (build, ESLint globals and the test loader read that list).

## Tooling

| Command                           | What                                                                                           |
| --------------------------------- | ---------------------------------------------------------------------------------------------- |
| `npm run build`                   | `scripts/build.mjs` → `dist/yt-bulk-playlist-manager.user.js` (`build.sh`/`build.ps1` wrap it) |
| `npm test`                        | Vitest + jsdom (`tests/*.test.js`)                                                             |
| `npm run lint` / `npm run format` | ESLint flat config / Prettier (single quotes, 100 cols)                                        |
| `npm run check`                   | lint → format check → tests → build → `node --check` (CI: `.github/workflows/ci.yml`)          |

| Topic   | Rule                                                                                                                                                             |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Version | `package.json` `version` and `loader.user.js` `@version` must match (build fails otherwise)                                                                      |
| Tests   | `tests/load.js` evaluates the sources in one function scope and returns all top-level names; no `module.exports` footer. `main.js` is not loaded (side effects). |
| Globals | `scripts/globals.mjs` scans top-level declarations; ESLint treats them as shared globals                                                                         |
| Syntax  | ES2022 script syntax (no modules). `?.`/`??` fine.                                                                                                               |
| GM APIs | `@grant GM_xmlhttpRequest` / `unsafeWindow` declared; only `unsafeWindow` (guarded) is used                                                                      |
| `dist/` | git-ignored; build locally or attach to a release                                                                                                                |

## WSL + Windows pathing

The project lives on Windows (`C:\...`) but development happens from WSL. Two implications:

- Paths in `loader.user.js` must use **Windows-style `file:///C:/...`** (not `/mnt/c/...`).
- File writes from WSL go through `/mnt/c/...`, which is the same physical location. No special translation needed when editing from WSL.

## SongVoyage contract (fixed — the SongVoyage side depends on it)

`#sv-import=<base64url of UTF-8 JSON {"v":1,"title":"…","ids":[…]}>`; ids `/^[A-Za-z0-9_-]{11}$/`, invalid dropped, deduped in order, up to ~5000; unknown `v` → "Update the userscript". Hash is removed via `history.replaceState` before anything else.

## Constraints

- Do **not** use `localStorage` or `sessionStorage` (breaks in some TM sandboxes).
- Do **not** hardcode `apiKey` or `context` — always read live from `window.ytcfg`.
- Do **not** fire batch requests in parallel — sequential chunks only, 500 ms delay minimum.
- Use `@noframes` in the userscript header; never inject into iframes.
- `CONFIG` is `Object.freeze()`'d — never mutate it, read only.
- YouTube is a SPA. Watch for `yt-navigate-finish` to re-init on virtual navigation.
- `window.ytcfg` may not exist at script start — always poll (see `session.js`).

## Startup (`@run-at document-start`)

| Step                                                         | When                                                  |
| ------------------------------------------------------------ | ----------------------------------------------------- |
| `captureImportHash()` reads + strips `#sv-import=`           | synchronously at script start (`main.js` top)         |
| `init()`, `checkSongVoyageImport(captured)` and all DOM work | `whenDomReady()` (DOMContentLoaded or already parsed) |

Never touch `document.body`/`head` at top level; go through `whenDomReady`.

## Logging

Filter DevTools console by `[YT-BULK]` to see only script output. Five log levels: `Logger.info()`, `.success()`, `.warn()`, `.error()`, `.debug()`. Use `logGroup(label, fn)` for grouped log output.
