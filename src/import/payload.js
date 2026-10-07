// payload.js – Parses and validates the SongVoyage import hash (#sv-import=<base64url JSON>)

var YOUTUBE_ID_RE = /^[A-Za-z0-9_-]{11}$/;

/** Decodes base64url (RFC 4648 §5, padding optional) to a UTF-8 string. Throws on bad input. */
function base64UrlDecode(input) {
  if (typeof input !== 'string' || !/^[A-Za-z0-9_-]*={0,2}$/.test(input)) {
    throw new Error('not base64url');
  }
  var b64 = input.replace(/=+$/, '').replace(/-/g, '+').replace(/_/g, '/');
  if (b64.length % 4 === 1) {
    throw new Error('bad base64url length');
  }
  while (b64.length % 4 !== 0) b64 += '=';
  var binary = atob(b64);
  var bytes = new Uint8Array(binary.length);
  for (var i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

/** Keeps valid 11-char YouTube ids, drops the rest, removes duplicates (first wins). */
function sanitizeVideoIds(ids) {
  var seen = Object.create(null);
  var out = [];
  for (var i = 0; i < ids.length; i++) {
    var id = ids[i];
    if (typeof id !== 'string' || !YOUTUBE_ID_RE.test(id) || seen[id]) continue;
    seen[id] = true;
    out.push(id);
  }
  return out;
}

/**
 * Parses the raw payload string.
 * Returns {ok: true, title, ids, invalidCount, duplicateCount}
 *      or {ok: false, code: 'decode'|'json'|'shape'|'version'|'empty', error}.
 */
function parseImportPayload(raw) {
  var json;
  try {
    json = base64UrlDecode(raw);
  } catch (e) {
    return { ok: false, code: 'decode', error: 'The import link is damaged (not base64url).' };
  }

  var data;
  try {
    data = JSON.parse(json);
  } catch (e) {
    return { ok: false, code: 'json', error: 'The import link is damaged (invalid JSON).' };
  }

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, code: 'shape', error: 'The import link has an unexpected format.' };
  }

  if (data.v !== CONFIG.IMPORT_SUPPORTED_VERSION) {
    return {
      ok: false,
      code: 'version',
      error:
        'This import link uses format version ' +
        String(data.v) +
        '. Update the userscript (YT Bulk Playlist Manager) to import it.',
    };
  }

  if (!Array.isArray(data.ids)) {
    return { ok: false, code: 'shape', error: 'The import link contains no video list.' };
  }

  var ids = sanitizeVideoIds(data.ids);
  var validCount = 0;
  for (var i = 0; i < data.ids.length; i++) {
    if (typeof data.ids[i] === 'string' && YOUTUBE_ID_RE.test(data.ids[i])) validCount++;
  }

  if (ids.length === 0) {
    return { ok: false, code: 'empty', error: 'The import link contains no valid YouTube videos.' };
  }

  var title = typeof data.title === 'string' ? data.title.trim() : '';
  return {
    ok: true,
    title: title || 'SongVoyage import',
    ids: ids,
    invalidCount: data.ids.length - validCount,
    duplicateCount: validCount - ids.length,
  };
}

/** Returns the raw payload from a location hash ('#sv-import=...'), or null. */
function readImportHash(hash) {
  if (typeof hash !== 'string') return null;
  var body = hash.charAt(0) === '#' ? hash.slice(1) : hash;
  var prefix = CONFIG.IMPORT_HASH_KEY + '=';
  if (body.indexOf(prefix) !== 0) return null;
  return body.slice(prefix.length);
}

/** Removes the hash from the URL without navigating, keeping YouTube's history state. */
function stripImportHash(win) {
  win = win || window;
  var loc = win.location;
  var url = loc.pathname + loc.search;
  try {
    win.history.replaceState(win.history.state, '', url);
  } catch (e) {
    loc.hash = '';
  }
}
