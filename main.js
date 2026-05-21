// main.js – Application entry point; wires all modules together and handles SPA re-initialisation

var _initialising = false;
var _buttonListenersWired = false;
var _session = null;

function isPlaylistPage() {
  return /^https:\/\/www\.youtube\.com\/playlist(\?|$)/.test(window.location.href);
}

async function init() {
  // Only fully initialise on playlist pages; on other YouTube pages we
  // just keep the SPA listener alive so navigation TO a playlist works.
  if (!isPlaylistPage()) return;

  if (_initialising) {
    // Logger.debug('init() already in progress, skipping');
    return;
  }

  _initialising = true;

  try {
    // Logger.info('YT Bulk Playlist Manager initialising...');

    // Clean up old observer and overlay from previous navigation
    stopObserver();
    destroyOverlay();
    selectionState.clear();

    var oldError = document.getElementById('yt-bulk-session-error');
    if (oldError) oldError.remove();

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

    // Wire buttons (only once per overlay lifecycle)
    _buttonListenersWired = false;
    wireButtons();

    Logger.info('YT Bulk Playlist Manager ready');
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

      var select = document.getElementById('yt-bulk-playlist-select');
      var playlistName = select ? select.options[select.selectedIndex].text : 'target playlist';

      // Check for duplicates BEFORE showing the confirmation
      var existingIds = await fetchPlaylistVideoIds(_session, playlistId, videoIds);
      var newIds = videoIds.filter(function (id) {
        return existingIds.indexOf(id) === -1;
      });

      // Build confirmation message with duplicate info
      var confirmMsg;
      if (newIds.length === videoIds.length) {
        confirmMsg = videoIds.length + ' ' + pluralize(videoIds.length, 'video') + ' will be copied to "' + playlistName + '". The original videos remain in the current playlist.';
      } else if (newIds.length === 0) {
        confirmMsg = (videoIds.length === 1
          ? 'The selected video is already in "' + playlistName + '"'
          : 'All ' + videoIds.length + ' selected videos are already in "' + playlistName + '"') + '. Nothing will be copied.';
      } else {
        confirmMsg = existingIds.length + ' of ' + videoIds.length + ' selected ' + pluralize(videoIds.length, 'video') + ' are already in "' + playlistName + '".\n\nOnly ' + newIds.length + ' new ' + pluralize(newIds.length, 'video') + ' will be copied. The ' + existingIds.length + ' existing ' + pluralize(existingIds.length, 'video') + ' will be skipped.';
      }

      var confirmType = newIds.length < videoIds.length ? 'warning' : 'info';
      var confirmLabel = newIds.length === 0 ? 'OK' : undefined;
      var confirmed = await showConfirmDialog('Copy Videos', confirmMsg, confirmType, confirmLabel);
      if (!confirmed) return;

      if (newIds.length === 0) {
        selectionState.clear();
        uncheckAll();
        return;
      }

      setOverlayLoading(true);
      showProgressDialog();

      try {
        updateProgress('Adding videos to target playlist...', 15);
        await dispatchBatch(_session, playlistId, newIds);

        updateProgress('Finalising...', 90);
        var copiedCount = newIds.length;
        var skippedByPrecheck = videoIds.length - copiedCount;

        var successMsg = 'Copied ' + copiedCount + ' ' + pluralize(copiedCount, 'video') + '!';
        if (skippedByPrecheck > 0) {
          successMsg += ' ' + skippedByPrecheck + ' skipped (already in target)';
        }
        setOverlaySuccess(successMsg);

        selectionState.clear();
        uncheckAll();
      } catch (err) {
        setOverlayError(err.message || 'Copy failed');
      } finally {
        hideProgressDialog();
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

      var select = document.getElementById('yt-bulk-playlist-select');
      var playlistName = select ? select.options[select.selectedIndex].text : 'target playlist';

      // Check for duplicates BEFORE showing the confirmation
      var existingIds = await fetchPlaylistVideoIds(_session, playlistId, videoIds);
      var newIds = videoIds.filter(function (id) {
        return existingIds.indexOf(id) === -1;
      });

      // Build confirmation message with duplicate info
      var confirmMsg;
      if (newIds.length === videoIds.length) {
        confirmMsg = videoIds.length + ' ' + pluralize(videoIds.length, 'video') + ' will be added to "' + playlistName + '" and then removed from the current playlist.';
      } else if (newIds.length === 0) {
        confirmMsg = (videoIds.length === 1
          ? 'The selected video is already in "' + playlistName + '"'
          : 'All ' + videoIds.length + ' selected videos are already in "' + playlistName + '"') + '.\n\nRemove from the current playlist anyway?';
      } else {
        confirmMsg = existingIds.length + ' of ' + videoIds.length + ' selected ' + pluralize(videoIds.length, 'video') + ' are already in "' + playlistName + '".\n\nOnly ' + newIds.length + ' new ' + pluralize(newIds.length, 'video') + ' will be moved (added to target and removed from current). The ' + existingIds.length + ' existing ' + pluralize(existingIds.length, 'video') + ' will be skipped.';
      }

      var confirmType = newIds.length < videoIds.length ? 'warning' : 'info';
      var confirmLabel = newIds.length === 0 ? 'Yes, Delete' : undefined;
      var confirmed = await showConfirmDialog('Move Videos', confirmMsg, confirmType, confirmLabel);
      if (!confirmed) return;

      setOverlayLoading(true);
      showProgressDialog();

      try {
        if (newIds.length > 0) {
          updateProgress('Adding videos to target playlist...', 15);
          await dispatchBatch(_session, playlistId, newIds);

          updateProgress('Fetching setVideoIds for removal...', 50);
          var videoIdToSetId = await fetchPlaylistSetVideoIds(_session, currentPlaylistId, newIds);
          var videoPayloads = [];
          for (var vi = 0; vi < newIds.length; vi++) {
            var vid = newIds[vi];
            var setVideoId = videoIdToSetId[vid] || null;
            if (!setVideoId) {
              Logger.warn('No setVideoId found for', vid, 'in current playlist', currentPlaylistId);
            }
            videoPayloads.push({
              videoId: vid,
              setVideoId: setVideoId
            });
          }

          updateProgress('Removing from current playlist...', 70);
          try {
            await dispatchRemove(_session, currentPlaylistId, videoPayloads);
          } catch (removeErr) {
            setOverlayError('Added to target but failed to remove from current: ' + removeErr.message);
            selectionState.clear();
            uncheckAll();
            return;
          }

          // Remove DOM elements for all moved videos
          for (var ri = 0; ri < newIds.length; ri++) {
            var allCbs = document.querySelectorAll(
              '.' + CONFIG.MANAGED_CLASS + ' input[type="checkbox"][data-video-id="' + newIds[ri] + '"]'
            );
            for (var rj = 0; rj < allCbs.length; rj++) {
              var renderer = allCbs[rj].closest(CONFIG.VIDEO_RENDERER);
              if (renderer) renderer.remove();
            }
          }

          updateProgress('Done!', 100);
          var skippedByPrecheck = videoIds.length - newIds.length;
          var successMsg = 'Moved ' + newIds.length + ' ' + pluralize(newIds.length, 'video') + '!';
          if (skippedByPrecheck > 0) {
            successMsg += ' ' + skippedByPrecheck + ' skipped (already in target)';
          }
          setOverlaySuccess(successMsg);
        } else {
          updateProgress('Removing from current playlist...', 30);
          // All were already in target — user chose "Yes, Delete"
          // Remove all selected from current
          var allVideoIdToSetId = await fetchPlaylistSetVideoIds(_session, currentPlaylistId, videoIds);
          var allVideoPayloads = [];
          for (var vi2 = 0; vi2 < videoIds.length; vi2++) {
            var vid2 = videoIds[vi2];
            var setVideoId2 = allVideoIdToSetId[vid2] || null;
            if (!setVideoId2) {
              Logger.warn('No setVideoId found for', vid2, 'in current playlist', currentPlaylistId);
            }
            allVideoPayloads.push({
              videoId: vid2,
              setVideoId: setVideoId2
            });
          }

          try {
            await dispatchRemove(_session, currentPlaylistId, allVideoPayloads);
            for (var ri2 = 0; ri2 < videoIds.length; ri2++) {
              var allCbs2 = document.querySelectorAll(
                '.' + CONFIG.MANAGED_CLASS + ' input[type="checkbox"][data-video-id="' + videoIds[ri2] + '"]'
              );
              for (var rj2 = 0; rj2 < allCbs2.length; rj2++) {
                var renderer2 = allCbs2[rj2].closest(CONFIG.VIDEO_RENDERER);
                if (renderer2) renderer2.remove();
              }
            }
            updateProgress('Done!', 100);
            setOverlaySuccess('Removed ' + videoIds.length + ' ' + pluralize(videoIds.length, 'video') + ' from current playlist');
          } catch (removeErr) {
            setOverlayError('Failed to remove from current: ' + removeErr.message);
          }
        }

        selectionState.clear();
        uncheckAll();
      } catch (err) {
        setOverlayError(err.message || 'Move failed');
      } finally {
        hideProgressDialog();
        setOverlayLoading(false);
      }
    });
  }

  // Remove button – remove selected videos from current playlist
  var removeBtn = document.getElementById('yt-bulk-remove-btn');
  if (removeBtn) {
    removeBtn.addEventListener('click', async function () {
      var videoIds = selectionState.getAll();
      var currentPlaylistId = getCurrentPlaylistId();

      if (!videoIds.length) {
        setOverlayError('Select at least 1 video');
        return;
      }

      if (!currentPlaylistId) {
        setOverlayError('Not on a playlist page');
        return;
      }

      var confirmed = await showConfirmDialog(
        'Remove Videos',
        videoIds.length + ' ' + pluralize(videoIds.length, 'video') + ' will be permanently removed from the current playlist. This action cannot be undone.',
        'warning'
      );
      if (!confirmed) return;

      setOverlayLoading(true);
      showProgressDialog();

      try {
        updateProgress('Fetching playlist data...', 10);
        var videoIdToSetId = await fetchPlaylistSetVideoIds(_session, currentPlaylistId, videoIds);
        var videoPayloads = [];
        for (var vi = 0; vi < videoIds.length; vi++) {
          var vid = videoIds[vi];
          var setVideoId = videoIdToSetId[vid] || null;
          if (!setVideoId) {
            Logger.warn('No setVideoId found for', vid, 'in current playlist', currentPlaylistId);
          }
          videoPayloads.push({
            videoId: vid,
            setVideoId: setVideoId
          });
        }

        updateProgress('Removing videos from playlist...', 30);
        var result = await dispatchRemove(_session, currentPlaylistId, videoPayloads);

        for (var ri = 0; ri < videoIds.length; ri++) {
          var allCbs = document.querySelectorAll(
            '.' + CONFIG.MANAGED_CLASS + ' input[type="checkbox"][data-video-id="' + videoIds[ri] + '"]'
          );
          for (var rj = 0; rj < allCbs.length; rj++) {
            var renderer = allCbs[rj].closest(CONFIG.VIDEO_RENDERER);
            if (renderer) renderer.remove();
          }
        }

        updateProgress('Done!', 100);
        setOverlaySuccess('Removed ' + result.count + ' ' + pluralize(result.count, 'video') + '!');
        selectionState.clear();
        uncheckAll();
      } catch (err) {
        setOverlayError(err.message || 'Remove failed');
      } finally {
        hideProgressDialog();
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

// ─── SPA navigation detection ───────────────────────────────────────────────
// YouTube uses pushState/replaceState for virtual navigation. The
// yt-navigate-finish event is unreliable (sometimes doesn't fire at all).
// Intercepting the history methods is the most robust approach.

var _lastUrl = window.location.href;

function _onUrlChanged() {
  var url = window.location.href;
  if (url !== _lastUrl) {
    _lastUrl = url;
    // Logger.info('SPA navigation detected, re-initialising...');
    init();
  }
}

(function () {
  var origPush = history.pushState;
  var origReplace = history.replaceState;

  history.pushState = function () {
    origPush.apply(this, arguments);
    _onUrlChanged();
  };

  history.replaceState = function () {
    origReplace.apply(this, arguments);
    _onUrlChanged();
  };
})();

window.addEventListener('popstate', _onUrlChanged);
window.addEventListener('yt-navigate-finish', _onUrlChanged);

// Polling fallback — YouTube may use the Navigation API, location.assign,
// or other mechanisms that bypass pushState/replaceState interception.
setInterval(function () {
  var url = window.location.href;
  if (url !== _lastUrl) {
    _lastUrl = url;
    init();
  }
}, 1000);

// Auto-start on first page load
init();
