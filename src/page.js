/*
 * True Shuffle: the part that runs inside YouTube's own page world.
 *
 * Only this world can see YouTube's config (ytcfg), use the signed-in session to read
 * private playlists, ask YouTube's app to switch videos without a page reload, and take
 * over the media keys. The extension's content script talks to it with window.postMessage.
 */
(() => {
  'use strict';
  if (window.__trueShufflePage) return;
  Object.defineProperty(window, '__trueShufflePage', { value: true });

  const MARK = '__trueShuffle';
  const YT = window.TrueShuffleYT;
  const MAX_PAGES = 600; // 100 videos per page; YouTube playlists top out well below this

  const post = (msg) => window.postMessage({ [MARK]: 'to-cs', ...msg }, location.origin);

  window.addEventListener('message', (e) => {
    if (e.source !== window) return;
    const d = e.data;
    if (!d || d[MARK] !== 'to-page') return;
    handle(d).then(
      (data) => post({ type: 'reply', reqId: d.reqId, ok: true, data }),
      (err) => post({ type: 'reply', reqId: d.reqId, ok: false, error: String((err && err.message) || err) }),
    );
  });

  async function handle(msg) {
    switch (msg.type) {
      case 'ping':
        return { ready: !!cfg('INNERTUBE_CONTEXT') };
      case 'fetchPlaylist':
        return fetchPlaylist(msg.listId, (loaded, total) => post({ type: 'progress', reqId: msg.reqId, loaded, total }));
      case 'navigate':
        return navigate(msg.videoId, msg.listId);
      case 'setActive':
        setActive(!!msg.active);
        return true;
      default:
        throw new Error('Unknown request: ' + msg.type);
    }
  }

  // ---------------------------------------------------------------- config

  function cfg(key) {
    try {
      const c = window.ytcfg;
      if (c && typeof c.get === 'function') {
        const v = c.get(key);
        if (v !== undefined) return v;
      }
      if (c && c.data_ && key in c.data_) return c.data_[key];
    } catch (_) { /* ytcfg not ready */ }
    return undefined;
  }

  function sessionIds() {
    const parsed = YT.parseDataSyncId(cfg('DATASYNC_ID'));
    return {
      delegated: cfg('DELEGATED_SESSION_ID') || parsed.delegated,
      user: cfg('USER_SESSION_ID') || parsed.user,
    };
  }

  async function headers(withAuth) {
    const ctx = cfg('INNERTUBE_CONTEXT') || {};
    const client = ctx.client || {};
    const h = { 'Content-Type': 'application/json' };
    const name = cfg('INNERTUBE_CONTEXT_CLIENT_NAME');
    const version = cfg('INNERTUBE_CLIENT_VERSION') || client.clientVersion;
    const visitor = cfg('VISITOR_DATA') || client.visitorData;
    if (name != null) h['X-YouTube-Client-Name'] = String(name);
    if (version) h['X-YouTube-Client-Version'] = String(version);
    if (visitor) h['X-Goog-Visitor-Id'] = String(visitor);
    if (withAuth) {
      const ids = sessionIds();
      const auth = await YT.sidAuthorization(YT.parseCookies(document.cookie), location.origin, ids.user);
      if (auth) {
        h.Authorization = auth;
        h['X-Origin'] = location.origin;
        h['X-Goog-AuthUser'] = String(cfg('SESSION_INDEX') ?? 0);
        if (ids.delegated) h['X-Goog-PageId'] = String(ids.delegated);
        if (cfg('LOGGED_IN')) h['X-Youtube-Bootstrap-Logged-In'] = 'true';
      }
    }
    return h;
  }

  // ---------------------------------------------------------------- playlist download

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function innertube(endpoint, body, withAuth) {
    const context = cfg('INNERTUBE_CONTEXT');
    if (!context) throw Object.assign(new Error('YouTube is still loading. Try again in a moment.'), { retry: true });
    const key = cfg('INNERTUBE_API_KEY');
    const url = `/youtubei/v1/${endpoint}?prettyPrint=false${key ? '&key=' + encodeURIComponent(key) : ''}`;
    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        credentials: 'same-origin',
        headers: await headers(withAuth),
        body: JSON.stringify({ context, ...body }),
      });
    } catch (err) {
      throw Object.assign(new Error('Network error while reading the playlist.'), { retry: true });
    }
    if (!res.ok) {
      throw Object.assign(new Error(`YouTube answered with an error (${res.status}).`), {
        status: res.status,
        retry: res.status === 429 || res.status >= 500,
      });
    }
    return res.json();
  }

  async function withRetry(fn) {
    const waits = [700, 1800, 4000];
    for (let attempt = 0; ; attempt++) {
      try {
        return await fn();
      } catch (err) {
        if (!err.retry || attempt >= waits.length) throw err;
        await sleep(waits[attempt]);
      }
    }
  }

  async function fetchPlaylist(listId, onProgress) {
    if (!listId) throw new Error('No playlist on this page.');
    let withAuth = !!cfg('LOGGED_IN');
    let first;
    try {
      first = await withRetry(() => innertube('browse', { browseId: 'VL' + listId }, withAuth));
    } catch (err) {
      if (!withAuth || !err.status || err.status >= 500) throw err;
      withAuth = false; // signed-in request refused: public playlists still work signed out
      first = await withRetry(() => innertube('browse', { browseId: 'VL' + listId }, false));
    }

    const page = YT.parseBrowse(first, listId);
    if (!page.items.length && !page.skipped && page.error) throw new Error(page.error);

    const seen = new Set();
    const items = [];
    const add = (list) => {
      for (const it of list) {
        if (seen.has(it.id)) continue;
        seen.add(it.id);
        items.push([it.id, it.title || '', it.channel || '', it.duration ?? null]);
      }
    };
    add(page.items);
    let skipped = page.skipped;
    const total = page.total;
    onProgress(items.length, total);

    let token = page.continuation;
    const usedTokens = new Set();
    let pages = 1;
    let partial = null;
    while (token && !usedTokens.has(token) && pages < MAX_PAGES) {
      usedTokens.add(token);
      let next;
      try {
        next = await withRetry(() => innertube('browse', { continuation: token }, withAuth));
      } catch (err) {
        partial = String(err.message || err);
        break;
      }
      const p = YT.parseBrowse(next, listId);
      add(p.items);
      skipped += p.skipped;
      token = p.continuation;
      pages++;
      onProgress(items.length, total);
    }
    return { listId, title: page.title, total, items, skipped, partial };
  }

  // ---------------------------------------------------------------- navigation

  /** Asks YouTube's app to open a video the same way its own links do (no page reload). */
  function navigate(videoId, listId) {
    const url = '/watch?v=' + encodeURIComponent(videoId) + (listId ? '&list=' + encodeURIComponent(listId) : '');
    const endpoint = {
      commandMetadata: { webCommandMetadata: { url, webPageType: 'WEB_PAGE_TYPE_WATCH', rootVe: 3832 } },
      watchEndpoint: listId ? { videoId, playlistId: listId } : { videoId },
    };
    const app = document.querySelector('ytd-app');
    if (!app) return { method: 'none' };
    try {
      if (typeof app.fire === 'function') app.fire('yt-navigate', { endpoint });
      else app.dispatchEvent(new CustomEvent('yt-navigate', { bubbles: true, composed: true, detail: { endpoint } }));
      return { method: 'spa' };
    } catch (_) {
      return { method: 'none' };
    }
  }

  // ---------------------------------------------------------------- media keys

  let active = false;
  const ms = navigator.mediaSession;
  const original = ms && typeof ms.setActionHandler === 'function' ? ms.setActionHandler.bind(ms) : null;
  const youtubeHandlers = { nexttrack: null, previoustrack: null };
  const ours = {
    nexttrack: () => post({ type: 'mediaKey', action: 'next' }),
    previoustrack: () => post({ type: 'mediaKey', action: 'prev' }),
  };

  function apply(action) {
    if (!original) return;
    try { original(action, active ? ours[action] : youtubeHandlers[action]); } catch (_) { /* unsupported */ }
  }

  if (original) {
    try {
      Object.defineProperty(ms, 'setActionHandler', {
        configurable: true,
        writable: true,
        value(action, handler) {
          if (action in youtubeHandlers) {
            youtubeHandlers[action] = handler;
            apply(action);
            return undefined;
          }
          return original(action, handler);
        },
      });
    } catch (_) { /* leave YouTube's handlers alone */ }
  }

  function setActive(on) {
    if (active === on) return;
    active = on;
    apply('nexttrack');
    apply('previoustrack');
  }
})();
