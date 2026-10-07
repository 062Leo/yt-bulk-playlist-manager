// globals.mjs – Lists the top-level names each global-scope source file declares.
// Used by eslint.config.js (cross-file globals) and the test loader.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, sourceFiles } from './build.mjs';

const DECL =
  /^(?:async\s+function\s*\*?|function\s*\*?|var|let|const|class)\s+([A-Za-z_$][\w$]*)/gm;

export function declaredNames(code) {
  return [...code.matchAll(DECL)].map((m) => m[1]);
}

/** { 'src/core/config.js': ['CONFIG', 'pluralize'], ... } in load order. */
export function projectGlobals() {
  const out = {};
  for (const file of sourceFiles()) {
    out[file] = declaredNames(readFileSync(join(ROOT, file), 'utf8'));
  }
  return out;
}
