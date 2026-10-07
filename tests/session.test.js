import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { loadUserscript } from './load.js';

let m;
beforeEach(() => {
  m = loadUserscript();
});
afterEach(() => {
  document.cookie = 'SAPISID=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
  vi.useRealTimers();
  delete window.ytcfg;
});

describe('SAPISID auth', () => {
  it('computes SAPISIDHASH <ts>_<sha1(ts sapisid origin)>', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const ts = Math.floor(Date.now() / 1000);
    const sha = createHash('sha1').update(`${ts} SECRET https://www.youtube.com`).digest('hex');
    expect(await m.computeSapisidHash('SECRET', 'https://www.youtube.com')).toBe(
      `SAPISIDHASH ${ts}_${sha}`,
    );
  });

  it('reads the SAPISID cookie', () => {
    expect(m.getSapisidCookie()).toBeNull();
    document.cookie = 'SAPISID=abc/def';
    expect(m.getSapisidCookie()).toBe('abc/def');
  });

  it('getRequestHeaders builds fresh auth headers from the cookie', async () => {
    document.cookie = 'SAPISID=abc';
    const h = await m.getRequestHeaders({ authHeaders: { Authorization: 'old' } });
    expect(h['Content-Type']).toBe('application/json');
    expect(h.Authorization).toMatch(/^SAPISIDHASH \d+_[0-9a-f]{40}$/);
    expect(h['X-Origin']).toBe(location.origin);
  });

  it('getRequestHeaders falls back to session headers without cookie', async () => {
    const h = await m.getRequestHeaders({ authHeaders: { Authorization: 'old' } });
    expect(h.Authorization).toBe('old');
  });
});

describe('getSession', () => {
  it('polls ytcfg until apiKey and context exist', async () => {
    vi.useFakeTimers();
    const done = m.getSession();
    await vi.advanceTimersByTimeAsync(300);
    const cfg = { INNERTUBE_API_KEY: 'K', INNERTUBE_CONTEXT: { client: { clientVersion: '1' } } };
    window.ytcfg = { get: (k) => cfg[k] };
    await vi.advanceTimersByTimeAsync(300);
    const s = await done;
    expect(s.apiKey).toBe('K');
    expect(m.getClientVersion(s)).toBe('1');
  });

  it('rejects with SessionError after max attempts', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const done = m.getSession();
    const assertion = expect(done).rejects.toMatchObject({ name: 'SessionError' });
    await vi.advanceTimersByTimeAsync(300 * 10);
    await assertion;
  });
});
