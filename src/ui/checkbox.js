// checkbox.js – Injects checkboxes into ytd-playlist-video-renderer rows with videoId extraction

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

    var checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.setAttribute('data-video-id', videoId);
    checkbox.style.cssText = [
      'width:18px',
      'height:18px',
      'min-width:18px',
      'min-height:18px',
      'flex-shrink:0',
      'cursor:pointer',
      'accent-color:#065fd4',
      'margin:0 12px 0 0',
      'align-self:center'
    ].join(';');

    checkbox.addEventListener('click', function (event) {
      event.stopPropagation();
    });

    checkbox.addEventListener('change', function (event) {
      if (checkbox.checked) {
        selectionState.add(videoId);
      } else {
        selectionState.remove(videoId);
      }

      if (event.shiftKey && selectionState.lastCheckedIndex !== null) {
        var allCheckboxes = document.querySelectorAll(
          CONFIG.VIDEO_RENDERER + ' input[type="checkbox"][data-video-id]'
        );
        var currentIndex = -1;
        for (var i = 0; i < allCheckboxes.length; i++) {
          if (allCheckboxes[i] === checkbox) {
            currentIndex = i;
            break;
          }
        }

        if (currentIndex !== -1) {
          var start = Math.min(selectionState.lastCheckedIndex, currentIndex);
          var end = Math.max(selectionState.lastCheckedIndex, currentIndex);

          for (var j = start; j <= end; j++) {
            var cb = allCheckboxes[j];
            if (cb !== checkbox && cb.checked !== checkbox.checked) {
              cb.checked = checkbox.checked;
              var cid = cb.getAttribute('data-video-id');
              if (checkbox.checked) {
                selectionState.add(cid);
              } else {
                selectionState.remove(cid);
              }
            }
          }
        }
      }

      var allCheckboxes = document.querySelectorAll(
        CONFIG.VIDEO_RENDERER + ' input[type="checkbox"][data-video-id]'
      );
      for (var k = 0; k < allCheckboxes.length; k++) {
        if (allCheckboxes[k] === checkbox) {
          selectionState.lastCheckedIndex = k;
          break;
        }
      }
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
