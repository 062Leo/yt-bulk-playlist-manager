// playlists.js – Fetches the user's playlist list and checks for existing videos via YouTube's internal browse endpoint

async function fetchUserPlaylists(session) {
  var endpoint = CONFIG.BROWSE_ENDPOINT + '?key=' + session.apiKey;
  var browseId = 'FEplaylist_aggregation';

  Logger.info('Fetching user playlists...');

  var headers = { 'Content-Type': 'application/json' };
  if (session.authHeaders) {
    Object.assign(headers, session.authHeaders);
  }

  var res = await fetch(endpoint, {
    method: 'POST',
    credentials: 'include',
    headers: headers,
    body: JSON.stringify({
      context: session.context,
      browseId: browseId
    })
  });

  if (!res.ok) {
    throw ApiError.fromResponse(res);
  }

  var data = await res.json();

  var items;
  try {
    if (data.contents && data.contents.twoColumnBrowseResultsRenderer) {
      var tabs = data.contents.twoColumnBrowseResultsRenderer.tabs;
      for (var t = 0; t < tabs.length; t++) {
        var tabContent = tabs[t].tabRenderer && tabs[t].tabRenderer.content;
        if (!tabContent) continue;
        if (tabContent.sectionListRenderer) {
          items = tabContent.sectionListRenderer.contents;
          break;
        }
        if (tabContent.gridRenderer) {
          items = tabContent.gridRenderer.items;
          break;
        }
        if (tabContent.richGridRenderer) {
          items = tabContent.richGridRenderer.contents;
          break;
        }
      }
    }

    if (!items && data.contents && data.contents.singleColumnBrowseResultsRenderer) {
      var stabs = data.contents.singleColumnBrowseResultsRenderer.tabs;
      var scontent = stabs[0].tabRenderer.content;
      items = (scontent.sectionListRenderer || scontent.gridRenderer || scontent.richGridRenderer || {}).contents ||
              (scontent.sectionListRenderer || scontent.gridRenderer || scontent.richGridRenderer || {}).items;
    }

    if (!items && data.contents) {
      var c = data.contents;
      if (c.sectionListRenderer) items = c.sectionListRenderer.contents;
      else if (c.gridRenderer) items = c.gridRenderer.items;
      else if (c.richGridRenderer) items = c.richGridRenderer.contents;
    }

    if (!items && Array.isArray(data.contents)) {
      items = data.contents;
    }
  } catch (e) {
    throw new ParseError(
      'Failed to navigate playlist response tree: ' + e.message +
      '. Top-level response keys: ' + JSON.stringify(Object.keys(data))
    );
  }

  if (!items) {
    throw new ParseError(
      'No playlist items found in response. contents keys: ' +
      JSON.stringify(data.contents ? Object.keys(data.contents) : 'null')
    );
  }

  var playlists = [];

  for (var i = 0; i < items.length; i++) {
    var item = items[i];

    if (item.richItemRenderer) {
      item = item.richItemRenderer.content;
    }

    if (item.lockupViewModel) {
      var vm = item.lockupViewModel;
      var plId = vm.contentId;
      var title = vm.metadata && vm.metadata.lockupMetadataViewModel &&
                  vm.metadata.lockupMetadataViewModel.title &&
                  vm.metadata.lockupMetadataViewModel.title.content;
      if (plId && title) {
        playlists.push({ playlistId: plId, title: title });
      }
      continue;
    }

    var renderer = item.gridPlaylistRenderer || item.playlistRenderer;

    if (item.gridRenderer && item.gridRenderer.items) {
      for (var j = 0; j < item.gridRenderer.items.length; j++) {
        var subItem = item.gridRenderer.items[j];
        var subRenderer = subItem.gridPlaylistRenderer || subItem.playlistRenderer;
        if (subRenderer && subRenderer.playlistId && subRenderer.title && subRenderer.title.runs) {
          playlists.push({
            playlistId: subRenderer.playlistId,
            title: subRenderer.title.runs[0].text
          });
        }
      }
      continue;
    }

    if (renderer && renderer.playlistId && renderer.title && renderer.title.runs && renderer.title.runs.length > 0) {
      playlists.push({
        playlistId: renderer.playlistId,
        title: renderer.title.runs[0].text
      });
    }
  }

  Logger.success('Fetched', playlists.length, 'playlist(s)');
  return playlists;
}

async function fetchPlaylistSetVideoIds(session, playlistId, targetVideoIds, maxPages) {
  if (maxPages === undefined) maxPages = 10;

  var endpoint = CONFIG.BROWSE_ENDPOINT + '?key=' + session.apiKey;
  var browseId = 'VL' + playlistId;
  var videoIdToSetId = {};
  var targetSet = {};
  for (var i = 0; i < targetVideoIds.length; i++) {
    targetSet[targetVideoIds[i]] = true;
  }
  var remaining = targetVideoIds.length;

  var headers = { 'Content-Type': 'application/json' };
  if (session.authHeaders) {
    Object.assign(headers, session.authHeaders);
  }

  var continuationToken = null;

  for (var page = 0; page < maxPages && remaining > 0; page++) {
    var body = { context: session.context, browseId: browseId };
    if (continuationToken) {
      body = { context: session.context, continuation: continuationToken };
    }

    var res;
    try {
      res = await fetch(endpoint, {
        method: 'POST',
        credentials: 'include',
        headers: headers,
        body: JSON.stringify(body)
      });
    } catch (e) {
      Logger.warn('Failed to fetch playlist contents for setVideoId lookup:', e.message);
      break;
    }

    if (!res.ok) {
      Logger.warn('fetchPlaylistSetVideoIds: HTTP', res.status, 'for page', page);
      break;
    }

    var data = await res.json();

    Logger.debug('fetchPlaylistSetVideoIds page', page, 'response keys:', Object.keys(data).join(', '));

    var contents = null;
    try {
      if (continuationToken) {
        contents = (data.onResponseReceivedActions &&
                    data.onResponseReceivedActions[0] &&
                    data.onResponseReceivedActions[0].appendContinuationItemsAction &&
                    data.onResponseReceivedActions[0].appendContinuationItemsAction.continuationItems);
      } else {
        var topContents = data.contents;

        function deepFind(obj, targetKey) {
          if (!obj || typeof obj !== 'object') return null;
          if (obj[targetKey]) return obj[targetKey];
          for (var key in obj) {
            if (!obj.hasOwnProperty(key)) continue;
            var found = deepFind(obj[key], targetKey);
            if (found) return found;
          }
          return null;
        }

        var pvl = deepFind(topContents, 'playlistVideoListRenderer');
        var contents = pvl && pvl.contents;
      }
    } catch (e) {
      Logger.warn('Failed to parse playlist contents:', e.message);
      break;
    }

    if (!contents) {
      Logger.warn('fetchPlaylistSetVideoIds: no contents found on page', page);
      break;
    }

    Logger.debug('fetchPlaylistSetVideoIds: found', contents.length, 'items on page', page);

    for (var c = 0; c < contents.length; c++) {
      var item = contents[c];
      if (item.continuationItemRenderer) {
        continuationToken = item.continuationItemRenderer.continuationEndpoint &&
                            item.continuationItemRenderer.continuationEndpoint.continuationCommand &&
                            item.continuationItemRenderer.continuationEndpoint.continuationCommand.token;
        continue;
      }

      var renderer = item.playlistVideoRenderer;
      if (renderer && renderer.videoId && targetSet[renderer.videoId]) {
        var setVideoId = renderer.setVideoId;
        if (setVideoId) {
          videoIdToSetId[renderer.videoId] = setVideoId;
          remaining--;
          if (remaining === 0) break;
        }
      }

      if (!renderer) {
        var lockupVm = item.richItemRenderer &&
                       item.richItemRenderer.content &&
                       item.richItemRenderer.content.lockupViewModel;
        if (lockupVm && lockupVm.contentId && targetSet[lockupVm.contentId]) {
          var lockupSetVideoId = lockupVm.setVideoId || lockupVm.playlistSetVideoId;
          if (lockupSetVideoId) {
            videoIdToSetId[lockupVm.contentId] = lockupSetVideoId;
            remaining--;
            if (remaining === 0) break;
          }
        }
      }
    }

    if (!continuationToken) break;
  }

  Logger.debug('fetchPlaylistSetVideoIds result:', JSON.stringify(videoIdToSetId));

  return videoIdToSetId;
}

async function fetchPlaylistVideoIds(session, playlistId, targetIds, maxPages) {
  if (maxPages === undefined) maxPages = 10;

  var endpoint = CONFIG.BROWSE_ENDPOINT + '?key=' + session.apiKey;
  var browseId = 'VL' + playlistId;
  var foundIds = [];
  var targetSet = {};
  for (var i = 0; i < targetIds.length; i++) {
    targetSet[targetIds[i]] = true;
  }
  var remaining = targetIds.length;

  var headers = { 'Content-Type': 'application/json' };
  if (session.authHeaders) {
    Object.assign(headers, session.authHeaders);
  }

  var continuationToken = null;

  for (var page = 0; page < maxPages && remaining > 0; page++) {
    var body = { context: session.context, browseId: browseId };
    if (continuationToken) {
      body = { context: session.context, continuation: continuationToken };
    }

    var res;
    try {
      res = await fetch(endpoint, {
        method: 'POST',
        credentials: 'include',
        headers: headers,
        body: JSON.stringify(body)
      });
    } catch (e) {
      Logger.warn('Failed to fetch playlist contents for duplicate check:', e.message);
      break;
    }

    if (!res.ok) break;

    var data = await res.json();

    var contents = null;
    try {
      if (continuationToken) {
        contents = (data.onResponseReceivedActions &&
                    data.onResponseReceivedActions[0] &&
                    data.onResponseReceivedActions[0].appendContinuationItemsAction &&
                    data.onResponseReceivedActions[0].appendContinuationItemsAction.continuationItems);
      } else {
        var topContents = data.contents;

        function deepFind2(obj, targetKey) {
          if (!obj || typeof obj !== 'object') return null;
          if (obj[targetKey]) return obj[targetKey];
          for (var key in obj) {
            if (!obj.hasOwnProperty(key)) continue;
            var found = deepFind2(obj[key], targetKey);
            if (found) return found;
          }
          return null;
        }

        var pvl2 = deepFind2(topContents, 'playlistVideoListRenderer');
        var contents = pvl2 && pvl2.contents;
      }
    } catch (e) {
      Logger.warn('Failed to parse playlist contents:', e.message);
      break;
    }

    if (!contents) break;

    for (var c = 0; c < contents.length; c++) {
      var item = contents[c];
      if (item.continuationItemRenderer) {
        continuationToken = item.continuationItemRenderer.continuationEndpoint &&
                            item.continuationItemRenderer.continuationEndpoint.continuationCommand &&
                            item.continuationItemRenderer.continuationEndpoint.continuationCommand.token;
        continue;
      }

      var videoId = (item.playlistVideoRenderer && item.playlistVideoRenderer.videoId) ||
                    (item.richItemRenderer &&
                     item.richItemRenderer.content &&
                     item.richItemRenderer.content.lockupViewModel &&
                     item.richItemRenderer.content.lockupViewModel.contentId);

      if (videoId && targetSet[videoId]) {
        foundIds.push(videoId);
        remaining--;
        if (remaining === 0) break;
      }
    }

    if (!continuationToken) break;
  }

  return foundIds;
}
