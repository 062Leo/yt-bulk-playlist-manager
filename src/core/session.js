// session.js – Extracts YouTube session credentials (ytcfg API key, context, and SAPISID auth) via polling

function getSapisidCookie() {
  var match = document.cookie.match(/(?:^|;\s*)SAPISID=([^;]*)/);
  return match ? match[1] : null;
}

async function computeSapisidHash(sapisid, origin) {
  var timestamp = Math.floor(Date.now() / 1000);
  var message = timestamp + ' ' + sapisid + ' ' + origin;
  var encoder = new TextEncoder();
  var data = encoder.encode(message);
  var hashBuffer = await crypto.subtle.digest('SHA-1', data);
  var hashArray = Array.from(new Uint8Array(hashBuffer));
  var hashHex = hashArray.map(function (b) {
    return b.toString(16).padStart(2, '0');
  }).join('');
  return 'SAPISIDHASH ' + timestamp + '_' + hashHex;
}

async function buildAuthHeaders() {
  var sapisid = getSapisidCookie();
  if (!sapisid) return null;

  var origin = window.location.origin;
  var hash = await computeSapisidHash(sapisid, origin);
  return {
    'Authorization': hash,
    'X-Origin': origin
  };
}

function getSession() {
  var maxAttempts = CONFIG.SESSION_POLL_MAX;
  var intervalMs = CONFIG.SESSION_POLL_MS;

  return new Promise(function (resolve, reject) {
    var attempts = 0;

    var poll = setInterval(function () {
      attempts++;

      try {
        var ytcfg = (typeof unsafeWindow !== 'undefined' ? unsafeWindow : window).ytcfg;
        var apiKey = ytcfg && ytcfg.get('INNERTUBE_API_KEY');
        var context = ytcfg && ytcfg.get('INNERTUBE_CONTEXT');
      } catch (e) {
        // ytcfg not ready yet
      }

      if (apiKey && context) {
        clearInterval(poll);
        // Logger.success('Session acquired after', attempts, 'attempt(s)');

        buildAuthHeaders().then(function (authHeaders) {
          resolve({ apiKey: apiKey, context: context, authHeaders: authHeaders });
        }).catch(function () {
          resolve({ apiKey: apiKey, context: context, authHeaders: null });
        });

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
