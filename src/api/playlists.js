// playlists.js – Fetches the user's playlist list and checks for existing videos via YouTube's internal browse endpoint

async function fetchUserPlaylists(session) {
  var endpoint = CONFIG.BROWSE_ENDPOINT + '?key=' + session.apiKey;
  var browseId = 'FEplaylist_aggregation';

  // Logger.info('Fetching user playlists...');

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

  // Logger.success('Fetched', playlists.length, 'playlist(s)');
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

    // Logger.debug('fetchPlaylistSetVideoIds page', page, 'response keys:', Object.keys(data).join(', '));

    var contents = null;
    try {
      if (continuationToken) {
        var ra = data.onResponseReceivedActions;
        if (ra && ra[0] && ra[0].appendContinuationItemsAction) {
          contents = ra[0].appendContinuationItemsAction.continuationItems;
        } else if (data.continuationContents && data.continuationContents.playlistVideoListContinuation) {
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
        if (pvl && pvl.contents) {
          contents = pvl.contents;
        } else {
          var rgr = deepFind(topContents, 'richGridRenderer');
          if (rgr && rgr.contents) {
            contents = rgr.contents;
          } else {
            var slr = deepFind(topContents, 'sectionListRenderer');
            if (slr && slr.contents) {
              for (var s = 0; s < slr.contents.length; s++) {
                var sub = slr.contents[s];
                if (sub.playlistVideoListRenderer && sub.playlistVideoListRenderer.contents) {
                  contents = sub.playlistVideoListRenderer.contents;
                  break;
                }
                if (sub.richItemRenderer && sub.richItemRenderer.content &&
                    sub.richItemRenderer.content.playlistVideoRenderer) {
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

    for (var c = 0; c < contents.length; c++) {
      var item = contents[c];
      if (item.continuationItemRenderer) {
        var contEp = item.continuationItemRenderer.continuationEndpoint;
        if (contEp && contEp.continuationCommand) {
          continuationToken = contEp.continuationCommand.token;
        } else if (contEp && contEp.command && contEp.command.continuationCommand) {
          continuationToken = contEp.command.continuationCommand.token;
        } else if (item.continuationItemRenderer.button && item.continuationItemRenderer.button.command &&
                   item.continuationItemRenderer.button.command.continuationCommand) {
          continuationToken = item.continuationItemRenderer.button.command.continuationCommand.token;
        }
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
        var ric = item.richItemRenderer && item.richItemRenderer.content;
        if (ric) {
          if (ric.playlistVideoRenderer && ric.playlistVideoRenderer.videoId && targetSet[ric.playlistVideoRenderer.videoId]) {
            var setVideoId = ric.playlistVideoRenderer.setVideoId;
            if (setVideoId) {
              videoIdToSetId[ric.playlistVideoRenderer.videoId] = setVideoId;
              remaining--;
              if (remaining === 0) break;
            }
          }
          var lockupVm = ric.lockupViewModel;
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
    }

    if (!continuationToken) break;
  }

  // Logger.debug('fetchPlaylistSetVideoIds result:', JSON.stringify(videoIdToSetId));

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
        } else if (data.continuationContents && data.continuationContents.playlistVideoListContinuation) {
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

        function deepFind3(obj, targetKey) {
          if (!obj || typeof obj !== 'object') return null;
          if (obj[targetKey]) return obj[targetKey];
          for (var key in obj) {
            if (!obj.hasOwnProperty(key)) continue;
            var found = deepFind3(obj[key], targetKey);
            if (found) return found;
          }
          return null;
        }

        var pvl = deepFind3(topContents, 'playlistVideoListRenderer');
        if (pvl && pvl.contents) {
          contents = pvl.contents;
        } else {
          // YouTube may use various response structures
          var rgr = deepFind3(topContents, 'richGridRenderer');
          if (rgr && rgr.contents) {
            contents = rgr.contents;
          } else {
            var slr = deepFind3(topContents, 'sectionListRenderer');
            if (slr && slr.contents) {
              for (var s = 0; s < slr.contents.length; s++) {
                var sub = slr.contents[s];
                if (sub.playlistVideoListRenderer && sub.playlistVideoListRenderer.contents) {
                  contents = sub.playlistVideoListRenderer.contents;
                  break;
                }
                if (sub.richItemRenderer && sub.richItemRenderer.content &&
                    sub.richItemRenderer.content.playlistVideoRenderer) {
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

    for (var c = 0; c < contents.length; c++) {
      var item = contents[c];
      if (item.continuationItemRenderer) {
        var contEp = item.continuationItemRenderer.continuationEndpoint;
        if (contEp && contEp.continuationCommand) {
          continuationToken = contEp.continuationCommand.token;
        } else if (contEp && contEp.command && contEp.command.continuationCommand) {
          continuationToken = contEp.command.continuationCommand.token;
        } else if (item.continuationItemRenderer.button && item.continuationItemRenderer.button.command &&
                   item.continuationItemRenderer.button.command.continuationCommand) {
          continuationToken = item.continuationItemRenderer.button.command.continuationCommand.token;
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
        remaining--;
        if (remaining === 0) break;
      }
    }

    if (!continuationToken) break;
  }

  // Logger.debug('fetchPlaylistVideoIds found', foundIds.length, 'of', targetIds.length, 'target ' + pluralize(targetIds.length, 'video') + ' in playlist', playlistId);
  return foundIds;
}
