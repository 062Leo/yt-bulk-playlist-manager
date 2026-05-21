// observer.js – MutationObserver that watches for lazy-loaded video rows and injects checkboxes

var _observerInstance = null;
var _observerDebounceId = null;

function _findPlaylistContentsRoot() {
  var selectors = [
    'ytd-playlist-video-list-renderer #contents',
    '#contents.ytd-playlist-video-list-renderer',
    'ytd-playlist-video-list-renderer'
  ];
  for (var s = 0; s < selectors.length; s++) {
    var el = document.querySelector(selectors[s]);
    if (el) return el;
  }
  return null;
}

function _injectBatch(nodes) {
  for (var i = 0; i < nodes.length; i++) {
    var node = nodes[i];
    try {
      if (!(node instanceof Element)) continue;
      var renderers = node.matches(CONFIG.VIDEO_RENDERER)
        ? [node]
        : node.querySelectorAll(CONFIG.VIDEO_RENDERER);
      for (var r = 0; r < renderers.length; r++) {
        injectCheckbox(renderers[r]);
      }
    } catch (e) {
      Logger.error('Mutation callback error:', e.message);
    }
  }
}

function startObserver() {
  var rendererSelector = CONFIG.VIDEO_RENDERER;
  var observeTarget = _findPlaylistContentsRoot() || document.body;

  // Only inject checkboxes for renderers inside the actual playlist contents,
  // not in recommended/suggested video sections at the bottom of the page
  var existing = observeTarget.querySelectorAll(rendererSelector);
  // Logger.info('Initial pass: found ' + existing.length + ' existing video renderer(s) in playlist');
  for (var i = 0; i < existing.length; i++) {
    try {
      injectCheckbox(existing[i]);
    } catch (e) {
      Logger.error('Initial pass inject failed:', e.message);
    }
  }
  // Logger.info('MutationObserver scoped to:', observeTarget === document.body ? 'document.body (fallback)' : observeTarget.tagName + '#' + (observeTarget.id || '(no-id)'));

  var _pendingNodes = [];
  var _flush = function () {
    if (_pendingNodes.length === 0) return;
    var nodes = _pendingNodes;
    _pendingNodes = [];
    _injectBatch(nodes);
  };

  var observer = new MutationObserver(function (mutations) {
    for (var m = 0; m < mutations.length; m++) {
      var addedNodes = mutations[m].addedNodes;
      for (var n = 0; n < addedNodes.length; n++) {
        _pendingNodes.push(addedNodes[n]);
      }
    }

    if (_observerDebounceId !== null) {
      clearTimeout(_observerDebounceId);
    }
    _observerDebounceId = setTimeout(function () {
      _observerDebounceId = null;
      _flush();
    }, 50);
  });

  observer.observe(observeTarget, { childList: true, subtree: true });
  _observerInstance = observer;
  // Logger.info('MutationObserver started');
  return observer;
}

function stopObserver() {
  if (_observerDebounceId !== null) {
    clearTimeout(_observerDebounceId);
    _observerDebounceId = null;
  }
  if (_observerInstance) {
    _observerInstance.disconnect();
    _observerInstance = null;
    // Logger.info('MutationObserver disconnected');
  }
}
