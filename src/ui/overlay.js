// overlay.js – Floating control panel with selection count, playlist dropdown, and Copy/Move buttons

var _overlayRef = null;
var _overlayMessageTimer = null;
var _selectionListener = null;

function destroyOverlay() {
  if (_selectionListener) {
    document.removeEventListener('yt-bulk-selection-changed', _selectionListener);
    _selectionListener = null;
  }
  if (_overlayRef) {
    if (_overlayRef.parentNode) {
      _overlayRef.parentNode.removeChild(_overlayRef);
    }
    _overlayRef = null;
    Logger.info('Overlay destroyed');
  }
  if (_overlayMessageTimer !== null) {
    clearTimeout(_overlayMessageTimer);
    _overlayMessageTimer = null;
  }
}

function createOverlay() {
  if (_overlayRef) {
    return _overlayRef;
  }

  var overlay = document.createElement('div');
  overlay.id = CONFIG.OVERLAY_ID;
  overlay.style.cssText = [
    'display:none',
    'position:fixed',
    'top:24px',
    'left:50%',
    'transform:translateX(-50%)',
    'background:#212121',
    'color:#ffffff',
    'border-radius:12px',
    'box-shadow:0 4px 16px rgba(0,0,0,0.4)',
    'padding:12px 16px',
    'z-index:9999',
    'font-family:"Roboto","Arial",sans-serif',
    'font-size:14px',
    'max-width:calc(100vw - 48px)',
    'box-sizing:border-box',
    'flex-direction:column',
    'gap:8px'
  ].join(';');

  // ---- Row ----
  var row = document.createElement('div');
  row.style.cssText = 'display:flex;align-items:center;gap:12px;flex-wrap:wrap;justify-content:center;';

  // Count badge
  var countBadge = document.createElement('span');
  countBadge.id = 'yt-bulk-count';
  countBadge.textContent = '0 selected';
  countBadge.style.cssText = 'min-width:80px;text-align:center;font-weight:500;';

  // Playlist dropdown
  var playlistSelect = document.createElement('select');
  playlistSelect.id = 'yt-bulk-playlist-select';
  playlistSelect.style.cssText = [
    'background:#303030',
    'color:#ffffff',
    'border:1px solid #444',
    'border-radius:4px',
    'padding:6px 8px',
    'font-size:14px',
    'max-width:200px',
    'min-width:120px',
    'cursor:pointer'
  ].join(';');

  var defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.textContent = '\u2014 Select playlist \u2014';
  defaultOption.disabled = true;
  defaultOption.selected = true;
  playlistSelect.appendChild(defaultOption);

  playlistSelect.addEventListener('change', function () {
    updateActionButtons();
  });

  // Copy to Playlist button
  var copyBtn = document.createElement('button');
  copyBtn.id = 'yt-bulk-copy-btn';
  copyBtn.textContent = 'Copy';
  copyBtn.title = 'Copy selected videos to the target playlist';
  copyBtn.style.cssText = [
    'background:#065fd4',
    'color:#ffffff',
    'border:none',
    'border-radius:18px',
    'padding:8px 16px',
    'font-size:14px',
    'font-weight:500',
    'cursor:pointer'
  ].join(';');
  copyBtn.disabled = true;

  // Move to Playlist button
  var moveBtn = document.createElement('button');
  moveBtn.id = 'yt-bulk-move-btn';
  moveBtn.textContent = 'Move';
  moveBtn.title = 'Copy selected videos to target playlist, then remove from current playlist';
  moveBtn.style.cssText = [
    'background:#c00',
    'color:#ffffff',
    'border:none',
    'border-radius:18px',
    'padding:8px 16px',
    'font-size:14px',
    'font-weight:500',
    'cursor:pointer'
  ].join(';');
  moveBtn.disabled = true;

  // Deselect All button
  var deselectBtn = document.createElement('button');
  deselectBtn.id = 'yt-bulk-deselect-btn';
  deselectBtn.textContent = 'Deselect All';
  deselectBtn.style.cssText = [
    'background:transparent',
    'color:#aaa',
    'border:1px solid #555',
    'border-radius:18px',
    'padding:8px 16px',
    'font-size:14px',
    'cursor:pointer'
  ].join(';');
  deselectBtn.addEventListener('click', function () {
    selectionState.clear();
  });

  // Spinner (CSS-only rotating ring inside a span)
  var spinner = document.createElement('span');
  spinner.id = 'yt-bulk-spinner';
  spinner.textContent = '\u25E0';
  spinner.style.cssText = [
    'display:none',
    'font-size:18px',
    'animation:yt-bulk-spin 0.8s linear infinite',
    'line-height:1'
  ].join(';');

  // Inject spinner keyframes once
  if (!document.getElementById('yt-bulk-spinner-style')) {
    var style = document.createElement('style');
    style.id = 'yt-bulk-spinner-style';
    style.textContent = '@keyframes yt-bulk-spin{to{transform:rotate(360deg)}}';
    document.head.appendChild(style);
  }

  row.appendChild(countBadge);
  row.appendChild(playlistSelect);
  row.appendChild(copyBtn);
  row.appendChild(moveBtn);
  row.appendChild(deselectBtn);
  row.appendChild(spinner);

  overlay.appendChild(row);

  // Message area
  var message = document.createElement('span');
  message.id = 'yt-bulk-message';
  message.style.cssText = [
    'display:none',
    'width:100%',
    'text-align:center',
    'font-size:13px',
    'padding:2px 0'
  ].join(';');

  overlay.appendChild(message);
  document.body.appendChild(overlay);

  _overlayRef = overlay;

  // Auto-update count and visibility on selection changes
  _selectionListener = function (event) {
    var count = event.detail && typeof event.detail.count === 'number' ? event.detail.count : 0;
    syncOverlayVisibility(count);
  };
  document.addEventListener('yt-bulk-selection-changed', _selectionListener);

  Logger.info('Overlay created and appended to document.body');
  return overlay;
}

function updateActionButtons() {
  var playlistId = getSelectedPlaylistId();
  var count = selectionState.getCount();

  var copyBtn = document.getElementById('yt-bulk-copy-btn');
  var moveBtn = document.getElementById('yt-bulk-move-btn');

  if (copyBtn) copyBtn.disabled = !playlistId || count === 0;
  if (moveBtn) moveBtn.disabled = !playlistId || count === 0 || !getCurrentPlaylistId();
}

function getCurrentPlaylistId() {
  try {
    var urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('list');
  } catch (e) {
    return null;
  }
}

function syncOverlayVisibility(count) {
  var overlay = _overlayRef;
  if (!overlay) return;

  var wasVisible = overlay.style.display === 'flex';
  overlay.style.display = count > 0 ? 'flex' : 'none';

  var badge = overlay.querySelector('#yt-bulk-count');
  if (badge) {
    badge.textContent = count + ' selected';
  }

  var deselectBtn = overlay.querySelector('#yt-bulk-deselect-btn');
  if (deselectBtn) {
    deselectBtn.disabled = count === 0;
  }

  updateActionButtons();
}

function setOverlayLoading(isLoading) {
  var overlay = _overlayRef;
  if (!overlay) return;

  var copyBtn = overlay.querySelector('#yt-bulk-copy-btn');
  var moveBtn = overlay.querySelector('#yt-bulk-move-btn');
  if (copyBtn) copyBtn.disabled = isLoading || !getSelectedPlaylistId() || selectionState.getCount() === 0;
  if (moveBtn) moveBtn.disabled = isLoading || !getSelectedPlaylistId() || selectionState.getCount() === 0 || !getCurrentPlaylistId();

  var spinner = overlay.querySelector('#yt-bulk-spinner');
  if (spinner) {
    spinner.style.display = isLoading ? 'inline-block' : 'none';
  }

  var select = overlay.querySelector('#yt-bulk-playlist-select');
  if (select) {
    select.disabled = isLoading;
  }
}

function _clearMessageTimer() {
  if (_overlayMessageTimer !== null) {
    clearTimeout(_overlayMessageTimer);
    _overlayMessageTimer = null;
  }
}

function _showMessage(text, color, durationMs) {
  var overlay = _overlayRef;
  if (!overlay) return;

  var msgEl = overlay.querySelector('#yt-bulk-message');
  if (!msgEl) return;

  _clearMessageTimer();

  msgEl.textContent = text;
  msgEl.style.color = color;
  msgEl.style.display = 'block';

  _overlayMessageTimer = setTimeout(function () {
    if (msgEl) {
      msgEl.textContent = '';
      msgEl.style.display = 'none';
    }
    _overlayMessageTimer = null;
  }, durationMs);
}

function setOverlayError(message) {
  _showMessage(message, '#ff4444', 4000);
  Logger.error('Overlay error:', message);
}

function setOverlaySuccess(message) {
  _showMessage(message, '#4caf50', 3000);
  Logger.success('Overlay success:', message);
}

function setOverlayWarning(message) {
  _showMessage(message, '#ffaa00', 5000);
  Logger.warn('Overlay warning:', message);
}

function populatePlaylistDropdown(playlists) {
  var overlay = _overlayRef;
  if (!overlay) return;

  var select = overlay.querySelector('#yt-bulk-playlist-select');
  if (!select) return;

  while (select.options.length > 1) {
    select.remove(1);
  }

  if (!playlists || !playlists.length) {
    select.options[0].textContent = '\u2014 No playlists found \u2014';
    Logger.warn('No playlists provided to populate dropdown');
    return;
  }

  select.options[0].textContent = '\u2014 Select playlist \u2014';
  select.options[0].selected = true;

  for (var i = 0; i < playlists.length; i++) {
    var pl = playlists[i];
    var option = document.createElement('option');
    option.value = pl.playlistId;
    option.textContent = pl.title;
    select.appendChild(option);
  }

  updateActionButtons();

  Logger.info('Playlist dropdown populated with ' + playlists.length + ' playlist(s)');
}

function getSelectedPlaylistId() {
  var overlay = _overlayRef;
  if (!overlay) return null;

  var select = overlay.querySelector('#yt-bulk-playlist-select');
  if (!select || !select.value) return null;

  return select.value;
}
