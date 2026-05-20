'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var sandbox = {
  Error: Error,
  Array: Array,
  Object: Object,
  window: {},
  document: {
    dispatchEvent: function () {}
  },
  console: {
    log: function () {},
    warn: function () {},
    error: function () {},
    group: function () {},
    groupEnd: function () {}
  },
  CustomEvent: class CustomEvent {
    constructor(type, options) {
      this.type = type;
      this.detail = options ? options.detail : undefined;
    }
  },
  fetch: function () {
    return Promise.resolve({ ok: true, status: 200, statusText: 'OK', url: 'https://example.com' });
  },
  Promise: Promise,
  setTimeout: setTimeout
};

vm.createContext(sandbox);

var srcDir = path.join(__dirname, '..', 'src');

function load(relativePath, exportNames) {
  var filePath = path.join(srcDir, relativePath);
  var code = fs.readFileSync(filePath, 'utf8');
  var exportCode = exportNames.map(function (name) {
    return 'globalThis.' + name + ' = ' + name + ';';
  }).join('\n');
  vm.runInContext(code + '\n' + exportCode, sandbox, { filename: filePath });
}

load('core/config.js', ['CONFIG']);
load('core/logger.js', ['Logger']);
load('core/errors.js', ['SessionError', 'ApiError', 'InjectionError', 'ParseError']);
load('ui/state.js', ['SelectionState']);
load('api/dispatcher.js', []);

var logCalls = [];
var warnCalls = [];
var errorCalls = [];

sandbox.console.log = function () {
  logCalls.push(Array.prototype.slice.call(arguments));
};
sandbox.console.warn = function () {
  warnCalls.push(Array.prototype.slice.call(arguments));
};
sandbox.console.error = function () {
  errorCalls.push(Array.prototype.slice.call(arguments));
};

function clearSpies() {
  logCalls.length = 0;
  warnCalls.length = 0;
  errorCalls.length = 0;
}

var dispatchEvents = [];
sandbox.document.dispatchEvent = function (event) {
  dispatchEvents.push(event);
};

function clearDispatch() {
  dispatchEvents.length = 0;
}

var passed = 0;
var failed = 0;

async function test(name, fn) {
  try {
    var result = fn();
    if (result && typeof result.then === 'function') {
      await result;
    }
    passed++;
    console.log('PASS: ' + name);
  } catch (err) {
    failed++;
    console.log('FAIL: ' + name + ' — ' + err.message);
  }
}

async function run() {

  // ---- config.js ----

  await test('CONFIG is frozen', function () {
    assert.ok(Object.isFrozen(sandbox.CONFIG));
  });

  await test('CONFIG has all required keys with correct types', function () {
    var C = sandbox.CONFIG;
    var specs = {
      LOG_PREFIX: 'string',
      BATCH_CHUNK_SIZE: 'number',
      CHUNK_DELAY_MS: 'number',
      SESSION_POLL_MAX: 'number',
      SESSION_POLL_MS: 'number',
      OVERLAY_ID: 'string',
      MANAGED_CLASS: 'string',
      VIDEO_RENDERER: 'string',
      BROWSE_ENDPOINT: 'string',
      EDIT_PLAYLIST_ENDPOINT: 'string'
    };
    var keys = Object.keys(specs);
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      assert.ok(C.hasOwnProperty(key), 'Missing key: ' + key);
      assert.strictEqual(typeof C[key], specs[key], 'Wrong type for ' + key);
    }
    assert.strictEqual(keys.length, 10, 'Expected 10 keys, got ' + keys.length);
  });

  // ---- logger.js ----

  await test('Logger.info calls console.log with [YT-BULK] [INFO]', function () {
    clearSpies();
    sandbox.Logger.info('hello', 42);
    assert.strictEqual(logCalls.length, 1);
    assert.strictEqual(logCalls[0][0], '[YT-BULK]');
    assert.strictEqual(logCalls[0][1], '[INFO]');
    assert.strictEqual(logCalls[0][2], 'hello');
    assert.strictEqual(logCalls[0][3], 42);
  });

  await test('Logger.success calls console.log with [YT-BULK] [SUCCESS]', function () {
    clearSpies();
    sandbox.Logger.success('done');
    assert.strictEqual(logCalls.length, 1);
    assert.strictEqual(logCalls[0][0], '[YT-BULK]');
    assert.strictEqual(logCalls[0][1], '[SUCCESS]');
    assert.strictEqual(logCalls[0][2], 'done');
  });

  await test('Logger.warn calls console.warn with [YT-BULK] [WARN]', function () {
    clearSpies();
    sandbox.Logger.warn('careful');
    assert.strictEqual(warnCalls.length, 1);
    assert.strictEqual(warnCalls[0][0], '[YT-BULK]');
    assert.strictEqual(warnCalls[0][1], '[WARN]');
    assert.strictEqual(warnCalls[0][2], 'careful');
  });

  await test('Logger.error calls console.error with [YT-BULK] [ERROR]', function () {
    clearSpies();
    sandbox.Logger.error('fatal');
    assert.strictEqual(errorCalls.length, 1);
    assert.strictEqual(errorCalls[0][0], '[YT-BULK]');
    assert.strictEqual(errorCalls[0][1], '[ERROR]');
    assert.strictEqual(errorCalls[0][2], 'fatal');
  });

  await test('Logger.debug calls console.log with [YT-BULK] [DEBUG]', function () {
    clearSpies();
    sandbox.Logger.debug('trace');
    assert.strictEqual(logCalls.length, 1);
    assert.strictEqual(logCalls[0][0], '[YT-BULK]');
    assert.strictEqual(logCalls[0][1], '[DEBUG]');
    assert.strictEqual(logCalls[0][2], 'trace');
  });

  // ---- errors.js ----

  await test('SessionError has correct name and message, instanceof Error', function () {
    var err = new sandbox.SessionError('ytcfg unavailable');
    assert.ok(err instanceof Error);
    assert.strictEqual(err.name, 'SessionError');
    assert.strictEqual(err.message, 'ytcfg unavailable');
  });

  await test('ApiError has correct name, message, status, endpoint', function () {
    var err = new sandbox.ApiError('Not Found', 404, 'https://example.com/api');
    assert.ok(err instanceof Error);
    assert.strictEqual(err.name, 'ApiError');
    assert.strictEqual(err.message, 'Not Found');
    assert.strictEqual(err.status, 404);
    assert.strictEqual(err.endpoint, 'https://example.com/api');
  });

  await test('ApiError.fromResponse creates error from mock Response', function () {
    var mockRes = {
      status: 500,
      statusText: 'Internal Server Error',
      url: 'https://www.youtube.com/youtubei/v1/browse/edit_playlist'
    };
    var err = sandbox.ApiError.fromResponse(mockRes);
    assert.strictEqual(err.name, 'ApiError');
    assert.strictEqual(err.message, 'HTTP 500: Internal Server Error');
    assert.strictEqual(err.status, 500);
    assert.strictEqual(err.endpoint, 'https://www.youtube.com/youtubei/v1/browse/edit_playlist');
  });

  await test('ApiError.fromResponse handles 429 rate-limit response', function () {
    var mockRes = {
      status: 429,
      statusText: 'Too Many Requests',
      url: 'https://www.youtube.com/youtubei/v1/browse'
    };
    var err = sandbox.ApiError.fromResponse(mockRes);
    assert.strictEqual(err.name, 'ApiError');
    assert.strictEqual(err.status, 429);
    assert.strictEqual(err.endpoint, 'https://www.youtube.com/youtubei/v1/browse');
  });

  await test('InjectionError has correct name and message', function () {
    var err = new sandbox.InjectionError('DOM element missing');
    assert.ok(err instanceof Error);
    assert.strictEqual(err.name, 'InjectionError');
    assert.strictEqual(err.message, 'DOM element missing');
  });

  await test('ParseError has correct name and message', function () {
    var err = new sandbox.ParseError('Unexpected JSON structure');
    assert.ok(err instanceof Error);
    assert.strictEqual(err.name, 'ParseError');
    assert.strictEqual(err.message, 'Unexpected JSON structure');
  });

  // ---- state.js ----

  await test('SelectionState add, has, getCount, getAll', function () {
    clearSpies();
    clearDispatch();
    var state = new sandbox.SelectionState();
    state.add('vid1');
    assert.strictEqual(state.has('vid1'), true);
    assert.strictEqual(state.has('vid2'), false);
    assert.strictEqual(state.getCount(), 1);
    var all = state.getAll();
    assert.strictEqual(all.length, 1);
    assert.strictEqual(all[0], 'vid1');
    assert.strictEqual(dispatchEvents.length, 1);
    assert.strictEqual(dispatchEvents[0].type, 'yt-bulk-selection-changed');
    assert.strictEqual(dispatchEvents[0].detail.count, 1);
    assert.strictEqual(dispatchEvents[0].detail.ids.length, 1);
    assert.strictEqual(dispatchEvents[0].detail.ids[0], 'vid1');
  });

  await test('SelectionState add duplicate does not increase count', function () {
    clearSpies();
    clearDispatch();
    var state = new sandbox.SelectionState();
    state.add('vid1');
    clearDispatch();
    state.add('vid1');
    assert.strictEqual(state.getCount(), 1);
    assert.strictEqual(dispatchEvents.length, 0);
  });

  await test('SelectionState remove existing id', function () {
    clearSpies();
    clearDispatch();
    var state = new sandbox.SelectionState();
    state.add('vid1');
    state.add('vid2');
    clearDispatch();
    state.remove('vid1');
    assert.strictEqual(state.has('vid1'), false);
    assert.strictEqual(state.has('vid2'), true);
    assert.strictEqual(state.getCount(), 1);
    var all2 = state.getAll();
    assert.strictEqual(all2.length, 1);
    assert.strictEqual(all2[0], 'vid2');
    assert.strictEqual(dispatchEvents.length, 1);
    assert.strictEqual(dispatchEvents[0].detail.count, 1);
  });

  await test('SelectionState remove non-existent id does nothing', function () {
    clearSpies();
    clearDispatch();
    var state = new sandbox.SelectionState();
    state.add('vid1');
    clearDispatch();
    state.remove('nonexistent');
    assert.strictEqual(state.getCount(), 1);
    assert.strictEqual(dispatchEvents.length, 0);
  });

  await test('SelectionState toggle adds then removes', function () {
    clearSpies();
    clearDispatch();
    var state = new sandbox.SelectionState();
    state.toggle('vid1');
    assert.strictEqual(state.has('vid1'), true);
    state.toggle('vid1');
    assert.strictEqual(state.has('vid1'), false);
    assert.strictEqual(state.getCount(), 0);
  });

  await test('SelectionState clear empties selection and resets lastCheckedIndex', function () {
    clearSpies();
    clearDispatch();
    var state = new sandbox.SelectionState();
    state.add('vid1');
    state.add('vid2');
    state.lastCheckedIndex = 5;
    clearDispatch();
    state.clear();
    assert.strictEqual(state.getCount(), 0);
    assert.strictEqual(state.lastCheckedIndex, null);
    assert.strictEqual(state.getAll().length, 0);
    assert.strictEqual(dispatchEvents.length, 1);
    assert.strictEqual(dispatchEvents[0].detail.count, 0);
  });

  await test('selectionState singleton exists and is correct type', function () {
    assert.ok(sandbox.selectionState instanceof sandbox.SelectionState);
    assert.strictEqual(sandbox.selectionState.getCount(), 0);
  });

  await test('SelectionState getAll returns a copy, not a reference', function () {
    var state = new sandbox.SelectionState();
    state.add('vid1');
    var all = state.getAll();
    all.push('vid2');
    assert.strictEqual(state.getCount(), 1);
    assert.strictEqual(state.getAll().length, 1);
    assert.strictEqual(state.getAll()[0], 'vid1');
  });

  // ---- dispatcher.js ----

  await test('chunkArray splits 105 items into chunks of 50, 50, 5', function () {
    var arr = [];
    for (var i = 1; i <= 105; i++) {
      arr.push(i);
    }
    var chunks = sandbox.chunkArray(arr, 50);
    assert.strictEqual(chunks.length, 3);
    assert.strictEqual(chunks[0].length, 50);
    assert.strictEqual(chunks[1].length, 50);
    assert.strictEqual(chunks[2].length, 5);
    assert.strictEqual(chunks[0][0], 1);
    assert.strictEqual(chunks[0][49], 50);
    assert.strictEqual(chunks[1][0], 51);
    assert.strictEqual(chunks[1][49], 100);
    assert.strictEqual(chunks[2][0], 101);
    assert.strictEqual(chunks[2][4], 105);
  });

  await test('chunkArray with empty array returns empty array', function () {
    var chunks = sandbox.chunkArray([], 50);
    assert.strictEqual(chunks.length, 0);
    assert.ok(Array.isArray(chunks));
  });

  await test('chunkArray with array smaller than chunk size returns one chunk', function () {
    var chunks = sandbox.chunkArray([1, 2, 3], 50);
    assert.strictEqual(chunks.length, 1);
    assert.strictEqual(chunks[0].length, 3);
    assert.deepStrictEqual(chunks[0], [1, 2, 3]);
  });

  await test('chunkArray with exact multiple chunk size', function () {
    var arr = [];
    for (var i = 0; i < 100; i++) {
      arr.push(i);
    }
    var chunks = sandbox.chunkArray(arr, 50);
    assert.strictEqual(chunks.length, 2);
    assert.strictEqual(chunks[0].length, 50);
    assert.strictEqual(chunks[1].length, 50);
  });

  await test('sleep returns a Promise', function () {
    var p = sandbox.sleep(10);
    assert.ok(p instanceof Promise);
  });

  await test('sleep resolves after delay', async function () {
    var start = Date.now();
    await sandbox.sleep(25);
    var elapsed = Date.now() - start;
    assert.ok(elapsed >= 20, 'sleep resolved too quickly: ' + elapsed + 'ms');
  });

  // ---- Results ----

  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed > 0 ? 1 : 0);
}

run();
