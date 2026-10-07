import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadUserscript } from './load.js';

let m;
beforeEach(() => {
  document.body.innerHTML = '';
  m = loadUserscript();
});

describe('SelectionState', () => {
  it('adds, removes, toggles without duplicates and notifies', () => {
    const s = new m.SelectionState();
    const events = [];
    const listener = (e) => events.push(e.detail.count);
    document.addEventListener('yt-bulk-selection-changed', listener);
    s.add('a');
    s.add('a');
    s.toggle('b');
    s.toggle('a');
    s.remove('zzz');
    expect(s.getAll()).toEqual(['b']);
    expect(s.has('b')).toBe(true);
    expect(events).toEqual([1, 2, 1]);
    s.lastCheckedIndex = 3;
    s.clear();
    expect(s.getCount()).toBe(0);
    expect(s.lastCheckedIndex).toBeNull();
    document.removeEventListener('yt-bulk-selection-changed', listener);
  });

  it('getAll returns a copy', () => {
    const s = new m.SelectionState();
    s.add('a');
    s.getAll().push('b');
    expect(s.getCount()).toBe(1);
  });
});

function addRow(id) {
  const row = document.createElement('ytd-playlist-video-renderer');
  row.innerHTML = `<div id="content"><a id="video-title" href="/watch?v=${id}&list=PL1">t</a></div>`;
  document.body.appendChild(row);
  return row;
}

describe('checkbox shift-click range selection', () => {
  it('selects and deselects a contiguous range with shift', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ids = ['id000000000', 'id000000001', 'id000000002', 'id000000003', 'id000000004'];
    ids.forEach((id) => m.injectCheckbox(addRow(id)));
    const boxes = [...document.querySelectorAll('input[data-video-id]')];
    expect(boxes).toHaveLength(5);

    boxes[1].click();
    boxes[3].dispatchEvent(
      new MouseEvent('click', { shiftKey: true, bubbles: true, cancelable: true }),
    );
    expect(m.selectionState.getAll().sort()).toEqual(ids.slice(1, 4));
    expect(boxes.map((b) => b.checked)).toEqual([false, true, true, true, false]);

    // shift-click an already checked box: unchecks the range back to the anchor
    boxes[0].click();
    boxes[2].dispatchEvent(
      new MouseEvent('click', { shiftKey: true, bubbles: true, cancelable: true }),
    );
    expect(m.selectionState.getAll().sort()).toEqual([ids[3]]);
  });

  it('does not inject twice and needs a video id', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const row = addRow('id000000000');
    m.injectCheckbox(row);
    m.injectCheckbox(row);
    expect(row.querySelectorAll('input')).toHaveLength(1);

    const bad = document.createElement('ytd-playlist-video-renderer');
    bad.innerHTML = '<div id="content"><a id="video-title" href="/shorts/x">t</a></div>';
    m.injectCheckbox(bad);
    expect(bad.querySelector('input')).toBeNull();
  });
});
