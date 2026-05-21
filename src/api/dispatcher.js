// dispatcher.js – Batch-dispatches add/remove actions to YouTube's edit_playlist endpoint

function sleep(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

function chunkArray(arr, size) {
  var chunks = [];
  for (var i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

function fetchWithRetry(url, options, maxRetries) {
  if (maxRetries === undefined) {
    maxRetries = 3;
  }

  return new Promise(function (resolve, reject) {
    var attempt = 0;

    function doFetch() {
      attempt++;

      fetch(url, options).then(function (res) {
        if (res.ok) {
          return resolve(res);
        }

        if (res.status === 429 && attempt <= maxRetries) {
          var delay = Math.pow(2, attempt - 1) * 1000;
          Logger.warn(
            'Rate limited (HTTP 429) – retrying in ' + delay + 'ms (attempt ' + attempt + '/' + maxRetries + ')'
          );
          return sleep(delay).then(doFetch);
        }

        if (res.status === 401 || res.status === 403) {
          return reject(new ApiError('Session expired – refresh the YouTube page', res.status, url));
        }

        reject(ApiError.fromResponse(res));
      }).catch(function (err) {
        reject(err);
      });
    }

    doFetch();
  });
}

async function dispatchBatch(session, playlistId, videoIds) {
  return dispatchActions(session, playlistId, videoIds, 'add');
}

async function dispatchRemove(session, playlistId, entries) {
  // entries: [{videoId: "...", setVideoId: "..."}]
  // Sends ACTION_REMOVE_VIDEO with the playlist-specific setVideoId
  if (!Array.isArray(entries) || entries.length === 0) {
    Logger.error('dispatchRemove: entries must be a non-empty array');
    throw new Error('entries must be a non-empty array');
  }

  // Logger.info(
  //   'Dispatching remove for ' + entries.length + ' ' + pluralize(entries.length, 'video') + ' from playlist ' + playlistId
  // );

  for (var i = 0; i < entries.length; i++) {
    var entry = entries[i];

    if (!entry.setVideoId) {
      Logger.warn('Skipping video', entry.videoId, '— no setVideoId available for this playlist');
      continue;
    }

    var payload = {
      context: session.context,
      playlistId: playlistId,
      actions: [
        { action: 'ACTION_REMOVE_VIDEO', removedVideoId: entry.videoId, setVideoId: entry.setVideoId }
      ]
    };

    var endpoint = CONFIG.EDIT_PLAYLIST_ENDPOINT + '?key=' + session.apiKey;

    var headers = { 'Content-Type': 'application/json' };
    if (session.authHeaders) {
      Object.assign(headers, session.authHeaders);
    }

    try {
      await fetchWithRetry(
        endpoint,
        {
          method: 'POST',
          credentials: 'include',
          headers: headers,
          body: JSON.stringify(payload)
        }
      );
    } catch (err) {
      Logger.error(
        'Video ' + (i + 1) + ' failed' +
        (err.status ? ' (HTTP ' + err.status + ')' : '') +
        ': ' + err.message
      );
      throw err;
    }

    // Logger.success('Video ' + (i + 1) + '/' + entries.length + ' removed');

    if (i < entries.length - 1) {
      await sleep(CONFIG.CHUNK_DELAY_MS);
    }
  }

  // Logger.success('All ' + entries.length + ' ' + pluralize(entries.length, 'video') + ' removed from playlist ' + playlistId);

  return { count: entries.length };
}

async function dispatchActions(session, playlistId, videoIds, actionType) {
  if (!playlistId || typeof playlistId !== 'string' || playlistId.trim() === '') {
    Logger.error('dispatchActions: playlistId must be a non-empty string');
    throw new Error('playlistId must be a non-empty string');
  }

  if (!Array.isArray(videoIds) || videoIds.length === 0) {
    Logger.error('dispatchActions: videoIds must be a non-empty array');
    throw new Error('videoIds must be a non-empty array');
  }

  var chunks = chunkArray(videoIds, CONFIG.BATCH_CHUNK_SIZE);

  // Logger.info(
  //   'Dispatching ' + videoIds.length + ' videos to add to playlist ' + playlistId + ' in ' + chunks.length + ' chunk(s)'
  // );

  for (var i = 0; i < chunks.length; i++) {
    var actions = chunks[i].map(function (id) {
      return { action: 'ACTION_ADD_VIDEO', addedVideoId: id };
    });

    var payload = {
      context: session.context,
      playlistId: playlistId,
      actions: actions
    };

    var endpoint = CONFIG.EDIT_PLAYLIST_ENDPOINT + '?key=' + session.apiKey;

    var headers = { 'Content-Type': 'application/json' };
    if (session.authHeaders) {
      Object.assign(headers, session.authHeaders);
    }

    try {
      await fetchWithRetry(
        endpoint,
        {
          method: 'POST',
          credentials: 'include',
          headers: headers,
          body: JSON.stringify(payload)
        }
      );
    } catch (err) {
      Logger.error(
        'Chunk ' + (i + 1) + ' failed' +
        (err.status ? ' (HTTP ' + err.status + ')' : '') +
        ': ' + err.message
      );
      throw err;
    }

    // Logger.success('Chunk ' + (i + 1) + '/' + chunks.length + ' dispatched successfully');

    if (i < chunks.length - 1) {
      await sleep(CONFIG.CHUNK_DELAY_MS);
    }
  }

  // Logger.success('All ' + videoIds.length + ' ' + pluralize(videoIds.length, 'video') + ' added to playlist ' + playlistId);

  return { count: videoIds.length };
}
