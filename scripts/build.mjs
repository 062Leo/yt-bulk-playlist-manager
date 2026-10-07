// build.mjs – Concatenates the @require'd sources (order taken from loader.user.js)
// into the single standalone dist/yt-bulk-playlist-manager.user.js.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const OUT = join(ROOT, 'dist', 'yt-bulk-playlist-manager.user.js');

const REPO_DIR = 'yt-bulk-playlist-manager/';

/** Source files (repo-relative) in @require order — loader.user.js is the single source of truth. */
export function sourceFiles() {
  const loader = readFileSync(join(ROOT, 'loader.user.js'), 'utf8');
  const files = [];
  for (const m of loader.matchAll(/^\/\/ @require\s+(\S+)$/gm)) {
    const url = m[1];
    const idx = url.lastIndexOf(REPO_DIR);
    if (idx === -1) throw new Error('Unexpected @require path: ' + url);
    files.push(url.slice(idx + REPO_DIR.length));
  }
  if (files.length === 0) throw new Error('No @require lines found in loader.user.js');
  return files;
}

export function version() {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  const loader = readFileSync(join(ROOT, 'loader.user.js'), 'utf8');
  const loaderVersion = (loader.match(/^\/\/ @version\s+(\S+)$/m) || [])[1];
  if (loaderVersion !== pkg.version) {
    throw new Error(
      `Version mismatch: package.json ${pkg.version} vs loader.user.js ${loaderVersion}`,
    );
  }
  return pkg.version;
}

export function header(v) {
  return `// ==UserScript==
// @name         YT Bulk Playlist Manager
// @namespace    https://github.com/local/yt-bulk-manager
// @version      ${v}
// @description  Adds multi-select checkboxes to YouTube playlist pages (bulk copy, move, remove) and imports SongVoyage playlists via YouTube's internal API.
// @author       local
// @match        https://www.youtube.com/*
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @noframes
// @run-at       document-start
// ==/UserScript==
`;
}

export function build() {
  let out = header(version());
  for (const file of sourceFiles()) {
    out += `\n// ─── ${file} ───────────────────────────────────────────────────────\n`;
    out += readFileSync(join(ROOT, file), 'utf8');
  }
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, out, 'utf8');
  return out;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const out = build();
  console.log(
    `  ✓  dist/yt-bulk-playlist-manager.user.js  (${Buffer.byteLength(out)} bytes, ${out.split('\n').length} lines)`,
  );
}
