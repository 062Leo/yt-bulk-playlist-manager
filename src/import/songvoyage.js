// songvoyage.js – SongVoyage import flow: hash → dialog → create/add → result.
// Runs on every youtube.com page (independent of the playlist-page toolbar).

var _importRunning = false;

/**
 * Imports ids into the chosen target. Never throws for request failures; they are
 * reported in the result. choice comes from showImportDialog().
 * onProgress(done, total) reports videos processed.
 * Returns {added, skipped, failed, playlistId, error}.
 */
async function runImport(session, ids, choice, onProgress) {
  var report = typeof onProgress === 'function' ? onProgress : function () {};
  var result = { added: 0, skipped: 0, failed: 0, playlistId: null, error: null };
  var toAdd = ids;

  if (choice.mode === 'existing') {
    var existing = Object.create(null);
    (choice.existingIds || []).forEach(function (id) {
      existing[id] = true;
    });
    toAdd = ids.filter(function (id) {
      return !existing[id];
    });
    result.skipped = ids.length - toAdd.length;
    result.playlistId = choice.playlistId;
  }

  var total = toAdd.length;
  var rest = toAdd;

  try {
    if (choice.mode === 'new') {
      var first = toAdd.slice(0, CONFIG.IMPORT_CREATE_BATCH_SIZE);
      try {
        result.playlistId = await createPlaylist(session, choice.title, choice.privacy, first);
        result.added = first.length;
        rest = toAdd.slice(first.length);
      } catch (err) {
        if (isFatalApiError(err) || first.length === 0) throw err;
        // One unavailable video can make the whole create call fail:
        // create an empty playlist instead and add everything in chunks.
        Logger.warn('playlist/create with videos failed, retrying empty:', err.message);
        await sleep(CONFIG.CHUNK_DELAY_MS);
        result.playlistId = await createPlaylist(session, choice.title, choice.privacy, []);
      }
      report(result.added, total);
    }

    if (rest.length > 0) {
      var base = result.added;
      var batch = await dispatchBatch(session, result.playlistId, rest, {
        continueOnError: true,
        delayFirst: choice.mode === 'new',
        onProgress: function (done) {
          report(base + done, total);
        },
      });
      result.added += batch.count;
      result.failed += batch.failedIds.length;
    }
  } catch (err) {
    Logger.error('Import aborted:', err);
    result.error = err.message || String(err);
    result.failed = total - result.added;
  }

  return result;
}

function _importErrorTitle(parsed) {
  return parsed.code === 'version' ? 'Update the userscript' : 'SongVoyage import failed';
}

/**
 * Checks location.hash for a SongVoyage payload and runs the import.
 * Safe to call repeatedly (initial load, yt-navigate-finish, hashchange).
 */
async function checkSongVoyageImport() {
  var raw = readImportHash(window.location.hash);
  if (raw === null) return;

  // Remove first, so a reload or a second event does not import again.
  stripImportHash(window);

  if (_importRunning) {
    Logger.warn('SongVoyage import already running – ignoring second link');
    return;
  }
  _importRunning = true;

  try {
    var parsed = parseImportPayload(raw);
    if (!parsed.ok) {
      Logger.error('SongVoyage payload rejected:', parsed.code);
      await showImportMessage(_importErrorTitle(parsed), parsed.error);
      return;
    }

    var notes = [];
    if (parsed.invalidCount > 0)
      notes.push(
        parsed.invalidCount + ' invalid ' + pluralize(parsed.invalidCount, 'ID') + ' dropped',
      );
    if (parsed.duplicateCount > 0)
      notes.push(
        parsed.duplicateCount + ' duplicate ' + pluralize(parsed.duplicateCount, 'ID') + ' removed',
      );

    var session;
    try {
      session = await getSession();
    } catch (err) {
      await showImportMessage(
        'SongVoyage import failed',
        'YouTube session not found. Make sure you are logged in, then open the import link again.',
      );
      return;
    }

    var choice = await showImportDialog({
      count: parsed.ids.length,
      title: parsed.title,
      note: notes.join(' · '),
      loadPlaylists: function () {
        return fetchUserPlaylists(session);
      },
      findExisting: function (playlistId) {
        return fetchPlaylistVideoIds(session, playlistId, parsed.ids);
      },
    });
    if (!choice) return;

    showProgressDialog();
    updateProgress(
      'Importing ' + parsed.ids.length + ' ' + pluralize(parsed.ids.length, 'song') + '…',
      2,
    );
    var result;
    try {
      result = await runImport(session, parsed.ids, choice, function (done, total) {
        updateProgress('Added ' + done + ' / ' + total + '…', total ? (done / total) * 100 : 100);
      });
    } finally {
      hideProgressDialog();
    }

    Logger.info('SongVoyage import:', formatImportResult(result));
    await showImportResult(result);
  } catch (err) {
    Logger.error('SongVoyage import crashed:', err);
  } finally {
    _importRunning = false;
  }
}
