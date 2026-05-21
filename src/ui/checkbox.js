// checkbox.js – Injects checkboxes into ytd-playlist-video-renderer rows with videoId extraction

var _MAX_FIND_DEPTH = 20;

function findPlaylistEditEndpoint(obj) {
  if (!obj || typeof obj !== 'object') return null;
  if (obj.playlistEditEndpoint) return obj.playlistEditEndpoint;

  var visited = new WeakSet();
  var queue = [{ node: obj, depth: 0 }];

  while (queue.length > 0) {
    var entry = queue.shift();
    var current = entry.node;
    var depth = entry.depth;

    if (depth > _MAX_FIND_DEPTH) continue;
    if (!current || typeof current !== 'object') continue;
    if (visited.has(current)) continue;
    visited.add(current);

    for (var key in current) {
      if (!current.hasOwnProperty(key)) continue;
      var val = current[key];
      if (key === 'playlistEditEndpoint' && val) {
        return val;
      }
      if (typeof val === 'object' && val !== null) {
        queue.push({ node: val, depth: depth + 1 });
      }
    }
  }

  return null;
}

function _findCheckboxIndex(checkbox, allBoxes) {
  for (var i = 0; i < allBoxes.length; i++) {
    if (allBoxes[i] === checkbox) return i;
  }
  return -1;
}

function injectCheckbox(rendererElement) {
  try {
    if (rendererElement.classList.contains(CONFIG.MANAGED_CLASS)) {
      return;
    }

    var titleAnchor = rendererElement.querySelector('a#video-title');
    if (!titleAnchor) {
      Logger.warn('No a#video-title found inside renderer, skipping');
      return;
    }

    var href = titleAnchor.getAttribute('href');
    if (!href) {
      Logger.warn('Anchor has no href attribute');
      return;
    }

    try {
      var url = new URL(href, window.location.origin);
      var videoId = url.searchParams.get('v');
    } catch (e) {
      Logger.warn('Failed to parse anchor href:', href);
      return;
    }

    if (!videoId) {
      Logger.warn('No videoId found in href:', href);
      return;
    }

    // Store YouTube's own playlist edit endpoint data for later removal
    var editEndpointData = null;
    if (rendererElement.data) {
      editEndpointData = findPlaylistEditEndpoint(rendererElement.data);
      if (editEndpointData) {
        // Logger.debug('Extracted playlistEditEndpoint for', videoId);
      } else {
        Logger.warn('No playlistEditEndpoint found in renderer data for', videoId);
      }
    } else {
      Logger.warn('rendererElement.data not available for', videoId);
    }

    var checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.setAttribute('data-video-id', videoId);
    if (editEndpointData) {
      checkbox.setAttribute('data-playlist-edit', JSON.stringify(editEndpointData));
    }
    checkbox.style.cssText = [
      'width:28px',
      'height:28px',
      'min-width:28px',
      'min-height:28px',
      'flex-shrink:0',
      'cursor:pointer',
      'accent-color:#065fd4',
      'margin:0 12px 0 0',
      'align-self:center'
    ].join(';');

    checkbox.addEventListener('click', function (event) {
      event.stopPropagation();

      // checkbox.checked is already the NEW state at click time
      var isChecked = checkbox.checked;

      if (isChecked) {
        selectionState.add(videoId);
      } else {
        selectionState.remove(videoId);
      }

      var allCbs = document.querySelectorAll(
        CONFIG.VIDEO_RENDERER + ' input[type="checkbox"][data-video-id]'
      );
      var currentIndex = _findCheckboxIndex(checkbox, allCbs);

      // event.shiftKey is available on click (MouseEvent) but NOT on change (Event)
      if (event.shiftKey && selectionState.lastCheckedIndex !== null && currentIndex !== -1) {
        var start = Math.min(selectionState.lastCheckedIndex, currentIndex);
        var end = Math.max(selectionState.lastCheckedIndex, currentIndex);

        for (var j = start; j <= end; j++) {
          var cb = allCbs[j];
          if (cb !== checkbox && cb.checked !== isChecked) {
            cb.checked = isChecked;
            var cid = cb.getAttribute('data-video-id');
            if (isChecked) {
              selectionState.add(cid);
            } else {
              selectionState.remove(cid);
            }
          }
        }
      }

      selectionState.lastCheckedIndex = _findCheckboxIndex(checkbox, allCbs);
    });

    var content = rendererElement.querySelector('#content');
    if (!content) {
      throw new Error('No #content element found to prepend checkbox into');
    }

    content.prepend(checkbox);
    rendererElement.classList.add(CONFIG.MANAGED_CLASS);


  } catch (e) {
    throw new InjectionError('Failed to inject checkbox: ' + e.message);
  }
}
