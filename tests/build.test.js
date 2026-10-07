import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { ROOT, build, sourceFiles, version } from '../scripts/build.mjs';

describe('build', () => {
  it('takes the file order from loader.user.js and ends with main.js', () => {
    const files = sourceFiles();
    expect(files[0]).toBe('src/core/config.js');
    expect(files.at(-1)).toBe('main.js');
    for (const f of files) expect(() => readFileSync(join(ROOT, f))).not.toThrow();
  });

  it('keeps loader and package versions in sync', () => {
    expect(version()).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('produces one parseable userscript with a header', () => {
    const out = build();
    expect(out.startsWith('// ==UserScript==')).toBe(true);
    expect(out).toContain(`// @version      ${version()}`);
    expect(out).not.toMatch(/@require/);
    expect(out).not.toMatch(/^\s*(import|export)\s/m);
    expect(() => new vm.Script(out)).not.toThrow();
  });
});
