import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { loadUserscript, jsonResponse, SESSION, makeIds } from './load.js';

let m;
let fetchMock;

beforeEach(() => {
  m = loadUserscript();
  fetchMock = vi.fn(async () => jsonResponse({ status: 'STATUS_SUCCEEDED' }));
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const bodies = () => fetchMock.mock.calls.map((c) => JSON.parse(c[1].body));

describe('chunkArray', () => {
  it('splits into chunks of size n', () => {
    expect(m.chunkArray([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(m.chunkArray([], 50)).toEqual([]);
  });
});

describe('dispatchBatch', () => {
  it('sends sequential chunks of 50 with ≥500 ms between them', async () => {
    vi.useFakeTimers();
    const ids = makeIds(120);
    const done = m.dispatchBatch(SESSION, 'PL1', ids);

    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(499);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(500);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const res = await done;
    expect(res).toEqual({ count: 120, addedIds: ids, failedIds: [] });
    const b = bodies();
    expect(b.map((x) => x.actions.length)).toEqual([50, 50, 20]);
    expect(b[0]).toEqual({
      context: SESSION.context,
      playlistId: 'PL1',
      actions: ids.slice(0, 50).map((id) => ({ action: 'ACTION_ADD_VIDEO', addedVideoId: id })),
    });
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('https://www.youtube.com/youtubei/v1/browse/edit_playlist?key=KEY');
    expect(opts).toMatchObject({ method: 'POST', credentials: 'include' });
    expect(opts.headers['Content-Type']).toBe('application/json');
    expect(opts.headers.Authorization).toBe(SESSION.authHeaders.Authorization);
  });

  it('waits before the first chunk with delayFirst', async () => {
    vi.useFakeTimers();
    const done = m.dispatchBatch(SESSION, 'PL1', makeIds(2), { delayFirst: true });
    await vi.advanceTimersByTimeAsync(499);
    expect(fetchMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await done;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reports progress per chunk', async () => {
    vi.useFakeTimers();
    const progress = [];
    const done = m.dispatchBatch(SESSION, 'PL1', makeIds(101), {
      onProgress: (d, t) => progress.push([d, t]),
    });
    await vi.runAllTimersAsync();
    await done;
    expect(progress).toEqual([
      [50, 101],
      [100, 101],
      [101, 101],
    ]);
  });

  it('throws on the first failing chunk by default', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 500));
    await expect(m.dispatchBatch(SESSION, 'PL1', makeIds(3))).rejects.toMatchObject({
      name: 'ApiError',
      status: 500,
    });
  });

  it('continueOnError records failed chunks and keeps going', async () => {
    vi.useFakeTimers();
    const ids = makeIds(150);
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ status: 'STATUS_SUCCEEDED' }))
      .mockResolvedValueOnce(jsonResponse({ status: 'STATUS_FAILED' }))
      .mockResolvedValueOnce(jsonResponse({}));
    const done = m.dispatchBatch(SESSION, 'PL1', ids, { continueOnError: true });
    await vi.runAllTimersAsync();
    const res = await done;
    expect(res.count).toBe(100);
    expect(res.failedIds).toEqual(ids.slice(50, 100));
  });

  it('aborts on auth errors even with continueOnError', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 401));
    await expect(
      m.dispatchBatch(SESSION, 'PL1', makeIds(80), { continueOnError: true }),
    ).rejects.toMatchObject({ status: 401, message: expect.stringContaining('Session expired') });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries HTTP 429 with exponential backoff', async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({}, 429))
      .mockResolvedValueOnce(jsonResponse({}, 429))
      .mockResolvedValueOnce(jsonResponse({ status: 'STATUS_SUCCEEDED' }));
    const done = m.dispatchBatch(SESSION, 'PL1', makeIds(1));
    await vi.advanceTimersByTimeAsync(999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(2000);
    await expect(done).resolves.toMatchObject({ count: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('gives up after 3 retries on 429', async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValue(jsonResponse({}, 429));
    const done = m.dispatchBatch(SESSION, 'PL1', makeIds(1));
    const assertion = expect(done).rejects.toMatchObject({ status: 429 });
    await vi.runAllTimersAsync();
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('propagates network errors', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(m.dispatchBatch(SESSION, 'PL1', makeIds(1))).rejects.toThrow('Failed to fetch');
  });

  it('validates arguments', async () => {
    await expect(m.dispatchBatch(SESSION, '', ['a'])).rejects.toThrow('playlistId');
    await expect(m.dispatchBatch(SESSION, 'PL', [])).rejects.toThrow('videoIds');
  });
});

describe('dispatchRemove', () => {
  it('removes one video per request and reports skipped ones', async () => {
    vi.useFakeTimers();
    const done = m.dispatchRemove(SESSION, 'PL1', [
      { videoId: 'aaaaaaaaaaa', setVideoId: 'S1' },
      { videoId: 'bbbbbbbbbbb', setVideoId: null },
      { videoId: 'ccccccccccc', setVideoId: 'S3' },
    ]);
    await vi.runAllTimersAsync();
    const res = await done;
    expect(res).toEqual({
      count: 2,
      removedIds: ['aaaaaaaaaaa', 'ccccccccccc'],
      skippedIds: ['bbbbbbbbbbb'],
    });
    expect(bodies().map((b) => b.actions)).toEqual([
      [{ action: 'ACTION_REMOVE_VIDEO', removedVideoId: 'aaaaaaaaaaa', setVideoId: 'S1' }],
      [{ action: 'ACTION_REMOVE_VIDEO', removedVideoId: 'ccccccccccc', setVideoId: 'S3' }],
    ]);
  });

  it('attaches already removed ids to the error', async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ status: 'STATUS_SUCCEEDED' }))
      .mockResolvedValueOnce(jsonResponse({}, 500));
    const done = m.dispatchRemove(SESSION, 'PL1', [
      { videoId: 'aaaaaaaaaaa', setVideoId: 'S1' },
      { videoId: 'bbbbbbbbbbb', setVideoId: 'S2' },
    ]);
    const assertion = expect(done).rejects.toMatchObject({ removedIds: ['aaaaaaaaaaa'] });
    await vi.runAllTimersAsync();
    await assertion;
  });
});

describe('createPlaylist', () => {
  it('posts title, privacyStatus and videoIds to playlist/create', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ playlistId: 'PLnew' }));
    const id = await m.createPlaylist(SESSION, '  My mix ', 'UNLISTED', ['aaaaaaaaaaa']);
    expect(id).toBe('PLnew');
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('https://www.youtube.com/youtubei/v1/playlist/create?key=KEY');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toEqual({
      context: SESSION.context,
      title: 'My mix',
      privacyStatus: 'UNLISTED',
      videoIds: ['aaaaaaaaaaa'],
    });
  });

  it('defaults to PRIVATE and omits empty videoIds', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ playlistId: 'PLnew' }));
    await m.createPlaylist(SESSION, 't', 'bogus', []);
    expect(bodies()[0]).toEqual({ context: SESSION.context, title: 't', privacyStatus: 'PRIVATE' });
  });

  it('fails without playlistId in the response or with an empty title', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}));
    await expect(m.createPlaylist(SESSION, 't', 'PRIVATE', [])).rejects.toMatchObject({
      name: 'ParseError',
    });
    await expect(m.createPlaylist(SESSION, '  ', 'PRIVATE', [])).rejects.toThrow('title');
  });
});
