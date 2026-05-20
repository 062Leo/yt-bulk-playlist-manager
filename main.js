// main.js – Application entry point; wires all modules together and handles SPA re-initialisation

var _initialising = false;

async function init() {
  if (_initialising) {
    Logger.debug('init() already in progress, skipping');
    return;
  }

  _initialising = true;

  try {
    Logger.info('YT Bulk Playlist Manager initialising...');

    // Step 2: Acquire session – on failure log error and show fixed notification
    var session;
    try {
      session = await getSession();
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

    // Step 3: Create floating overlay
    createOverlay();

    // Step 4: Start MutationObserver to inject checkboxes into existing + future rows
    startObserver();

    // Step 5: Fetch user playlists and populate the dropdown
    try {
      var playlists = await fetchUserPlaylists(session);
      populatePlaylistDropdown(playlists);
    } catch (err) {
      Logger.error('Failed to fetch playlists:', err);
      setOverlayError('Failed to load playlists');
    }

    // Step 6: Wire 'Add to Playlist' button click
    var addBtn = document.getElementById('yt-bulk-add-btn');
    if (addBtn) {
      addBtn.addEventListener('click', async function () {
        var playlistId = getSelectedPlaylistId();
        var videoIds = selectionState.getAll();

        if (!videoIds.length || !playlistId) {
          setOverlayError('Select at least 1 video and 1 playlist');
          return;
        }

        setOverlayLoading(true);

        try {
          var result = await dispatchBatch(session, playlistId, videoIds);
          selectionState.clear();

          var checkboxes = document.querySelectorAll(
            '.' + CONFIG.MANAGED_CLASS + ' input[type="checkbox"][data-video-id]'
          );
          for (var i = 0; i < checkboxes.length; i++) {
            checkboxes[i].checked = false;
          }

          setOverlaySuccess('Added ' + result.added + ' videos!');
        } catch (err) {
          setOverlayError(err.message || 'Dispatch failed');
        } finally {
          setOverlayLoading(false);
        }
      });
    }

    // Step 7: Wire 'Deselect all' button – also uncheck all managed checkboxes
    var deselectBtn = document.getElementById('yt-bulk-deselect-btn');
    if (deselectBtn) {
      deselectBtn.addEventListener('click', function () {
        var checkboxes = document.querySelectorAll(
          '.' + CONFIG.MANAGED_CLASS + ' input[type="checkbox"][data-video-id]'
        );
        for (var i = 0; i < checkboxes.length; i++) {
          checkboxes[i].checked = false;
        }
      });
    }

    Logger.success('YT Bulk Playlist Manager ready');
  } catch (err) {
    Logger.error('Unhandled error during init:', err);
  } finally {
    _initialising = false;
  }
}

// Step 8: Re-initialise on SPA (virtual) navigation
window.addEventListener('yt-navigate-finish', function () {
  Logger.info('SPA navigation detected, re-initialising...');
  _initialising = false;
  init();
});

// Auto-start on first page load
init();
