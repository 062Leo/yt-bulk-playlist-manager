import js from '@eslint/js';
import globals from 'globals';
import { projectGlobals } from './scripts/globals.mjs';

// The userscript sources share one global scope (Tampermonkey @require).
// Every top-level declaration of every source file is a known global for all of them.
const shared = Object.fromEntries(
  Object.values(projectGlobals())
    .flat()
    .map((name) => [name, 'writable']),
);

export default [
  { ignores: ['dist/', 'node_modules/', 'coverage/'] },
  js.configs.recommended,
  {
    files: ['src/**/*.js', 'main.js', 'loader.user.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        ...globals.browser,
        ...shared,
        unsafeWindow: 'readonly',
        GM_xmlhttpRequest: 'readonly',
      },
    },
    rules: {
      'no-redeclare': ['error', { builtinGlobals: false }],
      'no-unused-vars': ['error', { vars: 'local', args: 'none', caughtErrors: 'none' }],
    },
  },
  {
    files: ['scripts/**/*.mjs', 'tests/**/*.js', '*.config.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node, ...globals.browser },
    },
  },
];
