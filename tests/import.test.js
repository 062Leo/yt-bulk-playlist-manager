import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { loadUserscript, jsonResponse, SESSION, encodePayload, makeIds } from './load.js';

let m;
let fetchMock;

beforeEach(() => {
  document.body.innerHTML = '';
  m = loadUserscript();
  fetchMock = vi.fn(async () => jsonResponse({ status: 'STATUS_SUCCEEDED' }));
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete window.ytcfg;
});

const calls = () =>
  fetchMock.mock.calls.map(([url, o]) => ({
    path: new URL(url).pathname,
    body: JSON.parse(o.body),
  }));

describe('runImport', () => {
  it('new playlist: small create batch, rest in chunks of 50', async () => {
    vi.useFakeTimers();
    const ids = makeIds(75);
    fetchMock.mockResolvedValueOnce(jsonResponse({ playlistId: 'PLnew' }));
    const progress = [];
    const done = m.runImport(
      SESSION,
      ids,
      { mode: 'new', title: 'Mix', privacy: 'PRIVATE' },
      (d, t) => progress.push([d, t]),
    );
    await vi.runAllTimersAsync();
    expect(await done).toEqual({
      added: 75,
      skipped: 0,
      failed: 0,
      playlistId: 'PLnew',
      error: null,
    });

    const c = calls();
    expect(c[0].path).toBe('/youtubei/v1/playlist/create');
    expect(c[0].body.videoIds).toEqual(ids.slice(0, 10));
    expect(c.slice(1).map((x) => x.body.actions.length)).toEqual([50, 15]);
    expect(c[1].body.playlistId).toBe('PLnew');
    expect(progress.at(-1)).toEqual([75, 75]);
  });

  it('new playlist: falls back to an empty create when create-with-videos fails', async () => {
    vi.useFakeTimers();
    const ids = makeIds(12);
    fetchMock
      .mockResolvedValueOnce(jsonResponse({}, 400))
      .mockResolvedValueOnce(jsonResponse({ playlistId: 'PLnew' }));
    const done = m.runImport(SESSION, ids, { mode: 'new', title: 'Mix', privacy: 'PUBLIC' });
    await vi.runAllTimersAsync();
    expect(await done).toMatchObject({ added: 12, failed: 0, playlistId: 'PLnew' });
    const c = calls();
    expect(c[1].body.videoIds).toBeUndefined();
    expect(c[2].body.actions).toHaveLength(12);
  });

  it('new playlist: reports everything failed when create is impossible', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, 403));
    const r = await m.runImport(SESSION, makeIds(5), {
      mode: 'new',
      title: 'Mix',
      privacy: 'PRIVATE',
    });
    expect(r).toMatchObject({ added: 0, failed: 5, playlistId: null });
    expect(r.error).toContain('Session expired');
  });

  it('existing playlist: skips duplicates and counts failed chunks', async () => {
    vi.useFakeTimers();
    const ids = makeIds(103);
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ status: 'STATUS_SUCCEEDED' }))
      .mockResolvedValueOnce(jsonResponse({}, 500));
    const done = m.runImport(SESSION, ids, {
      mode: 'existing',
      playlistId: 'PLold',
      existingIds: [ids[0], ids[1], ids[2]],
    });
    await vi.runAllTimersAsync();
    expect(await done).toEqual({
      added: 50,
      skipped: 3,
      failed: 50,
      playlistId: 'PLold',
      error: null,
    });
    expect(calls()[0].body.actions[0].addedVideoId).toBe(ids[3]);
  });

  it('existing playlist: nothing to add when everything is a duplicate', async () => {
    const ids = makeIds(2);
    const r = await m.runImport(SESSION, ids, {
      mode: 'existing',
      playlistId: 'P',
      existingIds: ids,
    });
    expect(r).toMatchObject({ added: 0, skipped: 2, failed: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('formats the result line', () => {
    expect(m.formatImportResult({ added: 3, skipped: 2, failed: 1 })).toBe(
      'Added 3, skipped 2 (duplicates), failed 1',
    );
  });
});

function setYtcfg() {
  const cfg = { INNERTUBE_API_KEY: 'K', INNERTUBE_CONTEXT: { client: {} } };
  window.ytcfg = { get: (k) => cfg[k] };
}

const tick = () => vi.advanceTimersByTimeAsync(400);

describe('checkSongVoyageImport (end to end)', () => {
  it('does nothing without the hash', async () => {
    history.replaceState(null, '', '/feed/playlists');
    await m.checkSongVoyageImport();
    expect(document.getElementById('yt-bulk-import-dialog')).toBeNull();
  });

  it('strips the hash and shows "Update the userscript" for unknown versions', async () => {
    history.replaceState(null, '', '/feed/playlists#sv-import=' + encodePayload({ v: 9, ids: [] }));
    const done = m.checkSongVoyageImport();
    expect(location.hash).toBe('');
    const dialog = document.getElementById('yt-bulk-import-dialog');
    expect(dialog.textContent).toContain('Update the userscript');
    document.getElementById('yt-bulk-import-ok').click();
    await done;
    expect(document.getElementById('yt-bulk-import-dialog')).toBeNull();
  });

  it('creates a new playlist and shows the result with a link', async () => {
    vi.useFakeTimers();
    setYtcfg();
    const ids = makeIds(3);
    fetchMock.mockImplementation(async (url) => {
      if (url.includes('/browse?')) return jsonResponse({ contents: [] });
      if (url.includes('/playlist/create')) return jsonResponse({ playlistId: 'PLnew' });
      return jsonResponse({ status: 'STATUS_SUCCEEDED' });
    });
    history.replaceState(
      null,
      '',
      '/watch?v=x#sv-import=' + encodePayload({ v: 1, title: 'Voyage', ids: [...ids, 'bad'] }),
    );

    const done = m.checkSongVoyageImport();
    expect(location.hash).toBe('');
    await tick();

    const dialog = document.getElementById('yt-bulk-import-dialog');
    expect(dialog.textContent).toContain('Import 3 songs from SongVoyage');
    expect(dialog.textContent).toContain('1 invalid ID dropped');
    expect(document.getElementById('yt-bulk-import-name').value).toBe('Voyage');
    expect(document.getElementById('yt-bulk-import-privacy').value).toBe('PRIVATE');
    document.getElementById('yt-bulk-import-privacy').value = 'UNLISTED';
    document.getElementById('yt-bulk-import-confirm').click();

    await vi.runAllTimersAsync();
    expect(document.getElementById('yt-bulk-import-summary').textContent).toBe(
      'Added 3, skipped 0 (duplicates), failed 0',
    );
    expect(document.getElementById('yt-bulk-import-open').getAttribute('href')).toBe(
      'https://www.youtube.com/playlist?list=PLnew',
    );
    const create = calls().find((c) => c.path === '/youtubei/v1/playlist/create');
    expect(create.body).toMatchObject({
      title: 'Voyage',
      privacyStatus: 'UNLISTED',
      videoIds: ids,
    });
    document.getElementById('yt-bulk-import-close').click();
    await done;
  });

  it('adds to an existing playlist with the duplicate pre-check', async () => {
    vi.useFakeTimers();
    setYtcfg();
    const ids = makeIds(4);
    fetchMock.mockImplementation(async (url, opts) => {
      const body = JSON.parse(opts.body);
      if (body.browseId === 'FEplaylist_aggregation') {
        return jsonResponse({
          contents: [
            { gridPlaylistRenderer: { playlistId: 'PLold', title: { runs: [{ text: 'Old' }] } } },
          ],
        });
      }
      if (body.browseId === 'VLPLold') {
        return jsonResponse({
          contents: {
            playlistVideoListRenderer: {
              contents: [{ playlistVideoRenderer: { videoId: ids[1] } }],
            },
          },
        });
      }
      return jsonResponse({ status: 'STATUS_SUCCEEDED' });
    });
    history.replaceState(null, '', '/#sv-import=' + encodePayload({ v: 1, title: 't', ids }));

    const done = m.checkSongVoyageImport();
    await tick();
    document.querySelector('input[value="existing"]').click();
    const select = document.getElementById('yt-bulk-import-playlist');
    expect(select.disabled).toBe(false);
    select.value = 'PLold';
    select.dispatchEvent(new Event('change'));
    expect(document.getElementById('yt-bulk-import-confirm').disabled).toBe(true);
    await tick();
    expect(document.getElementById('yt-bulk-import-dupes').textContent).toBe(
      '1 already in playlist, will be skipped.',
    );
    document.getElementById('yt-bulk-import-confirm').click();
    await vi.runAllTimersAsync();

    expect(document.getElementById('yt-bulk-import-summary').textContent).toBe(
      'Added 3, skipped 1 (duplicates), failed 0',
    );
    const edit = calls().find((c) => c.path === '/youtubei/v1/browse/edit_playlist');
    expect(edit.body.actions.map((a) => a.addedVideoId)).toEqual([ids[0], ids[2], ids[3]]);
    document.getElementById('yt-bulk-import-close').click();
    await done;
  });

  it('cancel does not send any write request', async () => {
    vi.useFakeTimers();
    setYtcfg();
    fetchMock.mockImplementation(async () => jsonResponse({ contents: [] }));
    history.replaceState(null, '', '/#sv-import=' + encodePayload({ v: 1, ids: makeIds(1) }));
    const done = m.checkSongVoyageImport();
    await tick();
    document.getElementById('yt-bulk-import-cancel').click();
    await done;
    expect(calls().every((c) => c.path === '/youtubei/v1/browse')).toBe(true);
    expect(document.getElementById('yt-bulk-import-dialog')).toBeNull();
  });
});
