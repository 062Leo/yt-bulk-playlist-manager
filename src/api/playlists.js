// playlists.js – Fetches the user's playlist list from YouTube's internal browse endpoint

async function fetchUserPlaylists(session) {
  const endpoint = CONFIG.BROWSE_ENDPOINT + '?key=' + session.apiKey;
  const browseId = 'FEmy_videos';

  Logger.info('Fetching user playlists...');
  Logger.debug('Endpoint:', endpoint, '| browseId:', browseId);

  const res = await fetch(endpoint, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      context: session.context,
      browseId: browseId
    })
  });

  if (!res.ok) {
    throw ApiError.fromResponse(res);
  }

  const data = await res.json();

  Logger.debug('Raw playlist response:', data);

  let tabs, contents;
  try {
    tabs = data.contents.singleColumnBrowseResultsRenderer.tabs;
    contents = tabs[0].tabRenderer.content.sectionListRenderer.contents;
  } catch (e) {
    const topLevelKeys = Object.keys(data);
    throw new ParseError(
      'Failed to navigate playlist response tree: ' + e.message +
      '. Top-level response keys: ' + JSON.stringify(topLevelKeys)
    );
  }

  const playlists = [];

  for (let i = 0; i < contents.length; i++) {
    const item = contents[i];
    const renderer = item.gridPlaylistRenderer || item.playlistRenderer;

    if (renderer && renderer.playlistId && renderer.title && renderer.title.runs && renderer.title.runs.length > 0) {
      playlists.push({
        playlistId: renderer.playlistId,
        title: renderer.title.runs[0].text
      });
    }
  }

  Logger.success('Fetched', playlists.length, 'playlist(s)');
  return playlists;
}
