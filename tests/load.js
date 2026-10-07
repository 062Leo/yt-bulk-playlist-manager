// load.js – Evaluates the global-scope userscript sources (same order as loader.user.js)
// inside a fresh function scope and returns every top-level declaration.
// main.js is skipped by default (it patches history and starts timers on load).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, sourceFiles } from '../scripts/build.mjs';
import { declaredNames } from '../scripts/globals.mjs';

export function loadUserscript({ includeMain = false } = {}) {
  let code = '';
  const names = [];
  for (const file of sourceFiles()) {
    if (file === 'main.js' && !includeMain) continue;
    const src = readFileSync(join(ROOT, file), 'utf8');
    code += `\n// ${file}\n${src}\n`;
    names.push(...declaredNames(src));
  }
  return new Function(`${code}\nreturn { ${names.join(', ')} };`)();
}

/** Minimal fetch Response stand-in. */
export function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: 'X',
    url: 'https://www.youtube.com/youtubei/v1/test',
    json: async () => body,
  };
}

export const SESSION = {
  apiKey: 'KEY',
  context: { client: { clientName: 'WEB', clientVersion: '2.0' } },
  authHeaders: { Authorization: 'SAPISIDHASH 1_x', 'X-Origin': 'https://www.youtube.com' },
};

export function encodePayload(obj) {
  return Buffer.from(JSON.stringify(obj), 'utf8').toString('base64url');
}

/** n distinct valid 11-char ids. */
export function makeIds(n, prefix = 'v') {
  return Array.from({ length: n }, (_, i) => (prefix + String(i).padStart(10, '0')).slice(0, 11));
}
