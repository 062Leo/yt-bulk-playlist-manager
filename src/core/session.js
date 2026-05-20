// session.js – Extracts YouTube session credentials (ytcfg API key and context) via polling

function getSession() {
  var maxAttempts = CONFIG.SESSION_POLL_MAX;
  var intervalMs = CONFIG.SESSION_POLL_MS;

  return new Promise(function (resolve, reject) {
    var attempts = 0;

    var poll = setInterval(function () {
      attempts++;

      Logger.debug('Polling ytcfg – attempt', attempts + '/' + maxAttempts);

      try {
        var apiKey = window.ytcfg && window.ytcfg.get('INNERTUBE_API_KEY');
        var context = window.ytcfg && window.ytcfg.get('INNERTUBE_CONTEXT');
      } catch (e) {
        Logger.debug('ytcfg.get threw –', e.message);
      }

      if (apiKey && context) {
        clearInterval(poll);
        Logger.success('Session acquired after', attempts, 'attempt(s)');
        resolve({ apiKey: apiKey, context: context });
        return;
      }

      if (attempts >= maxAttempts) {
        clearInterval(poll);
        Logger.error(
          'ytcfg not available after',
          maxAttempts,
          'attempts. Ensure you are on a YouTube page (playlist, watch, or library) and that the page has fully loaded.'
        );
        reject(new SessionError('Failed to extract ytcfg session after ' + maxAttempts + ' polling attempts'));
      }
    }, intervalMs);
  });
}

function getClientVersion(session) {
  return session.context && session.context.client && session.context.client.clientVersion;
}
