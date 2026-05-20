// main.js – Application entry point; wires all modules together and handles SPA re-initialisation

var _initialising = false;
var _buttonListenersWired = false;
var _session = null;

async function init() {
  if (_initialising) {
    Logger.debug('init() already in progress, skipping');
    return;
  }

  _initialising = true;

  try {
    Logger.info('YT Bulk Playlist Manager initialising...');

    // Acquire session
    try {
      _session = await getSession();
    } catch (err) {
      Logger.error('Session acquisition failed:', err);

      var notification = document.createElement('div');
      notification.id = 'yt-bulk-session-error';
      notification.style.cssText = [
        'position:fixed',
        'top:0',
        'left:0',
        'right:0',
        'background:#cc0000',
        'color:#ffffff',
        'padding:12px 20px',
        'z-index:99999',
        'font-family:sans-serif',
        'font-size:14px',
        'text-align:center',
        'box-shadow:0 2px 8px rgba(0,0,0,0.3)'
      ].join(';');
      notification.textContent = 'YT Bulk Playlist Manager: Could not initialise \u2013 YouTube session data (ytcfg) not found. Please refresh the page.';
      document.body.appendChild(notification);

      return;
    }

    // Create floating overlay
    createOverlay();

    // Start MutationObserver to inject checkboxes
    startObserver();

    // Fetch user playlists and populate the dropdown
    try {
      var playlists = await fetchUserPlaylists(_session);
      populatePlaylistDropdown(playlists);
    } catch (err) {
      Logger.error('Failed to fetch playlists:', err);
      setOverlayError('Failed to load playlists');
    }

    // Wire buttons (only once)
    if (!_buttonListenersWired) {
      _buttonListenersWired = true;
      wireButtons();
    }

    Logger.success('YT Bulk Playlist Manager ready');
  } catch (err) {
    Logger.error('Unhandled error during init:', err);
  } finally {
    _initialising = false;
  }
}

function wireButtons() {
  // Copy button
  var copyBtn = document.getElementById('yt-bulk-copy-btn');
  if (copyBtn) {
    copyBtn.addEventListener('click', async function () {
      var playlistId = getSelectedPlaylistId();
      var videoIds = selectionState.getAll();

      if (!videoIds.length || !playlistId) {
        setOverlayError('Select at least 1 video and 1 playlist');
        return;
      }

      setOverlayLoading(true);

      try {
        // Check for duplicates in target playlist
        var existingIds = await fetchPlaylistVideoIds(_session, playlistId, videoIds);
        var newIds = videoIds.filter(function (id) {
          return existingIds.indexOf(id) === -1;
        });

        if (newIds.length === 0) {
          setOverlayWarning('All ' + videoIds.length + ' video(s) already in target playlist');
          selectionState.clear();
          uncheckAll();
          return;
        }

        if (existingIds.length > 0) {
          setOverlayWarning(existingIds.length + ' video(s) already in playlist, adding ' + newIds.length + ' new');
        }

        var result = await dispatchBatch(_session, playlistId, newIds);
        setOverlaySuccess('Copied ' + result.count + ' video(s)!');
        selectionState.clear();
        uncheckAll();
      } catch (err) {
        setOverlayError(err.message || 'Copy failed');
      } finally {
        setOverlayLoading(false);
      }
    });
  }

  // Move button
  var moveBtn = document.getElementById('yt-bulk-move-btn');
  if (moveBtn) {
    moveBtn.addEventListener('click', async function () {
      var playlistId = getSelectedPlaylistId();
      var videoIds = selectionState.getAll();
      var currentPlaylistId = getCurrentPlaylistId();

      if (!videoIds.length || !playlistId) {
        setOverlayError('Select at least 1 video and 1 playlist');
        return;
      }

      if (!currentPlaylistId) {
        setOverlayError('Not on a playlist page – cannot move (use Copy instead)');
        return;
      }

      if (playlistId === currentPlaylistId) {
        setOverlayError('Target playlist is the same as current playlist');
        return;
      }

      setOverlayLoading(true);

      try {
        // Check for duplicates in target playlist
        var existingIds = await fetchPlaylistVideoIds(_session, playlistId, videoIds);
        var newIds = videoIds.filter(function (id) {
          return existingIds.indexOf(id) === -1;
        });

        if (newIds.length === 0) {
          setOverlayWarning('All ' + videoIds.length + ' video(s) already in target playlist – only removing from current');
        } else {
          if (existingIds.length > 0) {
            setOverlayWarning(existingIds.length + ' video(s) already in target, moving ' + newIds.length + ' new');
          }

          // Step 1: Add to target playlist
          await dispatchBatch(_session, playlistId, newIds);
        }

        // Step 2: Remove ALL selected from current playlist (only after successful add)
        try {
          await dispatchRemove(_session, currentPlaylistId, videoIds);
        } catch (removeErr) {
          setOverlayError('Added to target but failed to remove from current: ' + removeErr.message);
          selectionState.clear();
          uncheckAll();
          return;
        }

        setOverlaySuccess('Moved ' + videoIds.length + ' video(s)!');
        selectionState.clear();
        uncheckAll();
      } catch (err) {
        setOverlayError(err.message || 'Move failed');
      } finally {
        setOverlayLoading(false);
      }
    });
  }

  // Deselect All button – also uncheck all managed checkboxes
  var deselectBtn = document.getElementById('yt-bulk-deselect-btn');
  if (deselectBtn) {
    deselectBtn.addEventListener('click', function () {
      uncheckAll();
      selectionState.lastCheckedIndex = null;
    });
  }
}

function uncheckAll() {
  var checkboxes = document.querySelectorAll(
    '.' + CONFIG.MANAGED_CLASS + ' input[type="checkbox"][data-video-id]'
  );
  for (var i = 0; i < checkboxes.length; i++) {
    checkboxes[i].checked = false;
  }
}

// Re-initialise on SPA (virtual) navigation
window.addEventListener('yt-navigate-finish', function () {
  Logger.info('SPA navigation detected, re-initialising...');
  init();
});

// Auto-start on first page load
init();
