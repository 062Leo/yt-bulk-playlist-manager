// importDialog.js – Modal dialogs for the SongVoyage import (choose target, error, result)

var IMPORT_DIALOG_ID = 'yt-bulk-import-dialog';

function _el(tag, cssText, text) {
  var el = document.createElement(tag);
  if (cssText) el.style.cssText = cssText;
  if (text !== undefined) el.textContent = text;
  return el;
}

var _IMPORT_INPUT_CSS = [
  'background:#303030',
  'color:#fff',
  'border:1px solid #444',
  'border-radius:4px',
  'padding:8px',
  'font-size:14px',
  'width:100%',
  'box-sizing:border-box',
].join(';');

var _IMPORT_PRIMARY_BTN_CSS = [
  'background:#065fd4',
  'color:#fff',
  'border:none',
  'border-radius:18px',
  'padding:10px 28px',
  'font-size:16px',
  'font-weight:600',
  'cursor:pointer',
].join(';');

var _IMPORT_SECONDARY_BTN_CSS = [
  'background:transparent',
  'color:#aaa',
  'border:1px solid #555',
  'border-radius:18px',
  'padding:10px 28px',
  'font-size:16px',
  'cursor:pointer',
].join(';');

/** Creates the backdrop + box, removing an older import dialog. Returns {backdrop, box}. */
function _createImportModal() {
  var existing = document.getElementById(IMPORT_DIALOG_ID);
  if (existing) existing.remove();

  var backdrop = _el(
    'div',
    [
      'position:fixed',
      'top:0',
      'left:0',
      'right:0',
      'bottom:0',
      'background:rgba(0,0,0,0.6)',
      'z-index:10001',
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'font-family:"Roboto","Arial",sans-serif',
    ].join(';'),
  );
  backdrop.id = IMPORT_DIALOG_ID;
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');

  var box = _el(
    'div',
    [
      'background:#212121',
      'color:#fff',
      'border-radius:12px',
      'padding:28px 32px',
      'max-width:520px',
      'width:92%',
      'box-shadow:0 8px 32px rgba(0,0,0,0.5)',
      'text-align:left',
      'font-size:14px',
      'line-height:1.5',
    ].join(';'),
  );
  backdrop.appendChild(box);
  document.body.appendChild(backdrop);
  return { backdrop: backdrop, box: box };
}

function _importTitle(text) {
  return _el('div', 'font-size:22px;font-weight:600;margin-bottom:12px;text-align:center;', text);
}

function _buttonRow() {
  return _el('div', 'display:flex;gap:16px;justify-content:center;margin-top:20px;');
}

/**
 * Asks where to import. opts:
 *   count, title, note (optional string),
 *   loadPlaylists(): Promise<[{playlistId, title}]>,
 *   findExisting(playlistId): Promise<string[]> – ids already in that playlist.
 * Resolves null on cancel, else
 *   {mode: 'new', title, privacy} or {mode: 'existing', playlistId, playlistTitle, existingIds}.
 */
function showImportDialog(opts) {
  return new Promise(function (resolve) {
    var modal = _createImportModal();
    var box = modal.box;

    box.appendChild(
      _importTitle(
        'Import ' + opts.count + ' ' + pluralize(opts.count, 'song') + ' from SongVoyage',
      ),
    );
    if (opts.note) {
      box.appendChild(_el('div', 'color:#aaa;text-align:center;margin-bottom:12px;', opts.note));
    }

    // ---- Mode: new playlist ----
    var newLabel = _el('label', 'display:flex;gap:8px;align-items:center;margin-top:8px;');
    var newRadio = _el('input');
    newRadio.type = 'radio';
    newRadio.name = 'yt-bulk-import-mode';
    newRadio.value = 'new';
    newRadio.checked = true;
    newLabel.appendChild(newRadio);
    newLabel.appendChild(_el('span', 'font-weight:500;', 'Create new playlist'));
    box.appendChild(newLabel);

    var newFields = _el('div', 'display:flex;gap:8px;margin:8px 0 0 24px;');
    var nameInput = _el('input', _IMPORT_INPUT_CSS);
    nameInput.id = 'yt-bulk-import-name';
    nameInput.type = 'text';
    nameInput.maxLength = 150;
    nameInput.value = opts.title;
    nameInput.setAttribute('aria-label', 'Playlist name');
    var privacySelect = _el('select', _IMPORT_INPUT_CSS + ';width:auto;');
    privacySelect.id = 'yt-bulk-import-privacy';
    privacySelect.setAttribute('aria-label', 'Privacy');
    [
      ['PRIVATE', 'Private'],
      ['UNLISTED', 'Unlisted'],
      ['PUBLIC', 'Public'],
    ].forEach(function (p) {
      var o = _el('option', '', p[1]);
      o.value = p[0];
      privacySelect.appendChild(o);
    });
    newFields.appendChild(nameInput);
    newFields.appendChild(privacySelect);
    box.appendChild(newFields);

    // ---- Mode: existing playlist ----
    var existingLabel = _el('label', 'display:flex;gap:8px;align-items:center;margin-top:16px;');
    var existingRadio = _el('input');
    existingRadio.type = 'radio';
    existingRadio.name = 'yt-bulk-import-mode';
    existingRadio.value = 'existing';
    existingLabel.appendChild(existingRadio);
    existingLabel.appendChild(_el('span', 'font-weight:500;', 'Add to existing playlist'));
    box.appendChild(existingLabel);

    var existingFields = _el('div', 'margin:8px 0 0 24px;');
    var playlistSelect = _el('select', _IMPORT_INPUT_CSS);
    playlistSelect.id = 'yt-bulk-import-playlist';
    playlistSelect.setAttribute('aria-label', 'Target playlist');
    var placeholder = _el('option', '', 'Loading playlists…');
    placeholder.value = '';
    playlistSelect.appendChild(placeholder);
    playlistSelect.disabled = true;
    var dupInfo = _el('div', 'color:#ffaa00;margin-top:6px;min-height:21px;');
    dupInfo.id = 'yt-bulk-import-dupes';
    existingFields.appendChild(playlistSelect);
    existingFields.appendChild(dupInfo);
    box.appendChild(existingFields);

    // ---- Buttons ----
    var row = _buttonRow();
    var cancelBtn = _el('button', _IMPORT_SECONDARY_BTN_CSS, 'Cancel');
    cancelBtn.id = 'yt-bulk-import-cancel';
    var confirmBtn = _el('button', _IMPORT_PRIMARY_BTN_CSS, 'Import');
    confirmBtn.id = 'yt-bulk-import-confirm';
    row.appendChild(cancelBtn);
    row.appendChild(confirmBtn);
    box.appendChild(row);

    var playlistsLoaded = false;
    var existingIds = null;
    var checkToken = 0;

    function mode() {
      return existingRadio.checked ? 'existing' : 'new';
    }

    function refresh() {
      var isNew = mode() === 'new';
      nameInput.disabled = !isNew;
      privacySelect.disabled = !isNew;
      playlistSelect.disabled = isNew || !playlistsLoaded;
      if (isNew) {
        confirmBtn.disabled = nameInput.value.trim() === '';
      } else {
        confirmBtn.disabled = !playlistSelect.value || existingIds === null;
      }
      confirmBtn.style.opacity = confirmBtn.disabled ? '0.5' : '1';
    }

    function checkDuplicates() {
      existingIds = null;
      var playlistId = playlistSelect.value;
      if (!playlistId) {
        dupInfo.textContent = '';
        refresh();
        return;
      }
      var token = ++checkToken;
      dupInfo.textContent = 'Checking for songs already in this playlist…';
      refresh();
      Promise.resolve(opts.findExisting(playlistId))
        .then(function (ids) {
          if (token !== checkToken) return;
          existingIds = ids || [];
          dupInfo.textContent =
            existingIds.length > 0
              ? existingIds.length + ' already in playlist, will be skipped.'
              : 'No duplicates found.';
          refresh();
        })
        .catch(function (err) {
          if (token !== checkToken) return;
          Logger.warn('Duplicate check failed:', err && err.message);
          existingIds = [];
          dupInfo.textContent = 'Duplicate check failed – duplicates may be added.';
          refresh();
        });
    }

    function close(result) {
      document.removeEventListener('keydown', onKey, true);
      modal.backdrop.remove();
      resolve(result);
    }

    function onKey(e) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close(null);
      }
    }

    newRadio.addEventListener('change', refresh);
    existingRadio.addEventListener('change', refresh);
    nameInput.addEventListener('input', refresh);
    playlistSelect.addEventListener('change', checkDuplicates);
    cancelBtn.addEventListener('click', function () {
      close(null);
    });
    confirmBtn.addEventListener('click', function () {
      if (confirmBtn.disabled) return;
      if (mode() === 'new') {
        close({ mode: 'new', title: nameInput.value.trim(), privacy: privacySelect.value });
      } else {
        var opt = playlistSelect.options[playlistSelect.selectedIndex];
        close({
          mode: 'existing',
          playlistId: playlistSelect.value,
          playlistTitle: opt ? opt.textContent : '',
          existingIds: existingIds || [],
        });
      }
    });
    document.addEventListener('keydown', onKey, true);

    Promise.resolve()
      .then(opts.loadPlaylists)
      .then(function (playlists) {
        playlistsLoaded = true;
        placeholder.textContent =
          playlists && playlists.length ? '— Select playlist —' : '— No playlists found —';
        (playlists || []).forEach(function (pl) {
          var o = _el('option', '', pl.title);
          o.value = pl.playlistId;
          playlistSelect.appendChild(o);
        });
        refresh();
      })
      .catch(function (err) {
        Logger.error('Failed to load playlists for import:', err);
        placeholder.textContent = '— Failed to load playlists —';
        refresh();
      });

    refresh();
    nameInput.focus();
  });
}

/** Simple message dialog with one OK button. Resolves when closed. */
function showImportMessage(title, message) {
  return new Promise(function (resolve) {
    var modal = _createImportModal();
    modal.box.appendChild(_importTitle(title));
    modal.box.appendChild(
      _el('div', 'color:#ddd;text-align:center;white-space:pre-line;', message),
    );
    var row = _buttonRow();
    var ok = _el('button', _IMPORT_PRIMARY_BTN_CSS, 'OK');
    ok.id = 'yt-bulk-import-ok';
    ok.addEventListener('click', function () {
      modal.backdrop.remove();
      resolve();
    });
    row.appendChild(ok);
    modal.box.appendChild(row);
    ok.focus();
  });
}

/** Builds the result sentence: "Added N, skipped M (duplicates), failed K". */
function formatImportResult(result) {
  return (
    'Added ' +
    result.added +
    ', skipped ' +
    result.skipped +
    ' (duplicates), failed ' +
    result.failed
  );
}

/** Result dialog with a link to the playlist. */
function showImportResult(result) {
  return new Promise(function (resolve) {
    var modal = _createImportModal();
    modal.box.appendChild(
      _importTitle(result.failed > 0 ? 'Import finished with errors' : 'Import finished'),
    );
    var summary = _el('div', 'color:#ddd;text-align:center;', formatImportResult(result));
    summary.id = 'yt-bulk-import-summary';
    modal.box.appendChild(summary);
    if (result.error) {
      modal.box.appendChild(
        _el('div', 'color:#ff6b6b;text-align:center;margin-top:8px;', result.error),
      );
    }

    var row = _buttonRow();
    if (result.playlistId) {
      var link = _el('a', _IMPORT_PRIMARY_BTN_CSS + ';text-decoration:none;', 'Open playlist');
      link.id = 'yt-bulk-import-open';
      link.href = 'https://www.youtube.com/playlist?list=' + encodeURIComponent(result.playlistId);
      row.appendChild(link);
    }
    var close = _el('button', _IMPORT_SECONDARY_BTN_CSS, 'Close');
    close.id = 'yt-bulk-import-close';
    close.addEventListener('click', function () {
      modal.backdrop.remove();
      resolve();
    });
    row.appendChild(close);
    modal.box.appendChild(row);
  });
}
