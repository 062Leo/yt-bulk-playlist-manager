# YouTube Bulk Playlist Manager – AI Context Document

> Concise build reference for an AI coding assistant. Covers architecture, constraints, and all known pitfalls.

---

## What We Are Building

A **Tampermonkey/Violentmonkey userscript** that adds multi-select checkboxes to YouTube playlist pages and dispatches batch add-to-playlist requests via YouTube's internal API — no official Google API quota needed.

**Dev workflow:** A lightweight **loader script** in Tampermonkey `@require`s the actual source files from `file:///` paths on disk. No copy-paste into Tampermonkey after every change — just save the file and refresh the page.

---

## Project Structure

```
yt-bulk-manager/
├── loader.user.js          ← Tampermonkey entry point (only file pasted into TM)
├── src/
│   ├── core/
│   │   ├── config.js       ← Constants, log prefix, batch limits
│   │   ├── session.js      ← ytcfg extraction + polling
│   │   ├── logger.js       ← Unified logger with fixed prefix
│   │   └── errors.js       ← Error type definitions
│   ├── ui/
│   │   ├── checkbox.js     ← Checkbox injection per video row
│   │   ├── overlay.js      ← Floating control panel
│   │   └── state.js        ← Selection state array (selectedIds[])
│   ├── api/
│   │   ├── playlists.js    ← Fetch user's playlist list
│   │   └── dispatcher.js   ← Batch POST to edit_playlist endpoint
│   └── observer.js         ← MutationObserver, SPA re-init on navigate
└── main.js                 ← Wires all modules together
```

**Principles:** SOLID, single-responsibility per file, all modules export pure functions or class instances (no global state except `state.js`).

---

## Loader Script (Tampermonkey)

```js
// ==UserScript==
// @name         YT Bulk Playlist – Loader
// @match        https://www.youtube.com/playlist?list=*
// @match        https://www.youtube.com/feed/library
// @match        https://www.youtube.com/my_videos*
// @grant        GM_xmlhttpRequest
// @noframes
// @require      file:///C:/dev/yt-bulk-manager/src/core/config.js
// @require      file:///C:/dev/yt-bulk-manager/src/core/logger.js
// @require      file:///C:/dev/yt-bulk-manager/src/core/errors.js
// @require      file:///C:/dev/yt-bulk-manager/src/core/session.js
// @require      file:///C:/dev/yt-bulk-manager/src/ui/state.js
// @require      file:///C:/dev/yt-bulk-manager/src/ui/checkbox.js
// @require      file:///C:/dev/yt-bulk-manager/src/ui/overlay.js
// @require      file:///C:/dev/yt-bulk-manager/src/api/playlists.js
// @require      file:///C:/dev/yt-bulk-manager/src/api/dispatcher.js
// @require      file:///C:/dev/yt-bulk-manager/src/observer.js
// @require      file:///C:/dev/yt-bulk-manager/main.js
// ==/UserScript==
```

**Windows requirement:** In Tampermonkey settings → Security → allow access to `file://` URLs. Also enable "Allow access to file URLs" in the Chrome/Firefox extension settings for Tampermonkey.

Hot reload = save file → F5 on YouTube tab.

---

## Logging

All log output uses a **fixed, filterable prefix** so you can filter the browser console easily.

```js
// config.js
const LOG_PREFIX = '[YT-BULK]';

// logger.js
const Logger = {
  info:    (...args) => console.log(LOG_PREFIX, '[INFO]',    ...args),
  success: (...args) => console.log(LOG_PREFIX, '[SUCCESS]', ...args),
  warn:    (...args) => console.warn(LOG_PREFIX, '[WARN]',   ...args),
  error:   (...args) => console.error(LOG_PREFIX, '[ERROR]', ...args),
  debug:   (...args) => console.debug(LOG_PREFIX, '[DEBUG]', ...args),
};
```

Filter in DevTools console: type `[YT-BULK]` in the filter field.

---

## Session Extraction

YouTube is a SPA. `window.ytcfg` may not be populated when the script first runs.

```js
// session.js – polling with fallback
function getSession(maxAttempts = 10, intervalMs = 300) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const poll = setInterval(() => {
      attempts++;
      const key = window.ytcfg?.get('INNERTUBE_API_KEY');
      const ctx = window.ytcfg?.get('INNERTUBE_CONTEXT');
      if (key && ctx) {
        clearInterval(poll);
        Logger.success('Session acquired after', attempts, 'attempt(s)');
        resolve({ apiKey: key, context: ctx });
      } else if (attempts >= maxAttempts) {
        clearInterval(poll);
        Logger.error('ytcfg not available after max attempts');
        reject(new SessionError('ytcfg unavailable'));
      }
    }, intervalMs);
  });
}
```

**SPA navigation:** YouTube fires `yt-navigate-finish` on each virtual page navigation. Listen for it to re-init the script.

```js
window.addEventListener('yt-navigate-finish', () => {
  Logger.info('SPA navigation detected – re-initialising');
  init();
});
```

---

## DOM Injection

- **Target selector:** `ytd-playlist-video-renderer`
- **Checkbox placement:** prepend to `#content` inside each renderer
- **Duplicate guard:** add class `yt-bulk-managed` after injection; skip if already present
- **videoId extraction:** read `href` of `a#video-title`, parse `v=` param with `URLSearchParams`
- **Shift+click range select:** track `lastChecked` index; on shift+click, toggle all checkboxes between `lastChecked` and current index

```js
// checkbox.js – skeleton
function injectCheckbox(renderer) {
  if (renderer.classList.contains('yt-bulk-managed')) return;
  const anchor = renderer.querySelector('a#video-title');
  if (!anchor) return;
  const videoId = new URLSearchParams(new URL(anchor.href).search).get('v');
  if (!videoId) { Logger.warn('Could not extract videoId from', anchor.href); return; }

  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.dataset.videoId = videoId;
  cb.addEventListener('change', (e) => onCheckboxChange(e, videoId));

  renderer.querySelector('#content')?.prepend(cb);
  renderer.classList.add('yt-bulk-managed');
  Logger.debug('Injected checkbox for videoId', videoId);
}
```

---

## MutationObserver

YouTube lazy-loads video rows. The observer watches for new `ytd-playlist-video-renderer` nodes.

```js
// observer.js
function startObserver() {
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof Element)) continue;
        const renderers = node.matches('ytd-playlist-video-renderer')
          ? [node]
          : [...node.querySelectorAll('ytd-playlist-video-renderer')];
        renderers.forEach(injectCheckbox);
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  Logger.info('MutationObserver started');
  return observer;
}
```

---

## Floating Overlay

- Fixed to bottom of viewport
- Hidden by default (`display: none`)
- Shown when `selectedIds.length > 0`
- Contains: selected count badge · playlist dropdown · "Add to playlist" button · loading/spinner state

```js
// overlay.js – visibility toggle
function syncOverlayVisibility(count) {
  const overlay = document.getElementById('yt-bulk-overlay');
  if (!overlay) return;
  overlay.style.display = count > 0 ? 'flex' : 'none';
  overlay.querySelector('#yt-bulk-count').textContent = `${count} selected`;
}
```

**Note:** Do NOT use `position: fixed` inside iframes (handled by `@noframes`). The overlay is injected into the top-level document only.

---

## Playlist List Fetch

No ytcfg entry lists user playlists. Fetch them via:

```
POST https://www.youtube.com/youtubei/v1/browse?key={apiKey}
Body: { context, browseId: "FEmy_videos" }
```

Parse `response.contents` → filter items where `type === 'playlist'` → extract `playlistId` and `title`.

```js
// playlists.js
async function fetchUserPlaylists(session) {
  Logger.info('Fetching user playlists...');
  const res = await fetch(
    `https://www.youtube.com/youtubei/v1/browse?key=${session.apiKey}`,
    {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context: session.context, browseId: 'FEmy_videos' }),
    }
  );
  if (!res.ok) throw new ApiError(`Playlist fetch failed: HTTP ${res.status}`);
  const data = await res.json();
  // Parse playlist items from response tree
  const items = extractPlaylists(data); // helper function
  Logger.success(`Found ${items.length} playlists`);
  return items;
}
```

---

## Batch Dispatcher

**Endpoint:** `POST https://www.youtube.com/youtubei/v1/browse/edit_playlist?key={apiKey}`

**Hard limits (empirically observed):**
- Max **50 actions per request**
- Min **500 ms delay between chunks** to avoid rate-limiting

**HTTP error handling:**
| Status | Action |
|--------|--------|
| 401/403 | Show UI error: "Session expired – refresh page" |
| 429 | Exponential backoff: 1s → 2s → 4s → fail |
| Network error | Log error, offer retry |
| 200 but silent fail | Validate response body; YouTube returns no error code on duplicate adds |

```js
// dispatcher.js
async function dispatchBatch(session, playlistId, videoIds) {
  const CHUNK_SIZE = 50;
  const CHUNK_DELAY_MS = 500;
  const chunks = chunkArray(videoIds, CHUNK_SIZE);
  Logger.info(`Dispatching ${videoIds.length} videos in ${chunks.length} chunk(s)`);

  for (let i = 0; i < chunks.length; i++) {
    const actions = chunks[i].map(id => ({ action: 'ACTION_ADD_VIDEO', addedVideoId: id }));
    const payload = {
      context: session.context,
      playlistId,
      actions,
    };
    Logger.debug(`Chunk ${i + 1}/${chunks.length}:`, actions.length, 'actions');

    const res = await fetchWithRetry(
      `https://www.youtube.com/youtubei/v1/browse/edit_playlist?key=${session.apiKey}`,
      { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
    );
    if (!res.ok) throw new ApiError(`edit_playlist failed: HTTP ${res.status}`, res.status);
    Logger.success(`Chunk ${i + 1} dispatched successfully`);

    if (i < chunks.length - 1) await sleep(CHUNK_DELAY_MS);
  }
  Logger.success(`All ${videoIds.length} videos added to playlist ${playlistId}`);
}
```

---

## Error Types

```js
// errors.js
class SessionError extends Error { constructor(msg) { super(msg); this.name = 'SessionError'; } }
class ApiError extends Error {
  constructor(msg, status) { super(msg); this.name = 'ApiError'; this.status = status; }
}
class InjectionError extends Error { constructor(msg) { super(msg); this.name = 'InjectionError'; } }
```

All errors caught at the top-level `main.js` entry point and logged via `Logger.error`.

---

## Key Constants (config.js)

```js
const CONFIG = {
  LOG_PREFIX:        '[YT-BULK]',
  BATCH_CHUNK_SIZE:  50,
  CHUNK_DELAY_MS:    500,
  SESSION_POLL_MAX:  10,
  SESSION_POLL_MS:   300,
  OVERLAY_ID:        'yt-bulk-overlay',
  MANAGED_CLASS:     'yt-bulk-managed',
  VIDEO_RENDERER:    'ytd-playlist-video-renderer',
};
```

---

## What NOT to Do

- Do **not** use `localStorage` or `sessionStorage` (breaks in some TM sandboxes)
- Do **not** hardcode `apiKey` or `context` — always read live from `ytcfg`
- Do **not** fire requests in parallel across chunks — sequential with delay only
- Do **not** inject into iframes — use `@noframes` in userscript header
- Do **not** rely on ytcfg being present at script start — always poll
