// observer.js – MutationObserver that watches for lazy-loaded video rows and injects checkboxes

var _observerInstance = null;

function startObserver() {
  var rendererSelector = CONFIG.VIDEO_RENDERER;

  var existing = document.querySelectorAll(rendererSelector);
  Logger.info('Initial pass: found ' + existing.length + ' existing video renderer(s)');
  for (var i = 0; i < existing.length; i++) {
    try {
      injectCheckbox(existing[i]);
    } catch (e) {
      Logger.error('Initial pass inject failed:', e.message);
    }
  }

  var observer = new MutationObserver(function (mutations) {
    Logger.debug('Mutation batch: ' + mutations.length + ' mutation record(s), checking added nodes');

    for (var m = 0; m < mutations.length; m++) {
      var addedNodes = mutations[m].addedNodes;
      var nodesChecked = 0;

      for (var n = 0; n < addedNodes.length; n++) {
        var node = addedNodes[n];
        nodesChecked++;

        try {
          if (!(node instanceof Element)) continue;

          var renderers = node.matches(rendererSelector)
            ? [node]
            : node.querySelectorAll(rendererSelector);

          for (var r = 0; r < renderers.length; r++) {
            injectCheckbox(renderers[r]);
          }
        } catch (e) {
          Logger.error('Mutation callback error:', e.message);
        }
      }

      Logger.debug('Mutation record ' + m + ': ' + nodesChecked + ' added node(s) checked');
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
  _observerInstance = observer;
  Logger.info('MutationObserver started');
  return observer;
}

function stopObserver() {
  if (_observerInstance) {
    _observerInstance.disconnect();
    _observerInstance = null;
    Logger.info('MutationObserver disconnected');
  }
}
