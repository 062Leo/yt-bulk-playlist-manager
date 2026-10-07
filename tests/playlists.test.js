import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { loadUserscript, jsonResponse, SESSION } from './load.js';

let m;
let fetchMock;

const pvr = (videoId, setVideoId) => ({ playlistVideoRenderer: { videoId, setVideoId } });
const cont = (token) => ({
  continuationItemRenderer: { continuationEndpoint: { continuationCommand: { token } } },
});
const firstPage = (items) => ({
  contents: { a: { b: [{ playlistVideoListRenderer: { contents: items } }] } },
});
const nextPage = (items) => ({
  onResponseReceivedActions: [{ appendContinuationItemsAction: { continuationItems: items } }],
});

beforeEach(() => {
  m = loadUserscript();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => vi.unstubAllGlobals());

describe('fetchPlaylistVideoIds (duplicate detection)', () => {
  it('finds target ids across continuation pages', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(firstPage([pvr('aaaaaaaaaaa'), pvr('xxxxxxxxxxx'), cont('T1')])),
      )
      .mockResolvedValueOnce(jsonResponse(nextPage([pvr('bbbbbbbbbbb')])));
    const found = await m.fetchPlaylistVideoIds(SESSION, 'PL1', [
      'aaaaaaaaaaa',
      'bbbbbbbbbbb',
      'ccccccccccc',
    ]);
    expect(found).toEqual(['aaaaaaaaaaa', 'bbbbbbbbbbb']);
    const bodies = fetchMock.mock.calls.map((c) => JSON.parse(c[1].body));
    expect(bodies[0]).toMatchObject({ browseId: 'VLPL1' });
    expect(bodies[1]).toMatchObject({ continuation: 'T1' });
  });

  it('stops early once every target is found', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(firstPage([pvr('aaaaaaaaaaa'), cont('T1')])));
    expect(await m.fetchPlaylistVideoIds(SESSION, 'PL1', ['aaaaaaaaaaa'])).toEqual(['aaaaaaaaaaa']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('counts a video listed twice in the playlist only once (keeps scanning)', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(firstPage([pvr('aaaaaaaaaaa'), pvr('aaaaaaaaaaa'), cont('T1')])),
      )
      .mockResolvedValueOnce(jsonResponse(nextPage([pvr('bbbbbbbbbbb')])));
    expect(await m.fetchPlaylistVideoIds(SESSION, 'PL1', ['aaaaaaaaaaa', 'bbbbbbbbbbb'])).toEqual([
      'aaaaaaaaaaa',
      'bbbbbbbbbbb',
    ]);
  });

  it('does not treat Object.prototype names as found', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(firstPage([pvr('constructor')])));
    expect(await m.fetchPlaylistVideoIds(SESSION, 'PL1', ['aaaaaaaaaaa'])).toEqual([]);
  });

  it('scans more than 10 pages (large playlists)', async () => {
    for (let i = 0; i < 15; i++) {
      const items = [pvr('zzzzzzzzzzz'), cont('T' + i)];
      fetchMock.mockResolvedValueOnce(jsonResponse(i === 0 ? firstPage(items) : nextPage(items)));
    }
    fetchMock.mockResolvedValueOnce(jsonResponse(nextPage([pvr('aaaaaaaaaaa')])));
    expect(await m.fetchPlaylistVideoIds(SESSION, 'PL1', ['aaaaaaaaaaa'])).toEqual(['aaaaaaaaaaa']);
    expect(fetchMock).toHaveBeenCalledTimes(16);
  });

  it('returns what it has on HTTP errors', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 500));
    expect(await m.fetchPlaylistVideoIds(SESSION, 'PL1', ['aaaaaaaaaaa'])).toEqual([]);
  });
});

describe('fetchPlaylistSetVideoIds', () => {
  it('maps video ids to setVideoIds', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(firstPage([pvr('aaaaaaaaaaa', 'S1'), pvr('bbbbbbbbbbb', 'S2')])),
    );
    const map = await m.fetchPlaylistSetVideoIds(SESSION, 'PL1', ['bbbbbbbbbbb']);
    expect({ ...map }).toEqual({ bbbbbbbbbbb: 'S2' });
  });
});

describe('fetchUserPlaylists', () => {
  it('parses lockupViewModel and gridPlaylistRenderer items', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        contents: {
          twoColumnBrowseResultsRenderer: {
            tabs: [
              {
                tabRenderer: {
                  content: {
                    richGridRenderer: {
                      contents: [
                        {
                          richItemRenderer: {
                            content: {
                              lockupViewModel: {
                                contentId: 'PL1',
                                metadata: {
                                  lockupMetadataViewModel: { title: { content: 'One' } },
                                },
                              },
                            },
                          },
                        },
                        {
                          gridPlaylistRenderer: {
                            playlistId: 'PL2',
                            title: { runs: [{ text: 'Two' }] },
                          },
                        },
                      ],
                    },
                  },
                },
              },
            ],
          },
        },
      }),
    );
    expect(await m.fetchUserPlaylists(SESSION)).toEqual([
      { playlistId: 'PL1', title: 'One' },
      { playlistId: 'PL2', title: 'Two' },
    ]);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).browseId).toBe('FEplaylist_aggregation');
  });

  const grid = (items) => ({
    contents: {
      twoColumnBrowseResultsRenderer: {
        tabs: [{ tabRenderer: { content: { richGridRenderer: { contents: items } } } }],
      },
    },
  });
  const gpr = (playlistId, text) => ({
    gridPlaylistRenderer: { playlistId, title: { runs: [{ text }] } },
  });

  it('follows continuation tokens until no token is left', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(grid([gpr('PL1', 'One'), cont('T1')])))
      .mockResolvedValueOnce(jsonResponse(nextPage([gpr('PL2', 'Two'), cont('T2')])))
      .mockResolvedValueOnce(jsonResponse(nextPage([gpr('PL3', 'Three'), gpr('PL1', 'One')])));
    expect(await m.fetchUserPlaylists(SESSION)).toEqual([
      { playlistId: 'PL1', title: 'One' },
      { playlistId: 'PL2', title: 'Two' },
      { playlistId: 'PL3', title: 'Three' },
    ]);
    const bodies = fetchMock.mock.calls.map((c) => JSON.parse(c[1].body));
    expect(bodies.map((b) => b.continuation)).toEqual([undefined, 'T1', 'T2']);
  });

  it('stops at maxPages', async () => {
    fetchMock.mockImplementation(async () => jsonResponse(nextPage([cont('again')])));
    fetchMock.mockResolvedValueOnce(jsonResponse(grid([gpr('PL1', 'One'), cont('T1')])));
    expect(await m.fetchUserPlaylists(SESSION, 3)).toEqual([{ playlistId: 'PL1', title: 'One' }]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('keeps earlier pages when a continuation page fails', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(grid([gpr('PL1', 'One'), cont('T1')])))
      .mockResolvedValueOnce(jsonResponse({}, 500));
    expect(await m.fetchUserPlaylists(SESSION)).toEqual([{ playlistId: 'PL1', title: 'One' }]);
  });

  it('throws ParseError on unknown shapes', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ contents: {} }));
    await expect(m.fetchUserPlaylists(SESSION)).rejects.toMatchObject({ name: 'ParseError' });
  });
});
