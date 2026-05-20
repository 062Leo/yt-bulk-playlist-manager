// state.js – Selection state manager (singleton)

class SelectionState {
  constructor() {
    this._selectedIds = [];
    this.lastCheckedIndex = null;
  }

  _notify() {
    document.dispatchEvent(new CustomEvent('yt-bulk-selection-changed', {
      detail: {
        count: this._selectedIds.length,
        ids: this._selectedIds.slice()
      }
    }));
  }

  add(videoId) {
    if (this._selectedIds.indexOf(videoId) !== -1) return;
    this._selectedIds.push(videoId);
    Logger.debug('Selection add:', videoId);
    this._notify();
  }

  remove(videoId) {
    var idx = this._selectedIds.indexOf(videoId);
    if (idx === -1) return;
    this._selectedIds.splice(idx, 1);
    Logger.debug('Selection remove:', videoId);
    this._notify();
  }

  toggle(videoId) {
    if (this.has(videoId)) {
      this.remove(videoId);
    } else {
      this.add(videoId);
    }
  }

  clear() {
    this._selectedIds = [];
    this.lastCheckedIndex = null;
    Logger.info('Selection cleared');
    this._notify();
  }

  getAll() {
    return this._selectedIds.slice();
  }

  getCount() {
    return this._selectedIds.length;
  }

  has(videoId) {
    return this._selectedIds.indexOf(videoId) !== -1;
  }
}

var selectionState = new SelectionState();
