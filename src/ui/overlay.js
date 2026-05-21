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
    // Logger.info('Overlay destroyed');
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

  // Remove from current playlist button
  var removeBtn = document.createElement('button');
  removeBtn.id = 'yt-bulk-remove-btn';
  removeBtn.textContent = 'Remove';
  removeBtn.title = 'Remove selected videos from the current playlist';
  removeBtn.style.cssText = [
    'background:#c00',
    'color:#ffffff',
    'border:none',
    'border-radius:18px',
    'padding:8px 16px',
    'font-size:14px',
    'font-weight:500',
    'cursor:pointer'
  ].join(';');
  removeBtn.disabled = true;

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
  row.appendChild(removeBtn);
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

    // Logger.info('Overlay created and appended to document.body');
  return overlay;
}

function updateActionButtons() {
  var playlistId = getSelectedPlaylistId();
  var count = selectionState.getCount();
  var isOnPlaylist = !!getCurrentPlaylistId();

  var copyBtn = document.getElementById('yt-bulk-copy-btn');
  var moveBtn = document.getElementById('yt-bulk-move-btn');
  var removeBtn = document.getElementById('yt-bulk-remove-btn');

  if (copyBtn) copyBtn.disabled = !playlistId || count === 0;
  if (moveBtn) moveBtn.disabled = !playlistId || count === 0 || !isOnPlaylist;
  if (removeBtn) removeBtn.disabled = !isOnPlaylist || count === 0;
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

function showConfirmDialog(title, description, type, confirmLabel) {
  if (type === undefined) type = 'info';
  var isWarning = type === 'warning';
  if (confirmLabel === undefined) {
    confirmLabel = isWarning ? 'Proceed' : 'Confirm';
  }

  return new Promise(function (resolve) {
    var existing = document.getElementById('yt-bulk-confirm-dialog');
    if (existing) existing.remove();

    var backdrop = document.createElement('div');
    backdrop.id = 'yt-bulk-confirm-dialog';
    backdrop.style.cssText = [
      'position:fixed',
      'top:0','left:0','right:0','bottom:0',
      'background:rgba(0,0,0,0.6)',
      'z-index:10000',
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'font-family:"Roboto","Arial",sans-serif'
    ].join(';');

    var boxCss = [
      'background:#212121',
      'color:#fff',
      'border-radius:12px',
      'padding:32px',
      'max-width:520px',
      'width:92%',
      'box-shadow:0 8px 32px rgba(0,0,0,0.5)',
      'text-align:center'
    ];
    if (isWarning) {
      boxCss.push('border:2px solid #ffaa00');
    }
    var box = document.createElement('div');
    box.style.cssText = boxCss.join(';');

    var titleEl = document.createElement('div');
    if (isWarning) {
      titleEl.textContent = '\u26A0\uFE0F  WARNING  \u26A0\uFE0F';
      titleEl.style.cssText = 'font-size:24px;font-weight:700;margin-bottom:4px;color:#ffaa00;';
      box.appendChild(titleEl);

      if (title !== '') {
        var subtitleEl = document.createElement('div');
        subtitleEl.textContent = title;
        subtitleEl.style.cssText = 'font-size:18px;font-weight:500;color:#ccc;margin-bottom:12px;';
        box.appendChild(subtitleEl);
      }
    } else {
      titleEl.textContent = title;
      titleEl.style.cssText = 'font-size:22px;font-weight:600;margin-bottom:12px;';
      box.appendChild(titleEl);
    }

    var descEl = document.createElement('div');
    descEl.textContent = description;
    descEl.style.cssText = isWarning
      ? 'font-size:16px;color:#ddd;margin-bottom:24px;line-height:1.6;'
      : 'font-size:16px;color:#aaa;margin-bottom:24px;line-height:1.6;';
    box.appendChild(descEl);

    var btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:16px;justify-content:center;';

    var cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.cssText = [
      'background:transparent',
      'color:#aaa',
      'border:1px solid #555',
      'border-radius:18px',
      'padding:10px 28px',
      'font-size:16px',
      'cursor:pointer'
    ].join(';');

    var confirmBtn = document.createElement('button');
    confirmBtn.textContent = confirmLabel;
    confirmBtn.style.cssText = [
      isWarning ? 'background:#ffaa00' : 'background:#065fd4',
      'color:#fff',
      'border:none',
      'border-radius:18px',
      'padding:10px 28px',
      'font-size:16px',
      'font-weight:600',
      'cursor:pointer'
    ].join(';');

    cancelBtn.addEventListener('click', function () {
      backdrop.remove();
      resolve(false);
    });

    confirmBtn.addEventListener('click', function () {
      backdrop.remove();
      resolve(true);
    });

    btnRow.appendChild(cancelBtn);
    btnRow.appendChild(confirmBtn);
    box.appendChild(btnRow);
    backdrop.appendChild(box);
    document.body.appendChild(backdrop);
  });
}

function setOverlayLoading(isLoading) {
  var overlay = _overlayRef;
  if (!overlay) return;

  var copyBtn = overlay.querySelector('#yt-bulk-copy-btn');
  var moveBtn = overlay.querySelector('#yt-bulk-move-btn');
  var removeBtn = overlay.querySelector('#yt-bulk-remove-btn');
  if (copyBtn) copyBtn.disabled = isLoading || !getSelectedPlaylistId() || selectionState.getCount() === 0;
  if (moveBtn) moveBtn.disabled = isLoading || !getSelectedPlaylistId() || selectionState.getCount() === 0 || !getCurrentPlaylistId();
  if (removeBtn) removeBtn.disabled = isLoading || selectionState.getCount() === 0 || !getCurrentPlaylistId();

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
  // Logger.success('Overlay success:', message);
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

  // Logger.info('Playlist dropdown populated with ' + playlists.length + ' playlist(s)');
}

function getSelectedPlaylistId() {
  var overlay = _overlayRef;
  if (!overlay) return null;

  var select = overlay.querySelector('#yt-bulk-playlist-select');
  if (!select || !select.value) return null;

  return select.value;
}

// ─── Progress dialog ──────────────────────────────────────────────────────────

var _progressRef = null;
var _progressBarRef = null;
var _progressTextRef = null;

function showProgressDialog() {
  var existing = document.getElementById('yt-bulk-progress-dialog');
  if (existing) existing.remove();

  var backdrop = document.createElement('div');
  backdrop.id = 'yt-bulk-progress-dialog';
  backdrop.style.cssText = [
    'position:fixed',
    'top:0','left:0','right:0','bottom:0',
    'background:rgba(0,0,0,0.6)',
    'z-index:10000',
    'display:flex',
    'align-items:center',
    'justify-content:center',
    'font-family:"Roboto","Arial",sans-serif'
  ].join(';');

  var box = document.createElement('div');
  box.style.cssText = [
    'background:#212121',
    'color:#fff',
    'border-radius:12px',
    'padding:32px 40px',
    'max-width:480px',
    'width:90%',
    'box-shadow:0 8px 32px rgba(0,0,0,0.5)',
    'text-align:center'
  ].join(';');

  var titleEl = document.createElement('div');
  titleEl.textContent = '\u23F3  Processing...';
  titleEl.style.cssText = 'font-size:20px;font-weight:600;margin-bottom:16px;';

  var barOuter = document.createElement('div');
  barOuter.style.cssText = [
    'width:100%',
    'height:8px',
    'background:#444',
    'border-radius:4px',
    'overflow:hidden',
    'margin-bottom:16px'
  ].join(';');

  var barInner = document.createElement('div');
  barInner.id = 'yt-bulk-progress-bar';
  barInner.style.cssText = [
    'width:0%',
    'height:100%',
    'background:#065fd4',
    'border-radius:4px',
    'transition:width 0.3s ease'
  ].join(';');
  barOuter.appendChild(barInner);

  var textEl = document.createElement('div');
  textEl.id = 'yt-bulk-progress-text';
  textEl.textContent = 'Starting...';
  textEl.style.cssText = 'font-size:15px;color:#ccc;margin-bottom:20px;line-height:1.5;';

  var noteEl = document.createElement('div');
  noteEl.textContent = 'Please wait \u2014 do not close or leave this tab.';
  noteEl.style.cssText = 'font-size:13px;color:#888;';

  box.appendChild(titleEl);
  box.appendChild(barOuter);
  box.appendChild(textEl);
  box.appendChild(noteEl);
  backdrop.appendChild(box);
  document.body.appendChild(backdrop);

  _progressRef = backdrop;
  _progressBarRef = barInner;
  _progressTextRef = textEl;
}

function updateProgress(message, percent) {
  if (_progressTextRef) {
    _progressTextRef.textContent = message;
  }
  if (_progressBarRef && typeof percent === 'number') {
    _progressBarRef.style.width = Math.min(100, Math.max(0, percent)) + '%';
  }
}

function hideProgressDialog() {
  if (_progressRef) {
    _progressRef.remove();
    _progressRef = null;
    _progressBarRef = null;
    _progressTextRef = null;
  }
}
