# AGENTS.md — YouTube Bulk Playlist Manager

## Overview

A Tampermonkey userscript that injects multi-select checkboxes into YouTube playlist pages and batch-dispatches add-to-playlist requests via YouTube's internal API. No build step, no bundler, no npm — plain vanilla JS loaded via `@require file:///` from disk.

## Architecture: `@require` load order matters

Tampermonkey evaluates `@require`d files sequentially in the **same global scope**. There are no `import`/`export` statements. The order in `loader.user.js` **is** the dependency chain:

1. `config.js` — no deps, loads first
2. `logger.js` — reads `CONFIG.LOG_PREFIX`
3. `errors.js` — no deps
4. `session.js` — reads `Logger`, custom errors
5. `state.js` — no deps (manages `selectedIds[]`)
6. `checkbox.js` — reads `state`, `CONFIG`, `Logger`
7. `overlay.js` — reads `state`, `CONFIG`, `Logger`
8. `playlists.js` — reads `session`, `CONFIG`, `Logger`, custom errors
9. `dispatcher.js` — reads `session`, `CONFIG`, `Logger`, custom errors
10. `observer.js` — reads `checkbox`, `CONFIG`, `Logger`
11. `main.js` — loaded last, wires all modules and listens for `yt-navigate-finish`

When adding a new module that references something from another module, add its `@require` **after** its dependency in `loader.user.js`. When adding a new dependency, update both the `@require` list and the comment header in `main.js`.

## No tooling

- No `package.json`, no `node_modules`, no linter, no typechecker, no test runner.
- Files are vanilla JS (ES5+ compatible). Avoid modern syntax that Tampermonkey's sandbox might reject (`?.` optional chaining is fine; `??` nullish coalescing is fine; modules/`import`/`export` are not).
- `@grant GM_xmlhttpRequest` is declared but no other GM_* APIs are used.

## WSL + Windows pathing

The project lives on Windows (`C:\...`) but development happens from WSL. Two implications:
- Paths in `loader.user.js` must use **Windows-style `file:///C:/...`** (not `/mnt/c/...`).
- File writes from WSL go through `/mnt/c/...`, which is the same physical location. No special translation needed when editing from WSL.

## Reference document

`docs/yt-bulk-playlist-context.md` contains the full architecture spec, endpoint descriptions, error codes, rate-limit rules, DOM selectors, and code skeletons. Consult it for any technical question about how a module should behave.

## Constraints (from context doc)

- Do **not** use `localStorage` or `sessionStorage` (breaks in some TM sandboxes).
- Do **not** hardcode `apiKey` or `context` — always read live from `window.ytcfg`.
- Do **not** fire batch requests in parallel — sequential chunks only, 500 ms delay minimum.
- Use `@noframes` in the userscript header; never inject into iframes.
- `CONFIG` is `Object.freeze()`'d — never mutate it, read only.
- YouTube is a SPA. Watch for `yt-navigate-finish` to re-init on virtual navigation.
- `window.ytcfg` may not exist at script start — always poll (see `session.js`).

## Logging

Filter DevTools console by `[YT-BULK]` to see only script output. Five log levels: `Logger.info()`, `.success()`, `.warn()`, `.error()`, `.debug()`. Use `logGroup(label, fn)` for grouped log output.
