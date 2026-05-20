# YouTube Bulk Playlist Manager

A Tampermonkey/Violentmonkey userscript that adds multi-select checkboxes to YouTube playlist pages and dispatches batch add-to-playlist requests via YouTube's internal API — no Google API quota needed.

## How It Works

- Checkboxes are injected into every `ytd-playlist-video-renderer` row on playlist pages, your library, and "My Videos".
- Select videos individually, or use **Shift+Click** for range selection.
- A floating overlay appears at the bottom when videos are selected, showing a count badge, a playlist dropdown, and an **"Add to playlist"** button.
- Videos are dispatched in chunks of 50 with a 500 ms delay between chunks to avoid rate-limiting.

## Setup (Windows + Tampermonkey)

1. Install the [Tampermonkey](https://www.tampermonkey.net/) extension for your browser (Chrome/Firefox/Edge).
2. **Enable `file://` access** — this is required so Tampermonkey can load source files directly from disk:
   - In Tampermonkey settings → **Security** → enable **"Allow access to file URLs"**.
   - In your browser's extension settings for Tampermonkey, enable **"Allow access to file URLs"** as well.
3. Create a new userscript in Tampermonkey and paste the full contents of `loader.user.js` (with `@require` paths adjusted to match your local file structure).
4. The loader uses `@require file:///...` to pull in every module from disk.

## Hot-Reload Workflow

```
Edit source file in your editor → Save → F5 on the YouTube tab
```

- Tampermonkey re-evaluates all `@require`d files on page load, so every refresh picks up your latest changes.
- No copy-paste into Tampermonkey, no bundler, no build step.
- Filter the browser console by `[YT-BULK]` to see only script logs.
- For SPA navigations (YouTube doesn't do full page loads), the script listens for `yt-navigate-finish` and re-initialises automatically.

## Project Structure

```
yt-bulk-manager/
├── loader.user.js        ← Tampermonkey entry point
├── main.js               ← Wires all modules together
├── src/
│   ├── core/
│   │   ├── config.js     ← Constants, log prefix, batch limits
│   │   ├── logger.js     ← Unified logger with fixed prefix
│   │   ├── errors.js     ← Error type definitions
│   │   └── session.js    ← ytcfg extraction + polling
│   ├── ui/
│   │   ├── checkbox.js   ← Checkbox injection per video row
│   │   ├── overlay.js    ← Floating control panel
│   │   └── state.js      ← Selection state array (selectedIds[])
│   ├── api/
│   │   ├── playlists.js  ← Fetch user's playlist list
│   │   └── dispatcher.js ← Batch POST to edit_playlist endpoint
│   └── observer.js       ← MutationObserver, SPA re-init on navigate
```

## License

MIT
