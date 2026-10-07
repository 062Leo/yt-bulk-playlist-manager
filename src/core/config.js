// config.js – Global constants: log prefix, batch limits, poll intervals, selectors, and element IDs

const CONFIG = Object.freeze({
  /** Console prefix used by all log output — filterable in DevTools. */
  LOG_PREFIX: '[YT-BULK]',

  /** Maximum number of video add actions per single API request. */
  BATCH_CHUNK_SIZE: 50,

  /** Milliseconds to wait between consecutive batch chunks to avoid rate-limiting. */
  CHUNK_DELAY_MS: 500,

  /** Maximum polling attempts when waiting for ytcfg to become available. */
  SESSION_POLL_MAX: 10,

  /** Milliseconds between ytcfg polling attempts. */
  SESSION_POLL_MS: 300,

  /** DOM id assigned to the floating control overlay. */
  OVERLAY_ID: 'yt-bulk-overlay',

  /** CSS class added to video renderers that already have a checkbox injected. */
  MANAGED_CLASS: 'yt-bulk-managed',

  /** Custom element selector for individual playlist video rows. */
  VIDEO_RENDERER: 'ytd-playlist-video-renderer',

  /** YouTube internal browse endpoint used for fetching playlists and other data. */
  BROWSE_ENDPOINT: 'https://www.youtube.com/youtubei/v1/browse',

  /** YouTube internal endpoint for batch-editing playlists (add/remove videos). */
  EDIT_PLAYLIST_ENDPOINT: 'https://www.youtube.com/youtubei/v1/browse/edit_playlist',

  /** YouTube internal endpoint for creating a playlist. */
  PLAYLIST_CREATE_ENDPOINT: 'https://www.youtube.com/youtubei/v1/playlist/create',

  /** Max browse pages (~100 videos each) scanned for the duplicate pre-check / setVideoId lookup. */
  PLAYLIST_SCAN_MAX_PAGES: 100,

  /** Max browse pages loaded for the user's playlist list (import dialog dropdown). */
  USER_PLAYLISTS_MAX_PAGES: 50,

  /** URL hash key used by SongVoyage: #sv-import=<base64url JSON>. */
  IMPORT_HASH_KEY: 'sv-import',

  /** Payload versions this script understands. */
  IMPORT_SUPPORTED_VERSION: 1,

  /** Videos sent with playlist/create; the rest go through edit_playlist in chunks. */
  IMPORT_CREATE_BATCH_SIZE: 10,
});

/**
 * Runs fn once the DOM is parsed. The script runs at document-start, so
 * anything that touches document.body/head must go through this.
 */
function whenDomReady(fn, doc) {
  doc = doc || document;
  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', fn, { once: true });
  } else {
    fn();
  }
}

function pluralize(count, singular, plural) {
  return count === 1 ? singular : plural || singular + 's';
}
