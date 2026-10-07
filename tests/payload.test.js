import { describe, it, expect, beforeEach } from 'vitest';
import { loadUserscript, encodePayload, makeIds } from './load.js';

let m;
beforeEach(() => {
  m = loadUserscript();
});

describe('parseImportPayload', () => {
  it('accepts a valid v1 payload', () => {
    const ids = makeIds(3);
    const r = m.parseImportPayload(encodePayload({ v: 1, title: 'My mix', ids }));
    expect(r).toEqual({ ok: true, title: 'My mix', ids, invalidCount: 0, duplicateCount: 0 });
  });

  it('decodes UTF-8 titles and base64url characters (- and _)', () => {
    const title = 'Für dich ♫ — 日本 ' + '?'.repeat(40);
    const raw = encodePayload({ v: 1, title, ids: ['dQw4w9WgXcQ'] });
    expect(raw).toMatch(/[-_]/);
    expect(m.parseImportPayload(raw).title).toBe(title);
  });

  it('tolerates padding', () => {
    const raw = Buffer.from(JSON.stringify({ v: 1, title: 'a', ids: ['dQw4w9WgXcQ'] })).toString(
      'base64',
    );
    expect(m.parseImportPayload(raw.replace(/\+/g, '-').replace(/\//g, '_')).ok).toBe(true);
  });

  it.each([
    ['invalid characters', 'abc$%^'],
    ['standard base64 +/', 'ab+/'],
    ['impossible length', 'abcde'],
    ['invalid UTF-8', Buffer.from([0xff, 0xfe, 0xfd]).toString('base64url')],
  ])('rejects bad base64url: %s', (_, raw) => {
    expect(m.parseImportPayload(raw)).toMatchObject({ ok: false, code: 'decode' });
  });

  it('rejects bad JSON', () => {
    const raw = Buffer.from('{"v":1,').toString('base64url');
    expect(m.parseImportPayload(raw)).toMatchObject({ ok: false, code: 'json' });
  });

  it.each([[null], [[1, 2]], ['str'], [42]])('rejects non-object JSON %j', (value) => {
    expect(m.parseImportPayload(encodePayload(value))).toMatchObject({ ok: false, code: 'shape' });
  });

  it.each([[2], [0], ['1'], [undefined]])('rejects unknown version %j with an update hint', (v) => {
    const r = m.parseImportPayload(encodePayload({ v, title: 't', ids: ['dQw4w9WgXcQ'] }));
    expect(r).toMatchObject({ ok: false, code: 'version' });
    expect(r.error).toContain('Update the userscript');
  });

  it('rejects a missing ids array', () => {
    expect(m.parseImportPayload(encodePayload({ v: 1, title: 't' }))).toMatchObject({
      ok: false,
      code: 'shape',
    });
  });

  it('drops invalid ids and removes duplicates preserving order', () => {
    const raw = encodePayload({
      v: 1,
      title: 't',
      ids: [
        'bbbbbbbbbbb',
        'short',
        'aaaaaaaaaaa',
        'bbbbbbbbbbb',
        42,
        'has space!!',
        'a-b_c-d_e-f',
        'aaaaaaaaaaa',
        'twelvechars1',
      ],
    });
    expect(m.parseImportPayload(raw)).toEqual({
      ok: true,
      title: 't',
      ids: ['bbbbbbbbbbb', 'aaaaaaaaaaa', 'a-b_c-d_e-f'],
      invalidCount: 4,
      duplicateCount: 2,
    });
  });

  it('handles ids that collide with Object.prototype names', () => {
    const r = m.parseImportPayload(encodePayload({ v: 1, ids: ['constructor', 'constructor'] }));
    expect(r.ids).toEqual(['constructor']);
  });

  it('rejects a payload without any valid id', () => {
    expect(m.parseImportPayload(encodePayload({ v: 1, title: 't', ids: ['x'] }))).toMatchObject({
      ok: false,
      code: 'empty',
    });
  });

  it('falls back to a default title', () => {
    expect(
      m.parseImportPayload(encodePayload({ v: 1, title: '  ', ids: ['dQw4w9WgXcQ'] })).title,
    ).toBe('SongVoyage import');
  });

  it('handles 5000 ids', () => {
    const ids = makeIds(5000);
    const r = m.parseImportPayload(encodePayload({ v: 1, title: 'big', ids }));
    expect(r.ids).toHaveLength(5000);
  });
});

describe('readImportHash / stripImportHash', () => {
  it('reads the payload only for #sv-import=', () => {
    expect(m.readImportHash('#sv-import=abc')).toBe('abc');
    expect(m.readImportHash('sv-import=abc')).toBe('abc');
    expect(m.readImportHash('#sv-import=')).toBe('');
    expect(m.readImportHash('#other=abc')).toBeNull();
    expect(m.readImportHash('')).toBeNull();
    expect(m.readImportHash(undefined)).toBeNull();
  });

  it('removes the hash and keeps path, query and history state', () => {
    history.replaceState({ yt: 1 }, '', '/feed/playlists?x=1#sv-import=abc');
    m.stripImportHash(window);
    expect(location.pathname + location.search + location.hash).toBe('/feed/playlists?x=1');
    expect(history.state).toEqual({ yt: 1 });
  });
});
