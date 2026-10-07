import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { loadUserscript, jsonResponse, encodePayload, makeIds } from './load.js';

function setReadyState(value) {
  Object.defineProperty(document, 'readyState', { configurable: true, get: () => value });
}

beforeEach(() => {
  document.body.innerHTML = '';
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  delete document.readyState;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete window.ytcfg;
});

describe('whenDomReady', () => {
  it('defers until DOMContentLoaded while loading', () => {
    const m = loadUserscript();
    setReadyState('loading');
    const fn = vi.fn();
    m.whenDomReady(fn);
    expect(fn).not.toHaveBeenCalled();
    document.dispatchEvent(new Event('DOMContentLoaded'));
    document.dispatchEvent(new Event('DOMContentLoaded'));
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('runs immediately once the DOM is parsed', () => {
    const m = loadUserscript();
    setReadyState('interactive');
    const fn = vi.fn();
    m.whenDomReady(fn);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('captureImportHash', () => {
  it('returns the payload and strips the hash synchronously', () => {
    const m = loadUserscript();
    history.replaceState(null, '', '/feed/playlists#sv-import=abc');
    expect(m.captureImportHash(window)).toBe('abc');
    expect(location.hash).toBe('');
    expect(m.captureImportHash(window)).toBeNull();
  });

  it('leaves unrelated hashes alone', () => {
    const m = loadUserscript();
    history.replaceState(null, '', '/watch?v=x#t=10');
    expect(m.captureImportHash(window)).toBeNull();
    expect(location.hash).toBe('#t=10');
  });
});

describe('main.js at document-start', () => {
  it('captures the hash at load and defers init + import until the DOM is ready', async () => {
    vi.useFakeTimers();
    const cfg = { INNERTUBE_API_KEY: 'K', INNERTUBE_CONTEXT: { client: {} } };
    window.ytcfg = { get: (k) => cfg[k] };
    const fetchMock = vi.fn(async () => jsonResponse({ contents: [] }));
    vi.stubGlobal('fetch', fetchMock);
    setReadyState('loading');
    history.replaceState(
      null,
      '',
      '/feed/playlists#sv-import=' + encodePayload({ v: 1, title: 'x', ids: makeIds(2) }),
    );

    loadUserscript({ includeMain: true });
    expect(location.hash).toBe(''); // captured + stripped synchronously

    await vi.advanceTimersByTimeAsync(1000);
    expect(document.getElementById('yt-bulk-import-dialog')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();

    setReadyState('interactive');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await vi.advanceTimersByTimeAsync(400);
    const dialog = document.getElementById('yt-bulk-import-dialog');
    expect(dialog.textContent).toContain('Import 2 songs from SongVoyage');
    document.getElementById('yt-bulk-import-cancel').click();
    vi.clearAllTimers();
  });
});
