// playlists.js – Fetches the user's playlist list and checks for existing videos via YouTube's internal browse endpoint

function _deepFind(obj, targetKey) {
  if (!obj || typeof obj !== 'object') return null;
  if (obj[targetKey]) return obj[targetKey];
  for (var key in obj) {
    if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;
    var found = _deepFind(obj[key], targetKey);
    if (found) return found;
  }
  return null;
}

function _continuationToken(renderer) {
  var ep = renderer.continuationEndpoint;
  if (ep && ep.continuationCommand) return ep.continuationCommand.token;
  if (ep && ep.command && ep.command.continuationCommand)
    return ep.command.continuationCommand.token;
  var btn = renderer.button && renderer.button.command;
  if (btn && btn.continuationCommand) return btn.continuationCommand.token;
  return null;
}

function _addPlaylist(playlists, entry) {
  for (var k = 0; k < playlists.length; k++) {
    if (playlists[k].playlistId === entry.playlistId) return;
  }
  playlists.push(entry);
}

// Finds the playlist item list in the first FEplaylist_aggregation page. Throws ParseError.
function _extractUserPlaylistItems(data) {
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
      items =
        (scontent.sectionListRenderer || scontent.gridRenderer || scontent.richGridRenderer || {})
          .contents ||
        (scontent.sectionListRenderer || scontent.gridRenderer || scontent.richGridRenderer || {})
          .items;
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
      'Failed to navigate playlist response tree: ' +
        e.message +
        '. Top-level response keys: ' +
        JSON.stringify(Object.keys(data)),
    );
  }

  if (!items) {
    throw new ParseError(
      'No playlist items found in response. contents keys: ' +
        JSON.stringify(data.contents ? Object.keys(data.contents) : 'null'),
    );
  }

  return items;
}

// Appends parsed playlists from one page of items; returns the next continuation token or null.
function _parseUserPlaylistItems(items, playlists) {
  var token = null;

  for (var i = 0; i < items.length; i++) {
    var item = items[i];

    if (item.continuationItemRenderer) {
      token = _continuationToken(item.continuationItemRenderer) || token;
      continue;
    }

    if (item.richItemRenderer) {
      item = item.richItemRenderer.content;
    }

    if (item.lockupViewModel) {
      var vm = item.lockupViewModel;
      var plId = vm.contentId;
      var title =
        vm.metadata &&
        vm.metadata.lockupMetadataViewModel &&
        vm.metadata.lockupMetadataViewModel.title &&
        vm.metadata.lockupMetadataViewModel.title.content;
      if (plId && title) {
        _addPlaylist(playlists, { playlistId: plId, title: title });
      }
      continue;
    }

    var renderer = item.gridPlaylistRenderer || item.playlistRenderer;

    if (item.gridRenderer && item.gridRenderer.items) {
      for (var j = 0; j < item.gridRenderer.items.length; j++) {
        var subItem = item.gridRenderer.items[j];
        var subRenderer = subItem.gridPlaylistRenderer || subItem.playlistRenderer;
        if (subRenderer && subRenderer.playlistId && subRenderer.title && subRenderer.title.runs) {
          _addPlaylist(playlists, {
            playlistId: subRenderer.playlistId,
            title: subRenderer.title.runs[0].text,
          });
        }
      }
      continue;
    }

    if (
      renderer &&
      renderer.playlistId &&
      renderer.title &&
      renderer.title.runs &&
      renderer.title.runs.length > 0
    ) {
      _addPlaylist(playlists, {
        playlistId: renderer.playlistId,
        title: renderer.title.runs[0].text,
      });
    }
  }

  return token;
}

async function fetchUserPlaylists(session, maxPages) {
  if (maxPages === undefined) maxPages = CONFIG.USER_PLAYLISTS_MAX_PAGES;
  var endpoint = CONFIG.BROWSE_ENDPOINT + '?key=' + session.apiKey;
  var browseId = 'FEplaylist_aggregation';

  var headers = await getRequestHeaders(session);
  var playlists = [];
  var continuationToken = null;

  for (var page = 0; page < maxPages; page++) {
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
        body: JSON.stringify(body),
      });
    } catch (e) {
      // The first page must succeed; later pages only extend the list.
      if (page === 0) throw e;
      Logger.warn('fetchUserPlaylists: page', page, 'failed:', e.message);
      break;
    }

    if (!res.ok) {
      if (page === 0) throw ApiError.fromResponse(res);
      Logger.warn('fetchUserPlaylists: HTTP', res.status, 'for page', page);
      break;
    }

    var data = await res.json();

    var items;
    if (page === 0) {
      items = _extractUserPlaylistItems(data);
    } else {
      var ra = data.onResponseReceivedActions;
      items =
        ra && ra[0] && ra[0].appendContinuationItemsAction
          ? ra[0].appendContinuationItemsAction.continuationItems
          : null;
      if (!items) {
        Logger.warn('fetchUserPlaylists: unknown continuation response format');
        break;
      }
    }

    continuationToken = _parseUserPlaylistItems(items, playlists);
    if (!continuationToken) break;
  }

  return playlists;
}

async function fetchPlaylistSetVideoIds(session, playlistId, targetVideoIds, maxPages) {
  if (maxPages === undefined) maxPages = CONFIG.PLAYLIST_SCAN_MAX_PAGES;

  var endpoint = CONFIG.BROWSE_ENDPOINT + '?key=' + session.apiKey;
  var browseId = 'VL' + playlistId;
  var videoIdToSetId = Object.create(null);
  var targetSet = Object.create(null);
  for (var i = 0; i < targetVideoIds.length; i++) {
    targetSet[targetVideoIds[i]] = true;
  }
  var remaining = Object.keys(targetSet).length;

  var headers = await getRequestHeaders(session);

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
        body: JSON.stringify(body),
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

    // Logger.debug('fetchPlaylistSetVideoIds page', page, 'response keys:', Object.keys(data).join(', '));

    var contents = null;
    try {
      if (continuationToken) {
        var ra = data.onResponseReceivedActions;
        if (ra && ra[0] && ra[0].appendContinuationItemsAction) {
          contents = ra[0].appendContinuationItemsAction.continuationItems;
        } else if (
          data.continuationContents &&
          data.continuationContents.playlistVideoListContinuation
        ) {
          contents = data.continuationContents.playlistVideoListContinuation.contents;
        } else {
          // Logger.debug('fetchPlaylistSetVideoIds: unknown continuation response format');
        }
      } else {
        var topContents = data.contents;
        if (!topContents) {
          Logger.warn('fetchPlaylistSetVideoIds: no contents in response for playlist', playlistId);
          break;
        }

        var pvl = _deepFind(topContents, 'playlistVideoListRenderer');
        if (pvl && pvl.contents) {
          contents = pvl.contents;
        } else {
          var rgr = _deepFind(topContents, 'richGridRenderer');
          if (rgr && rgr.contents) {
            contents = rgr.contents;
          } else {
            var slr = _deepFind(topContents, 'sectionListRenderer');
            if (slr && slr.contents) {
              for (var s = 0; s < slr.contents.length; s++) {
                var sub = slr.contents[s];
                if (sub.playlistVideoListRenderer && sub.playlistVideoListRenderer.contents) {
                  contents = sub.playlistVideoListRenderer.contents;
                  break;
                }
                if (
                  sub.richItemRenderer &&
                  sub.richItemRenderer.content &&
                  sub.richItemRenderer.content.playlistVideoRenderer
                ) {
                  contents = slr.contents;
                  break;
                }
              }
            }
          }
        }

        if (!contents) {
          Logger.warn('fetchPlaylistSetVideoIds: no known renderer structure found in response');
          break;
        }
      }
    } catch (e) {
      Logger.warn('Failed to parse playlist contents:', e.message);
      break;
    }

    if (!contents) {
      Logger.warn('fetchPlaylistSetVideoIds: no contents found on page', page);
      break;
    }

    // Logger.debug('fetchPlaylistSetVideoIds: found', contents.length, 'items on page', page);

    // Each page carries its own continuation token (or none on the last page).
    continuationToken = null;

    for (var c = 0; c < contents.length; c++) {
      var item = contents[c];
      if (item.continuationItemRenderer) {
        var contEp = item.continuationItemRenderer.continuationEndpoint;
        if (contEp && contEp.continuationCommand) {
          continuationToken = contEp.continuationCommand.token;
        } else if (contEp && contEp.command && contEp.command.continuationCommand) {
          continuationToken = contEp.command.continuationCommand.token;
        } else if (
          item.continuationItemRenderer.button &&
          item.continuationItemRenderer.button.command &&
          item.continuationItemRenderer.button.command.continuationCommand
        ) {
          continuationToken =
            item.continuationItemRenderer.button.command.continuationCommand.token;
        }
        continue;
      }

      var renderer = item.playlistVideoRenderer;
      if (renderer && renderer.videoId && targetSet[renderer.videoId]) {
        var setVideoId = renderer.setVideoId;
        if (setVideoId) {
          videoIdToSetId[renderer.videoId] = setVideoId;
          targetSet[renderer.videoId] = false;
          remaining--;
          if (remaining === 0) break;
        }
      }

      if (!renderer) {
        var ric = item.richItemRenderer && item.richItemRenderer.content;
        if (ric) {
          if (
            ric.playlistVideoRenderer &&
            ric.playlistVideoRenderer.videoId &&
            targetSet[ric.playlistVideoRenderer.videoId]
          ) {
            var ricSetVideoId = ric.playlistVideoRenderer.setVideoId;
            if (ricSetVideoId) {
              videoIdToSetId[ric.playlistVideoRenderer.videoId] = ricSetVideoId;
              targetSet[ric.playlistVideoRenderer.videoId] = false;
              remaining--;
              if (remaining === 0) break;
            }
          }
          var lockupVm = ric.lockupViewModel;
          if (lockupVm && lockupVm.contentId && targetSet[lockupVm.contentId]) {
            var lockupSetVideoId = lockupVm.setVideoId || lockupVm.playlistSetVideoId;
            if (lockupSetVideoId) {
              videoIdToSetId[lockupVm.contentId] = lockupSetVideoId;
              targetSet[lockupVm.contentId] = false;
              remaining--;
              if (remaining === 0) break;
            }
          }
        }
      }
    }

    if (!continuationToken) break;
  }

  // Logger.debug('fetchPlaylistSetVideoIds result:', JSON.stringify(videoIdToSetId));

  return videoIdToSetId;
}

async function fetchPlaylistVideoIds(session, playlistId, targetIds, maxPages) {
  if (maxPages === undefined) maxPages = CONFIG.PLAYLIST_SCAN_MAX_PAGES;

  var endpoint = CONFIG.BROWSE_ENDPOINT + '?key=' + session.apiKey;
  var browseId = 'VL' + playlistId;
  var foundIds = [];
  var targetSet = Object.create(null);
  for (var i = 0; i < targetIds.length; i++) {
    targetSet[targetIds[i]] = true;
  }
  var remaining = Object.keys(targetSet).length;

  var headers = await getRequestHeaders(session);

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
        body: JSON.stringify(body),
      });
    } catch (e) {
      Logger.warn('fetchPlaylistVideoIds: fetch failed:', e.message);
      break;
    }

    if (!res.ok) {
      Logger.warn('fetchPlaylistVideoIds: HTTP', res.status, 'for playlist', playlistId);
      break;
    }

    var data = await res.json();

    var contents = null;
    try {
      if (continuationToken) {
        var ra = data.onResponseReceivedActions;
        if (ra && ra[0] && ra[0].appendContinuationItemsAction) {
          contents = ra[0].appendContinuationItemsAction.continuationItems;
        } else if (
          data.continuationContents &&
          data.continuationContents.playlistVideoListContinuation
        ) {
          contents = data.continuationContents.playlistVideoListContinuation.contents;
        } else {
          // Logger.debug('fetchPlaylistVideoIds: unknown continuation response format');
        }
      } else {
        var topContents = data.contents;
        if (!topContents) {
          Logger.warn('fetchPlaylistVideoIds: no contents in response for playlist', playlistId);
          break;
        }

        var pvl = _deepFind(topContents, 'playlistVideoListRenderer');
        if (pvl && pvl.contents) {
          contents = pvl.contents;
        } else {
          // YouTube may use various response structures
          var rgr = _deepFind(topContents, 'richGridRenderer');
          if (rgr && rgr.contents) {
            contents = rgr.contents;
          } else {
            var slr = _deepFind(topContents, 'sectionListRenderer');
            if (slr && slr.contents) {
              for (var s = 0; s < slr.contents.length; s++) {
                var sub = slr.contents[s];
                if (sub.playlistVideoListRenderer && sub.playlistVideoListRenderer.contents) {
                  contents = sub.playlistVideoListRenderer.contents;
                  break;
                }
                if (
                  sub.richItemRenderer &&
                  sub.richItemRenderer.content &&
                  sub.richItemRenderer.content.playlistVideoRenderer
                ) {
                  contents = slr.contents;
                  break;
                }
              }
            }
          }
        }

        if (!contents) {
          Logger.warn('fetchPlaylistVideoIds: no known renderer structure found in response');
          break;
        }
      }
    } catch (e) {
      Logger.warn('fetchPlaylistVideoIds: parse error:', e.message);
      break;
    }

    if (!contents) break;

    // Each page carries its own continuation token (or none on the last page).
    continuationToken = null;

    for (var c = 0; c < contents.length; c++) {
      var item = contents[c];
      if (item.continuationItemRenderer) {
        var contEp = item.continuationItemRenderer.continuationEndpoint;
        if (contEp && contEp.continuationCommand) {
          continuationToken = contEp.continuationCommand.token;
        } else if (contEp && contEp.command && contEp.command.continuationCommand) {
          continuationToken = contEp.command.continuationCommand.token;
        } else if (
          item.continuationItemRenderer.button &&
          item.continuationItemRenderer.button.command &&
          item.continuationItemRenderer.button.command.continuationCommand
        ) {
          continuationToken =
            item.continuationItemRenderer.button.command.continuationCommand.token;
        }
        continue;
      }

      var videoId = null;
      if (item.playlistVideoRenderer) {
        videoId = item.playlistVideoRenderer.videoId;
      } else if (item.richItemRenderer && item.richItemRenderer.content) {
        var ric = item.richItemRenderer.content;
        if (ric.playlistVideoRenderer) {
          videoId = ric.playlistVideoRenderer.videoId;
        } else if (ric.lockupViewModel) {
          videoId = ric.lockupViewModel.contentId;
        }
      } else if (item.lockupViewModel) {
        videoId = item.lockupViewModel.contentId;
      }

      if (videoId && targetSet[videoId]) {
        foundIds.push(videoId);
        targetSet[videoId] = false;
        remaining--;
        if (remaining === 0) break;
      }
    }

    if (!continuationToken) break;
  }

  // Logger.debug('fetchPlaylistVideoIds found', foundIds.length, 'of', targetIds.length, 'target ' + pluralize(targetIds.length, 'video') + ' in playlist', playlistId);
  return foundIds;
}
