// dispatcher.js – Batch-dispatches add/remove actions to YouTube's edit_playlist endpoint
// and creates playlists via playlist/create. All requests are sequential.

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

      fetch(url, options)
        .then(function (res) {
          if (res.ok) {
            return resolve(res);
          }

          if (res.status === 429 && attempt <= maxRetries) {
            var delay = Math.pow(2, attempt - 1) * 1000;
            Logger.warn(
              'Rate limited (HTTP 429) – retrying in ' +
                delay +
                'ms (attempt ' +
                attempt +
                '/' +
                maxRetries +
                ')',
            );
            return sleep(delay).then(doFetch);
          }

          if (res.status === 401 || res.status === 403) {
            return reject(
              new ApiError('Session expired – refresh the YouTube page', res.status, url),
            );
          }

          reject(ApiError.fromResponse(res));
        })
        .catch(function (err) {
          reject(err);
        });
    }

    doFetch();
  });
}

/** True for errors that will fail every following request too (no point continuing). */
function isFatalApiError(err) {
  return !!err && (err.status === 401 || err.status === 403);
}

/**
 * POSTs a youtubei request with fresh auth headers and returns the parsed JSON
 * (or {} when the body is not JSON). edit_playlist answers HTTP 200 with
 * status "STATUS_FAILED" on logical failures; that is turned into an ApiError.
 */
async function postYoutubei(session, endpoint, payload) {
  var headers = await getRequestHeaders(session);
  var res = await fetchWithRetry(endpoint + '?key=' + session.apiKey, {
    method: 'POST',
    credentials: 'include',
    headers: headers,
    body: JSON.stringify(payload),
  });

  var data;
  try {
    data = (await res.json()) || {};
  } catch (e) {
    data = {};
  }

  if (typeof data.status === 'string' && data.status !== 'STATUS_SUCCEEDED') {
    throw new ApiError('YouTube rejected the request (' + data.status + ')', res.status, endpoint);
  }
  return data;
}

async function dispatchBatch(session, playlistId, videoIds, options) {
  return dispatchActions(session, playlistId, videoIds, 'add', options);
}

async function dispatchRemove(session, playlistId, entries) {
  // entries: [{videoId: "...", setVideoId: "..."}]
  // Sends one ACTION_REMOVE_VIDEO per request with the playlist-specific setVideoId.
  if (!Array.isArray(entries) || entries.length === 0) {
    Logger.error('dispatchRemove: entries must be a non-empty array');
    throw new Error('entries must be a non-empty array');
  }

  var removedIds = [];
  var skippedIds = [];

  for (var i = 0; i < entries.length; i++) {
    var entry = entries[i];

    if (!entry.setVideoId) {
      Logger.warn('Skipping video', entry.videoId, '— no setVideoId available for this playlist');
      skippedIds.push(entry.videoId);
      continue;
    }

    if (removedIds.length > 0) {
      await sleep(CONFIG.CHUNK_DELAY_MS);
    }

    try {
      await postYoutubei(session, CONFIG.EDIT_PLAYLIST_ENDPOINT, {
        context: session.context,
        playlistId: playlistId,
        actions: [
          {
            action: 'ACTION_REMOVE_VIDEO',
            removedVideoId: entry.videoId,
            setVideoId: entry.setVideoId,
          },
        ],
      });
    } catch (err) {
      Logger.error(
        'Video ' +
          (i + 1) +
          ' failed' +
          (err.status ? ' (HTTP ' + err.status + ')' : '') +
          ': ' +
          err.message,
      );
      err.removedIds = removedIds;
      throw err;
    }

    removedIds.push(entry.videoId);
  }

  return { count: removedIds.length, removedIds: removedIds, skippedIds: skippedIds };
}

/**
 * Adds videoIds to a playlist in chunks of CONFIG.BATCH_CHUNK_SIZE, sequentially,
 * with CONFIG.CHUNK_DELAY_MS between requests.
 *
 * options.continueOnError – record failed chunks and keep going (auth errors still throw)
 * options.onProgress(done, total) – called after every chunk
 * options.delayFirst – also wait before the first chunk (when a request just preceded it)
 *
 * Returns {count, addedIds, failedIds}.
 */
async function dispatchActions(session, playlistId, videoIds, actionType, options) {
  options = options || {};

  if (!playlistId || typeof playlistId !== 'string' || playlistId.trim() === '') {
    Logger.error('dispatchActions: playlistId must be a non-empty string');
    throw new Error('playlistId must be a non-empty string');
  }

  if (!Array.isArray(videoIds) || videoIds.length === 0) {
    Logger.error('dispatchActions: videoIds must be a non-empty array');
    throw new Error('videoIds must be a non-empty array');
  }

  if (actionType !== 'add') {
    throw new Error('Unsupported actionType: ' + actionType);
  }

  var chunks = chunkArray(videoIds, CONFIG.BATCH_CHUNK_SIZE);
  var addedIds = [];
  var failedIds = [];
  var done = 0;

  for (var i = 0; i < chunks.length; i++) {
    if (i > 0 || options.delayFirst) {
      await sleep(CONFIG.CHUNK_DELAY_MS);
    }

    var actions = chunks[i].map(function (id) {
      return { action: 'ACTION_ADD_VIDEO', addedVideoId: id };
    });

    try {
      await postYoutubei(session, CONFIG.EDIT_PLAYLIST_ENDPOINT, {
        context: session.context,
        playlistId: playlistId,
        actions: actions,
      });
      addedIds = addedIds.concat(chunks[i]);
    } catch (err) {
      Logger.error(
        'Chunk ' +
          (i + 1) +
          ' failed' +
          (err.status ? ' (HTTP ' + err.status + ')' : '') +
          ': ' +
          err.message,
      );
      if (!options.continueOnError || isFatalApiError(err)) {
        throw err;
      }
      failedIds = failedIds.concat(chunks[i]);
    }

    done += chunks[i].length;
    if (typeof options.onProgress === 'function') {
      options.onProgress(done, videoIds.length);
    }
  }

  return { count: addedIds.length, addedIds: addedIds, failedIds: failedIds };
}

/**
 * Creates a playlist via POST /youtubei/v1/playlist/create.
 * privacy: 'PRIVATE' | 'UNLISTED' | 'PUBLIC'. videoIds may be empty.
 * Returns the new playlistId.
 */
async function createPlaylist(session, title, privacy, videoIds) {
  var allowed = ['PRIVATE', 'UNLISTED', 'PUBLIC'];
  var privacyStatus = allowed.indexOf(privacy) !== -1 ? privacy : 'PRIVATE';
  var cleanTitle = String(title || '').trim();
  if (!cleanTitle) {
    throw new Error('Playlist title must not be empty');
  }

  var payload = {
    context: session.context,
    title: cleanTitle,
    privacyStatus: privacyStatus,
  };
  if (Array.isArray(videoIds) && videoIds.length > 0) {
    payload.videoIds = videoIds.slice();
  }

  var data = await postYoutubei(session, CONFIG.PLAYLIST_CREATE_ENDPOINT, payload);
  if (!data.playlistId) {
    throw new ParseError('playlist/create response has no playlistId');
  }
  return data.playlistId;
}
