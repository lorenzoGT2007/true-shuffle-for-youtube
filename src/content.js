/*
 * True Shuffle: the controller. Runs as the extension's content script on youtube.com.
 *
 * Keeps the shuffle state, decides what plays next, takes over the moment a video ends
 * (and YouTube's Next/Previous buttons, Shift+N/Shift+P and media keys), and draws the
 * floating control. Talks to page.js (YouTube's world) through window.postMessage.
 */
(() => {
  'use strict';
  const prior = window.__trueShuffleContent;
  if (prior && (typeof prior.alive !== 'function' || prior.alive())) return;
  window.__trueShuffleContent = { alive: extensionAlive };

  // After the extension is updated or reloaded, the copy of this script that was already running in
  // the tab is cut off from it. The new copy announces itself here, and the old one stands down.
  const RETIRE_EVENT = 'true-shuffle-retire';
  document.dispatchEvent(new CustomEvent(RETIRE_EVENT));
  document.addEventListener(RETIRE_EVENT, () => retire());

  const TS = globalThis.TrueShuffle;
  const SEL = globalThis.TrueShuffleSelectors;
  const { t } = globalThis.TrueShuffleI18n;
  const UPDATED_TEXT = t('errUpdated'); // looked up now: it's shown once the extension (and chrome.i18n) is gone
  const MARK = '__trueShuffle';
  const KEY_ACTIVE = 'trueShuffle.active'; // sessionStorage: which playlist this tab is shuffling
  const KEY_EXPECT = 'trueShuffle.expect';
  const KEY_OFF = 'trueShuffle.off'; // sessionStorage: playlists you switched off in this tab
  const CATALOG_FRESH_MS = 15 * 60 * 1000;
  const GESTURE_WINDOW_MS = 3000;
  const LATE_AUTOPLAY_MS = 3000;
  const QUEUE_SIZE = 30;
  const MAX_SAVED_PLAYLISTS = 40;
  const DEFAULTS = { spread: true, onFinish: 'reshuffle', showButton: true, corner: 'right', collapsed: false, autoStart: true }; // also in popup/settings.js

  const st = {
    settings: { ...DEFAULTS },
    listId: null, // playlist being shuffled in this tab
    phase: 'idle', // idle | loading | active | paused | finished | error
    quiet: false, // started by itself: shown as the small button until you open it
    starting: null, // playlist the last start was for
    autoFailed: new Set(), // playlists that couldn't start by themselves (not retried on their own)
    session: null,
    catalog: null,
    loading: null,
    error: null,
    saved: null, // progress saved for the playlist on screen, when not shuffling
    loc: { path: '', v: null, list: null },
    expected: null, // { id, at, tries }: where we asked YouTube to go
    landed: null, // { id, at }: the last of those that showed up
    dealing: 0, // moves of ours still being worked out (their navigation isn't requested yet)
    navTimer: 0,
    navStartedAt: -1,
    lastGestureAt: -1e9,
    nearEnd: { id: null, at: -1e9 },
    errorTicks: 0,
    erroredId: null,
    endTimer: 0,
    tookOver: null, // video id whose ending we already handled
    scrubbing: false, // you're holding the time bar
    held: null, // { id, play }: video kept short of its end until you let go of the time bar
    queueOpen: false,
    syncing: null, // the quiet re-read of the playlist in progress (a promise)
    startToken: 0,
    mediaOn: null, // unknown at first: page.js may still hold the media keys for a copy from before an update
    ui: null,
    debugPage: { type: null, videos: 0 }, // TEMP debug: the popup's page line (see init)
    stopDebugWatch: null,
    stopUnwatched: null, // the unwatched filter, started in init
    stopPlaylistTools: null, // search and sort on playlist pages, started in init
    stopRemoved: null, // the removed-video check, started in init
    tickTimer: 0,
    retired: false,
  };
  let debug = false;

  // ------------------------------------------------------------------ helpers

  const fmt = (n) => Number(n || 0).toLocaleString();

  function readLoc() {
    const u = new URL(location.href);
    return { path: u.pathname, v: u.searchParams.get('v'), list: u.searchParams.get('list') };
  }

  const isShufflableList = (id) => typeof id === 'string' && id.length >= 2 && !/^(RD|TL)/.test(id);
  const onPlaylistPage = (loc) => (loc.path === '/playlist' || loc.path === '/watch') && isShufflableList(loc.list);
  const onOurWatchPage = (loc) => !!st.listId && loc.path === '/watch' && !!loc.v && loc.list === st.listId;
  const isAttached = () => st.phase === 'active' && onOurWatchPage(readLoc());

  function isAd(player) {
    return player.matches(SEL.ad);
  }

  function mainVideo() {
    return document.querySelector(SEL.video) || document.querySelector(SEL.videoFallback);
  }

  /** The player around a media event's target, when that's YouTube's video playing (not an ad). */
  function playerOf(v) {
    if (!v || v.tagName !== 'VIDEO') return null;
    const player = v.closest(SEL.player);
    return player && !isAd(player) ? player : null;
  }

  function isTyping(e) {
    const el = e.composedPath()[0];
    if (!el || !el.tagName) return false;
    return el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.getAttribute('role') === 'textbox';
  }

  function visible(el) {
    return !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  }

  function playerErrorVisible() {
    const p = document.querySelector(SEL.player);
    if (p && visible(p.querySelector(SEL.playerError))) return true;
    const screen = document.querySelector(SEL.errorScreen);
    return !!screen && visible(screen) && visible(screen.querySelector(SEL.errorScreenMessage));
  }

  function extensionAlive() {
    try { return !!(chrome.runtime && chrome.runtime.id); } catch (_) { return false; }
  }

  /** page.js's errors are matched on its English (an old copy can outlive an update); others pass through. */
  function friendly(err) {
    const m = String((err && err.message) || err || '');
    if (/context invalidated|Extension context/i.test(m) || !extensionAlive()) return UPDATED_TEXT;
    if (/did not answer/i.test(m)) return t('errNoAnswer');
    if (/^YouTube is still loading\./.test(m)) return t('errStillLoading');
    if (/^Network error while reading the playlist\./.test(m)) return t('errNetwork');
    const http = /^YouTube answered with an error \((\d+)\)\.$/.exec(m);
    if (http) return t('errHttp', http[1]);
    if (/^No playlist on this page\./.test(m)) return t('errNoPlaylist');
    if (/^YouTube could not open this playlist\.$/.test(m)) return t('errCannotOpen'); // yt-api.js, page world too
    return m || t('errUnknown');
  }

  const sessionStore = {
    get(k) { try { return sessionStorage.getItem(k); } catch (_) { return null; } },
    set(k, v) { try { sessionStorage.setItem(k, v); } catch (_) { /* storage blocked */ } },
    del(k) { try { sessionStorage.removeItem(k); } catch (_) { /* storage blocked */ } },
  };

  // ------------------------------------------------------------------ extension storage

  async function sget(key) {
    if (!extensionAlive()) throw new Error('Extension context invalidated');
    return (await chrome.storage.local.get(key))[key];
  }
  async function sset(obj) {
    if (!extensionAlive()) throw new Error('Extension context invalidated');
    await chrome.storage.local.set(obj);
  }

  async function loadSettings() {
    try { st.settings = { ...DEFAULTS, ...((await sget('settings')) || {}) }; } catch (_) { /* defaults */ }
  }

  function setSetting(patch) {
    st.settings = { ...st.settings, ...patch };
    sset({ settings: st.settings }).catch(() => {});
    render();
  }

  function hydrate(c) {
    const meta = new Map();
    const ids = [];
    for (const [id, title, channel, duration] of c.items) {
      if (meta.has(id)) continue;
      meta.set(id, { title, channel, duration });
      ids.push(id);
    }
    return {
      listId: c.listId, title: c.title, total: c.total, fetchedAt: c.fetchedAt, skipped: c.skipped || 0,
      partial: c.partial || null, ids, meta,
    };
  }

  // An empty copy is never reused (1.0.0 could save one, and then every start failed on it).
  async function loadCatalog(listId) {
    const c = await sget('c:' + listId);
    return c && Array.isArray(c.items) && c.items.length ? hydrate(c) : null;
  }

  /**
   * Reads the playlist through page.js. Not saved here: only a shuffle that uses it saves it,
   * so reads that go nowhere (cancelled, empty, abandoned) leave nothing behind in storage.
   */
  async function fetchCatalog(listId, onProgress) {
    const r = await pageCall('fetchPlaylist', { listId }, { timeout: 45000, onProgress });
    return {
      listId, title: r.title || null, total: r.total ?? null, fetchedAt: Date.now(),
      items: r.items, skipped: r.skipped || 0, partial: r.partial || null,
    };
  }

  // A read that stopped partway (`partial`) is due for another try as soon as it's used again.
  const isStale = (cat) => !!cat.partial || Date.now() - cat.fetchedAt > CATALOG_FRESH_MS;

  async function loadSession(listId) {
    const s = await sget('s:' + listId);
    return TS.isSession(s) ? s : null;
  }

  async function saveSession(s) {
    s.updatedAt = Date.now();
    const idx = (await sget('idx')) || {};
    const prev = idx[s.listId] || {};
    const title = (st.catalog && st.catalog.listId === s.listId && st.catalog.title) || prev.title || null;
    idx[s.listId] = { title, pos: s.pos + 1, total: s.order.length, round: s.round, updatedAt: s.updatedAt };
    const drop = Object.entries(idx)
      .sort((a, b) => b[1].updatedAt - a[1].updatedAt)
      .slice(MAX_SAVED_PLAYLISTS)
      .map(([k]) => k);
    for (const k of drop) delete idx[k];
    await sset({ ['s:' + s.listId]: s, idx });
    if (drop.length) await chrome.storage.local.remove(drop.flatMap((k) => ['s:' + k, 'c:' + k]));
    if (s.listId === st.listId) st.session = s;
  }

  async function refreshSaved() {
    const list = st.loc.list;
    if (st.listId || !isShufflableList(list)) { st.saved = null; return; }
    try {
      const e = ((await sget('idx')) || {})[list];
      st.saved = e && e.total ? e : null;
    } catch (_) { st.saved = null; }
  }

  function keyOf(id) {
    const m = st.catalog && st.catalog.meta.get(id);
    return (m && m.channel) || '';
  }
  const opts = () => ({ spread: !!st.settings.spread, keyOf, onFinish: st.settings.onFinish });
  // A session from the playlist tools' Play or Shuffle (`s.view = {ids, ordered}`) only ever deals those videos.
  const poolOf = (s) => (s.view ? s.view.ids : st.catalog ? st.catalog.ids : null);
  const optsFor = (s) => ({ ...opts(), ordered: !!(s.view && s.view.ordered) });

  // ------------------------------------------------------------------ talking to page.js

  const pending = new Map();
  let seq = 0;

  function pageCall(type, payload = {}, { timeout = 10000, onProgress } = {}) {
    return new Promise((resolve, reject) => {
      const reqId = 'ts' + Date.now().toString(36) + (++seq);
      const entry = { resolve, reject, onProgress, timer: 0 };
      entry.arm = () => {
        clearTimeout(entry.timer);
        entry.timer = setTimeout(() => {
          pending.delete(reqId);
          reject(new Error('The page did not answer in time.'));
        }, timeout);
      };
      entry.arm();
      pending.set(reqId, entry);
      window.postMessage({ [MARK]: 'to-page', reqId, type, ...payload }, location.origin);
    });
  }

  window.addEventListener('message', (e) => {
    if (e.source !== window) return;
    const d = e.data;
    if (!d || d[MARK] !== 'to-cs') return;
    if (d.type === 'mediaKey') {
      if (isAttached()) (d.action === 'prev' ? goPrev : goNext)('media');
      return;
    }
    const entry = pending.get(d.reqId);
    if (!entry) return;
    if (d.type === 'progress') {
      entry.arm();
      if (entry.onProgress) entry.onProgress(d.loaded, d.total);
    } else if (d.type === 'reply') {
      clearTimeout(entry.timer);
      pending.delete(d.reqId);
      if (d.ok) entry.resolve(d.data); else entry.reject(new Error(d.error));
    }
  });

  function syncMediaKeys() {
    const on = isAttached();
    if (on === st.mediaOn) return;
    st.mediaOn = on;
    pageCall('setActive', { active: on }).catch(() => {});
  }

  // ------------------------------------------------------------------ one change at a time

  let chain = Promise.resolve();
  function serial(fn) {
    const run = chain.then(fn, fn);
    chain = run.catch(() => {});
    return run;
  }

  // ------------------------------------------------------------------ starting and stopping

  function switchedOff() {
    try { return JSON.parse(sessionStore.get(KEY_OFF) || '[]'); } catch (_) { return []; }
  }

  function setSwitchedOff(listId, off) {
    const ids = switchedOff().filter((x) => x !== listId);
    if (off) ids.push(listId);
    if (ids.length) sessionStore.set(KEY_OFF, JSON.stringify(ids)); else sessionStore.del(KEY_OFF);
  }

  /**
   * `auto`: turned on by itself, not by you. `view` = {ids, ordered}: the playlist tools' Play/Shuffle,
   * a fresh session over just those videos (in that order when `ordered`).
   */
  async function start(fresh, auto = false, view = null) {
    if (st.phase === 'loading') return;
    const listId = readLoc().list;
    if (!isShufflableList(listId)) return;
    if (!auto) {
      setSwitchedOff(listId, false);
      st.autoFailed.delete(listId);
    }
    const token = ++st.startToken;
    st.phase = 'loading';
    st.quiet = auto;
    st.starting = listId;
    st.error = null;
    st.loading = { loaded: 0, total: null };
    st.queueOpen = false;
    render();
    try {
      let cat = await loadCatalog(listId);
      if (cat && view && view.ids.some((id) => !cat.meta.has(id))) cat = null; // shown videos it lacks: read again
      let fetched = null; // read just now: saved once the shuffle really starts
      if (!cat) {
        fetched = await fetchCatalog(listId, (loaded, total) => {
          if (token !== st.startToken) return;
          st.loading = { loaded, total };
          render();
        });
        cat = hydrate(fetched);
      }
      if (token !== st.startToken) return; // cancelled meanwhile
      if (!cat.ids.length) {
        throw new Error(cat.skipped ? t('errNoneCanPlay') : t('errEmptyPlaylist'));
      }
      st.catalog = cat;
      const here = readLoc();
      const onList = here.path === '/watch' && here.list === listId && !!here.v;
      const currentId = onList && cat.meta.has(here.v) ? here.v : null;
      if (auto && !onList) {
        // You moved on while the playlist was being read: don't pull you back to it.
        st.phase = 'idle';
        await refreshSaved();
        render();
        autoStart();
        return;
      }
      if (fetched) await sset({ ['c:' + listId]: fetched });
      let s = fresh ? null : await loadSession(listId);
      if (s) {
        if (!s.view) TS.reconcile(s, cat.ids, opts()); // a view keeps exactly the videos you chose
        if (currentId) TS.noteWatching(s, currentId);
      } else if (view) {
        s = TS.createSession(listId, view.ids, { ...opts(), ordered: view.ordered });
        s.view = view;
      } else {
        s = TS.createSession(listId, cat.ids, { ...opts(), first: currentId });
      }
      st.listId = listId;
      await saveSession(s);
      sessionStore.set(KEY_ACTIVE, listId);
      st.phase = 'active';
      syncMediaKeys();
      render();
      // Started by itself on a video the saved copy of the playlist doesn't have yet: keep it on.
      if (!currentId && auto) await commitWatching(here.v);
      else if (!currentId) await goNext('start');
      if (!fetched && isStale(cat)) syncCatalog(listId);
    } catch (err) {
      if (token !== st.startToken) return;
      if (auto) st.autoFailed.add(listId);
      st.listId = null;
      st.phase = 'error';
      st.error = friendly(err);
      syncMediaKeys();
      render();
    }
  }

  /** `byYou`: you closed it, so it stays off for that playlist in this tab until you start it again. */
  async function stop(byYou = false) {
    const listId = st.listId || st.starting;
    if (byYou && listId) setSwitchedOff(listId, true);
    st.startToken++;
    st.listId = null;
    st.phase = 'idle';
    st.expected = null;
    st.landed = null;
    st.queueOpen = false;
    st.error = null;
    clearTimeout(st.navTimer);
    cancelTakeover();
    sessionStore.del(KEY_ACTIVE);
    sessionStore.del(KEY_EXPECT);
    syncMediaKeys();
    await refreshSaved();
    render();
  }

  /** After a reload of this tab: pick the shuffle up where it was. */
  async function resumeAfterReload(listId) {
    let s = null;
    let cat = null;
    try {
      s = await loadSession(listId);
      cat = await loadCatalog(listId);
    } catch (_) { /* fall through */ }
    if (!s || !cat) {
      sessionStore.del(KEY_ACTIVE);
      await refreshSaved();
      render();
      autoStart();
      return;
    }
    st.listId = listId;
    st.catalog = cat;
    st.session = s;
    st.quiet = true;
    sessionStore.del(KEY_EXPECT);
    if (onOurWatchPage(st.loc)) {
      st.phase = 'active';
      await commitWatching(st.loc.v);
    } else {
      st.phase = 'paused';
    }
    syncMediaKeys();
    render();
    if (isStale(cat)) syncCatalog(listId);
    autoStart();
  }

  /**
   * Playing a video from a playlist turns the shuffle on by itself (or moves it over from another
   * playlist), unless that's switched off in the settings or by you in this tab. A playlist's own
   * page never starts anything: that would take you away from it.
   */
  function autoStart() {
    const loc = readLoc();
    if (!st.settings.autoStart || loc.path !== '/watch' || !loc.v || !isShufflableList(loc.list)) return;
    if (loc.list === st.listId || st.phase === 'loading') return;
    if (st.autoFailed.has(loc.list) || switchedOff().includes(loc.list)) return;
    if (st.listId) switchToThisPlaylist(true); else start(false, true);
  }

  /**
   * Re-reads the playlist quietly and folds additions/removals into the shuffle.
   * A caller that comes while a re-read runs gets that one, so it can wait for the new copy.
   */
  function syncCatalog(listId) {
    if (!st.syncing) st.syncing = resync(listId).finally(() => { st.syncing = null; });
    return st.syncing;
  }

  async function resync(listId) {
    try {
      const fetched = await fetchCatalog(listId);
      const cat = hydrate(fetched);
      // An empty read, or a cut-short one shorter than what we have, would drop videos from the shuffle.
      if (!cat.ids.length) return;
      if (cat.partial) {
        const saved = await loadCatalog(listId);
        if (saved && (!saved.partial || saved.ids.length >= cat.ids.length)) return;
      }
      await sset({ ['c:' + listId]: fetched });
      if (st.listId !== listId) return;
      st.catalog = cat;
      await serial(async () => {
        const s = await loadSession(listId);
        if (!s || s.view) return; // a view keeps exactly the videos you chose
        TS.reconcile(s, cat.ids, opts());
        await saveSession(s);
      });
      render();
    } catch (_) {
      /* keep using the copy we have */
    }
  }

  // ------------------------------------------------------------------ moving through the deck

  /** One of our moves. Until it has asked YouTube to navigate, YouTube's own navigations aren't yours. */
  function move(fn) {
    st.dealing++;
    return serial(fn).catch(showError).finally(() => { st.dealing--; });
  }

  function goNext(reason) {
    return move(async () => {
      if (!st.listId) return;
      const s = await loadSession(st.listId);
      if (!s) return;
      const r = TS.advance(s, poolOf(s), optsFor(s));
      await saveSession(s);
      if (r.finished || !r.id) {
        st.phase = 'finished';
        st.queueOpen = false;
        syncMediaKeys();
        render();
        return;
      }
      st.phase = 'active';
      render();
      requestNavigation(r.id);
    });
  }

  function goPrev() {
    return move(async () => {
      if (!st.listId) return;
      const v = mainVideo();
      if (v && v.currentTime > 5) { v.currentTime = 0; return; }
      const s = await loadSession(st.listId);
      if (!s) return;
      const id = TS.retreat(s, readLoc().v);
      if (!id) { if (v) v.currentTime = 0; return; }
      await saveSession(s);
      render();
      requestNavigation(id);
    });
  }

  function playNow(id) {
    return move(async () => {
      const s = await loadSession(st.listId);
      if (!s) return;
      TS.noteWatching(s, id);
      await saveSession(s);
      render();
      requestNavigation(id);
    });
  }

  function reshuffleRest() {
    return serial(async () => {
      const s = await loadSession(st.listId);
      if (!s) return;
      TS.reshuffleRest(s, opts());
      await saveSession(s);
      render();
    }).catch(showError);
  }

  function restart() {
    return serial(async () => {
      if (!st.listId || !st.catalog) return;
      const here = readLoc();
      const currentId = onOurWatchPage(here) && st.catalog.meta.has(here.v) ? here.v : null;
      await saveSession(TS.createSession(st.listId, st.catalog.ids, { ...opts(), first: currentId }));
      render();
    }).catch(showError);
  }

  function shuffleAgain() {
    return serial(async () => {
      const s = await loadSession(st.listId);
      if (!s) return;
      TS.startRound(s, poolOf(s), optsFor(s));
      await saveSession(s);
      st.phase = 'active';
    }).then(() => goNext('again'), showError);
  }

  /** Records the video on screen as dealt (or as a replay). */
  function commitWatching(id) {
    return serial(async () => {
      if (!st.listId) return;
      const s = await loadSession(st.listId);
      if (!s) return;
      if (TS.noteWatching(s, id) === 'unknown') {
        // Probably added to the playlist after we read it. Re-read, then try again.
        const listId = st.listId;
        syncCatalog(listId).then(() => serial(async () => {
          const s2 = st.listId === listId ? await loadSession(listId) : null;
          if (s2 && TS.noteWatching(s2, id) !== 'unknown') await saveSession(s2);
          render();
        }));
        return;
      }
      await saveSession(s);
      render();
    }).catch(showError);
  }

  function showError(err) {
    st.phase = 'error';
    st.error = friendly(err);
    syncMediaKeys(); // media keys go back to YouTube while the error shows
    render();
  }

  // ------------------------------------------------------------------ navigation

  function requestNavigation(id) {
    const here = readLoc();
    if (here.path === '/watch' && here.v === id && here.list === st.listId) {
      // Same video again (a one-video round): just start it over.
      st.tookOver = null;
      const v = mainVideo();
      if (v) {
        v.currentTime = 0;
        const p = v.play();
        if (p && p.catch) p.catch(() => {});
      }
      st.expected = null;
      return;
    }
    const at = performance.now();
    const tries = st.expected && st.expected.id === id ? st.expected.tries : 0;
    st.expected = { id, at, tries };
    sessionStore.set(KEY_EXPECT, JSON.stringify({ id, list: st.listId, t: Date.now() }));
    pageCall('navigate', { videoId: id, listId: st.listId, app: SEL.app }, { timeout: 3000 })
      .then((r) => { if (!r || r.method !== 'spa') hardNavigate(id); })
      .catch(() => hardNavigate(id));
    clearTimeout(st.navTimer);
    const check = () => {
      if (!st.expected || st.expected.id !== id || readLoc().v === id) return;
      const started = st.navStartedAt > at;
      if (!started || performance.now() - at > 15000) hardNavigate(id);
      else st.navTimer = setTimeout(check, 1000);
    };
    st.navTimer = setTimeout(check, 2500);
  }

  /** Fallback when YouTube's in-page navigation didn't happen: a normal page load. */
  function hardNavigate(id) {
    if (!st.expected || st.expected.id !== id || !st.listId || readLoc().v === id) return;
    location.assign('/watch?v=' + encodeURIComponent(id) + '&list=' + encodeURIComponent(st.listId));
  }

  function checkLocation(reason) {
    const cur = readLoc();
    const prev = st.loc;
    if (cur.path === prev.path && cur.v === prev.v && cur.list === prev.list) return;
    st.loc = cur;
    onLocationChange(prev, cur, reason);
  }

  async function onLocationChange(prev, cur, reason) {
    st.errorTicks = 0;
    if (cur.v !== prev.v) {
      cancelTakeover();
      st.tookOver = null;
      st.held = null;
    }
    if (!st.listId) {
      await refreshSaved();
      render();
      autoStart();
      return;
    }
    if (st.phase === 'loading' || st.phase === 'error') { render(); return; }
    if (!onOurWatchPage(cur)) {
      if (st.phase === 'active') st.phase = 'paused';
      st.queueOpen = false;
      syncMediaKeys();
      render();
      autoStart(); // a video from another playlist: shuffle that one now
      return;
    }
    if (st.phase === 'finished') { render(); return; }
    st.phase = 'active';
    syncMediaKeys();

    const id = cur.v;
    const now = performance.now();
    const exp = st.expected;
    if (exp && exp.id === id) {
      st.expected = null;
      st.landed = { id, at: now };
      sessionStore.del(KEY_EXPECT);
      await commitWatching(id);
      return;
    }
    const byUser = reason === 'popstate' || now - st.lastGestureAt < GESTURE_WINDOW_MS;
    if (!byUser) {
      // Something else navigated (YouTube's own autoplay) while one of ours is being dealt: ours replaces it.
      if (st.dealing) return;
      if (exp && now - exp.at < 20000 && exp.tries < 2) {
        // ...or while ours was on its way: insist.
        exp.tries++;
        exp.at = now;
        requestNavigation(exp.id);
        return;
      }
      const landed = st.landed;
      if (landed && landed.id === prev.v && now - landed.at < LATE_AUTOPLAY_MS) {
        // ...or it showed up just after ours: go back to ours.
        st.landed = null;
        requestNavigation(landed.id);
        return;
      }
    }
    const prevFinished = prev.list === st.listId && !!prev.v &&
      ((st.nearEnd.id === prev.v && now - st.nearEnd.at < 20000) || st.erroredId === prev.v);
    if (!byUser && prevFinished) {
      // YouTube moved on by itself at the end of a video: replace its pick with ours.
      st.expected = null;
      await goNext('override');
      return;
    }
    // You picked this one (playlist panel, back button, a link...).
    st.expected = null;
    sessionStore.del(KEY_EXPECT);
    await commitWatching(id);
  }

  function tick() {
    if (!extensionAlive()) { retire(); return; }
    checkLocation('poll');
    if (isAttached()) {
      if (playerErrorVisible()) {
        st.errorTicks++;
        if (st.errorTicks === 4) {
          st.erroredId = readLoc().v;
          goNext('error');
        }
      } else {
        st.errorTicks = 0;
      }
    }
    if (st.ui && !st.ui.host.isConnected) document.documentElement.appendChild(st.ui.host);
    hideStrays();
  }

  /** Stands this copy down for good (see RETIRE_EVENT): no more takeovers, no button. */
  function retire() {
    if (st.retired) return;
    st.retired = true;
    st.startToken++;
    st.listId = null;
    st.phase = 'idle';
    st.expected = null;
    clearTimeout(st.navTimer);
    clearInterval(st.tickTimer);
    cancelTakeover();
    syncMediaKeys(); // page.js outlives this copy: give the media keys back
    if (st.stopDebugWatch) st.stopDebugWatch();
    if (st.stopUnwatched) st.stopUnwatched();
    if (st.stopPlaylistTools) st.stopPlaylistTools();
    if (st.stopRemoved) st.stopRemoved();
    if (st.ui) st.ui.host.remove();
    st.ui = null;
  }

  /** The button of a copy from before an update that doesn't know how to stand down: hide it. */
  function hideStrays() {
    if (!st.ui) return;
    for (const el of document.querySelectorAll('#' + st.ui.host.id)) {
      if (el !== st.ui.host) el.style.setProperty('display', 'none', 'important');
    }
  }

  // ------------------------------------------------------------------ taking over YouTube's controls

  // YouTube notices a video ending on its own and jumps to its next one. So the shuffle steps
  // in a hair earlier: it pauses 0.15 s before the end (YouTube then never sees the video
  // finish) and deals the next video itself.
  const TAKEOVER_LEAD_S = 0.15;
  const AT_END_S = 0.05; // a seek that lands this close to the end lands on it
  const HOLD_BACK_S = 0.3;

  function cancelTakeover() {
    clearTimeout(st.endTimer);
    st.endTimer = 0;
  }

  const hasEnd = (v) => v.duration > 0 && Number.isFinite(v.duration);
  const secondsLeft = (v) => (v.duration - v.currentTime) / (v.playbackRate || 1);

  /** Stops the video and deals the next one in place of YouTube's (once per video). */
  function takeOver(v) {
    const id = readLoc().v;
    if (!id || st.tookOver === id) return;
    cancelTakeover();
    st.tookOver = id;
    if (!v.paused) v.pause();
    goNext('ended');
  }

  function scheduleTakeover(v, player) {
    if (st.endTimer) return;
    const id = readLoc().v;
    if (!id || st.tookOver === id) return;
    const left = secondsLeft(v);
    if (left > 1.5) return;
    st.endTimer = setTimeout(() => {
      st.endTimer = 0;
      if (!isAttached() || readLoc().v !== id || st.tookOver === id) return;
      if (v.paused || v.seeking || v.loop || isAd(player)) return; // you paused it, or something changed: wait
      if (secondsLeft(v) > 0.5) return; // stalled or rewound: re-arm later
      endOrHold(v);
    }, Math.max(0, (left - TAKEOVER_LEAD_S) * 1000));
  }

  /** Keeps the video short of its end (pulled back if it got there), where YouTube won't notice it finishing. */
  function stopShort(v) {
    if (!v.paused) v.pause();
    if (v.duration - v.currentTime <= AT_END_S) v.currentTime = Math.max(0, v.duration - HOLD_BACK_S);
  }

  // While you hold the time bar nothing is decided: the video waits short of its end, and letting
  // go there skips to the next one, while letting go anywhere else plays on from that spot.
  function endOrHold(v, playing = !v.paused) {
    const id = readLoc().v;
    if (!st.scrubbing) {
      stopShort(v);
      takeOver(v);
      return;
    }
    if (!st.held || st.held.id !== id) st.held = { id, play: playing };
    stopShort(v);
  }

  function letGo() {
    if (!st.scrubbing) return;
    st.scrubbing = false;
    setTimeout(settleHold, 150); // after YouTube's own seek to where you let go
  }

  function settleHold() {
    if (st.scrubbing) return;
    const held = st.held;
    st.held = null;
    const v = mainVideo();
    if (!held || !v || readLoc().v !== held.id || st.tookOver === held.id || !isAttached() || !hasEnd(v)) return;
    if (v.duration - v.currentTime <= HOLD_BACK_S + AT_END_S) takeOver(v);
    else if (held.play && v.paused) {
      const p = v.play();
      if (p && p.catch) p.catch(() => {});
    }
  }

  window.addEventListener('pointerdown', (e) => {
    if (!e.isTrusted || e.button !== 0) return;
    const el = e.composedPath()[0];
    if (el instanceof Element && el.closest(SEL.timeBar)) st.scrubbing = true;
  }, true);
  window.addEventListener('pointerup', letGo, true);
  window.addEventListener('pointercancel', letGo, true);
  window.addEventListener('pointermove', (e) => { if (st.scrubbing && !e.buttons) letGo(); }, true);
  window.addEventListener('blur', letGo);

  // A seek moves the end, so the timer waits for it to land. A seek to the very end (the time bar
  // dragged all the way, the End key) skips the rest of the video right away.
  window.addEventListener('seeking', (e) => {
    const v = e.target;
    if (!playerOf(v)) return;
    cancelTakeover();
    if (!isAttached() || v.loop || !hasEnd(v) || v.duration - v.currentTime > AT_END_S) return;
    if (st.tookOver !== readLoc().v) endOrHold(v);
  }, true);

  window.addEventListener('seeked', (e) => {
    const v = e.target;
    const player = playerOf(v);
    if (!player || !isAttached() || v.loop || !hasEnd(v) || st.tookOver === readLoc().v) return;
    // Landed on the end anyway (a paused video sent there never fires 'ended').
    if (v.ended || v.duration - v.currentTime <= AT_END_S) endOrHold(v);
    else if (!v.paused) scheduleTakeover(v, player);
  }, true);

  // Backup: if the video does reach its end, keep YouTube from reacting and deal the next one.
  window.addEventListener('ended', (e) => {
    const v = e.target;
    if (!playerOf(v) || v.loop || !isAttached()) return;
    e.stopImmediatePropagation();
    if (st.tookOver !== readLoc().v) endOrHold(v, true);
  }, true);

  window.addEventListener('timeupdate', (e) => {
    if (!st.listId) return;
    const v = e.target;
    const player = playerOf(v);
    if (!player || !hasEnd(v)) return;
    if (v.duration - v.currentTime < 4) st.nearEnd = { id: readLoc().v, at: performance.now() };
    if (!v.paused && !v.loop && isAttached()) scheduleTakeover(v, player);
  }, true);

  // The player's own Next / Previous buttons.
  window.addEventListener('click', (e) => {
    if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    const t = e.target instanceof Element ? e.target : null;
    if (!t) return;
    const btn = t.closest(`${SEL.nextButton}, ${SEL.prevButton}`);
    if (!btn || !btn.closest(SEL.player) || !isAttached()) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (btn.matches(SEL.nextButton)) goNext('button'); else goPrev();
  }, true);

  // YouTube's keyboard shortcuts for next / previous.
  window.addEventListener('keydown', (e) => {
    if (!e.isTrusted || !e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;
    if (e.code !== 'KeyN' && e.code !== 'KeyP') return;
    if (!isAttached() || isTyping(e)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.code === 'KeyN') goNext('key'); else goPrev();
  }, true);

  // Remember when you last clicked or typed something that can open a video, to tell your choices
  // apart from YouTube's autoplay. Working the player (time bar, its buttons, seek keys) doesn't count.

  /** A timestamp or chapter link into the video on screen: it only seeks. */
  function seeksHere(link) {
    try {
      const u = new URL(link.href, location.href);
      return u.pathname === '/watch' && u.searchParams.get('v') === readLoc().v && u.searchParams.has('t');
    } catch (_) {
      return false;
    }
  }

  function opensVideo(e, el) {
    if (!(el instanceof Element)) return e.type !== 'keydown';
    if (e.type === 'keydown' && e.key !== 'Enter' && !(e.key === ' ' && el.closest('button, [role="button"]'))) return false;
    const link = el.closest('a[href]');
    if (link) return !seeksHere(link);
    return !el.closest(SEL.player) || !!el.closest(SEL.playerLinks);
  }

  const markGesture = (e) => {
    if (!e.isTrusted) return;
    const path = e.composedPath();
    if (st.ui && path.includes(st.ui.host)) return;
    if (opensVideo(e, path[0])) st.lastGestureAt = performance.now();
  };
  window.addEventListener('pointerdown', markGesture, true);
  window.addEventListener('keydown', markGesture, true);

  document.addEventListener('yt-navigate-start', () => { st.navStartedAt = performance.now(); }, true);
  document.addEventListener('yt-navigate-finish', () => checkLocation('nav'), true);
  window.addEventListener('popstate', () => checkLocation('popstate'), true);
  document.addEventListener('fullscreenchange', () => render());

  // ------------------------------------------------------------------ drawing

  function meta(id) {
    const m = st.catalog && st.catalog.meta.get(id);
    return { id, title: (m && m.title) || '', channel: (m && m.channel) || '' };
  }

  function currentSession() {
    return st.session && st.session.listId === st.listId ? st.session : null;
  }

  function viewModel() {
    const base = { corner: st.settings.corner === 'left' ? 'left' : 'right' };
    if (document.fullscreenElement) return { ...base, mode: 'hidden' };
    const s = currentSession();
    const sum = s ? TS.summary(s) : { position: 0, total: 0, round: 1, left: 0 };
    switch (st.phase) {
      case 'loading': {
        const loaded = (st.loading && st.loading.loaded) || 0;
        const total = (st.loading && st.loading.total) || null;
        if (st.quiet) {
          return {
            ...base, mode: 'mini',
            tip: !loaded ? t('shuffleTipReading')
              : total ? t('shuffleTipReadingOf', fmt(loaded), fmt(total)) : t('shuffleTipReadingCount', fmt(loaded)),
            progress: total ? Math.min(1, loaded / total) : 0,
          };
        }
        return { ...base, mode: 'loading', loaded, total };
      }
      case 'error':
        return { ...base, mode: 'error', message: st.error };
      case 'finished':
        return { ...base, mode: 'finished', total: sum.total, ordered: !!(s && s.view && s.view.ordered) };
      case 'paused':
        if (st.quiet) {
          return {
            ...base, mode: 'mini', paused: true,
            tip: t('shuffleTipPaused', fmt(sum.position), fmt(sum.total)),
            progress: sum.total ? sum.position / sum.total : 0,
          };
        }
        return {
          ...base, mode: 'paused', position: sum.position, total: sum.total,
          canSwitch: onPlaylistPage(st.loc) && st.loc.list !== st.listId,
        };
      case 'active': {
        if (!s) return { ...base, mode: 'hidden' };
        if (st.settings.collapsed || st.quiet) {
          return {
            ...base, mode: 'mini',
            tip: t('shuffleTipShuffling', fmt(sum.position), fmt(sum.total)),
            progress: sum.total ? sum.position / sum.total : 0,
          };
        }
        const nextId = TS.peekNext(s);
        return {
          ...base, mode: 'active', position: sum.position, total: sum.total, round: sum.round,
          onFinish: st.settings.onFinish,
          next: nextId ? meta(nextId) : null,
          queue: st.queueOpen
            ? { round: sum.round, left: sum.left, view: !!s.view, items: TS.upcoming(s, QUEUE_SIZE).map((id, i) => ({ ...meta(id), n: sum.position + 1 + i })) }
            : null,
        };
      }
      default: {
        if (!st.settings.showButton || !onPlaylistPage(st.loc)) return { ...base, mode: 'hidden' };
        const saved = st.saved;
        return {
          ...base, mode: 'fab',
          tip: saved ? t('shuffleTipResume', fmt(saved.pos), fmt(saved.total)) : t('shuffleTipStart'),
          progress: saved ? saved.pos / saved.total : null,
        };
      }
    }
  }

  function render() {
    if (st.ui) st.ui.render(viewModel());
    if (debug) {
      const s = currentSession();
      document.documentElement.dataset.trueShuffleDebug = JSON.stringify({
        phase: st.phase, listId: st.listId, pos: s ? s.pos : null, round: s ? s.round : null,
        order: s ? s.order : null, expected: st.expected && st.expected.id, error: st.error,
      });
    }
  }

  function onUiAction(act, id) {
    switch (act) {
      case 'start': start(false); break;
      case 'retry': start(false); break;
      case 'cancel':
      case 'stop': stop(true); break;
      case 'expand': st.quiet = false; setSetting({ collapsed: false }); break;
      case 'collapse': st.queueOpen = false; setSetting({ collapsed: true }); break;
      case 'next': goNext('ui'); break;
      case 'prev': goPrev(); break;
      case 'queue': st.queueOpen = !st.queueOpen; render(); break;
      case 'play': if (id) playNow(id); break;
      case 'reshuffle': reshuffleRest(); break;
      case 'restart': restart(); break;
      case 'resume': goNext('resume'); break;
      case 'again': shuffleAgain(); break;
      case 'switch': switchToThisPlaylist(); break;
      default: break;
    }
  }

  /** Paused on a different playlist: drop the old shuffle (its place is kept) and shuffle this one. */
  async function switchToThisPlaylist(auto = false) {
    await stop();
    await start(false, auto);
  }

  /**
   * The playlist tools' Play and Shuffle: the shuffle, over exactly the videos shown (in that order when
   * `ordered`). It takes the place of this playlist's saved shuffle; "Start over" goes back to all of it.
   */
  async function playView(ids, ordered) {
    if (!ids.length || st.phase === 'loading') return;
    if (st.listId) await stop();
    await start(true, false, { ids, ordered });
  }

  // ------------------------------------------------------------------ the toolbar popup

  function status() {
    const loc = readLoc();
    const s = currentSession();
    const sum = s ? TS.summary(s) : null;
    const nextId = s ? TS.peekNext(s) : null;
    return {
      ok: true,
      page: { path: loc.path, list: loc.list, shufflable: onPlaylistPage(loc), mix: !!(loc.list && /^RD/.test(loc.list)) },
      phase: st.phase,
      listId: st.listId,
      title: (st.listId && st.catalog && st.catalog.title) || (st.saved && st.saved.title) || null,
      position: sum ? sum.position : 0,
      total: sum ? sum.total : 0,
      round: sum ? sum.round : 1,
      ordered: !!(s && s.view && s.view.ordered), // a "Play" from the playlist tools: "Play again" when it ends
      next: nextId ? meta(nextId) : null,
      loading: st.loading,
      error: st.error,
      saved: st.listId ? null : st.saved,
      settings: st.settings,
      debugPage: { ...st.debugPage }, // TEMP debug
    };
  }

  try {
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      const type = msg && msg.type;
      const actions = {
        status: () => {},
        start: () => { start(false); },
        restart: () => (st.listId ? restart() : start(true)),
        stop: () => stop(true),
        next: () => goNext('popup'),
        prev: () => goPrev(),
        reshuffle: () => reshuffleRest(),
        resume: () => goNext('resume'),
        again: () => shuffleAgain(),
        switch: () => { switchToThisPlaylist(); },
      };
      if (!actions[type]) return false;
      Promise.resolve(actions[type]()).then(() => sendResponse(status()), (err) => sendResponse({ ok: false, error: friendly(err) }));
      return true;
    });

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (changes.settings) {
        const before = st.settings;
        st.settings = { ...DEFAULTS, ...(changes.settings.newValue || {}) };
        if (st.settings.spread && !before.spread && st.listId) {
          serial(async () => {
            const s = await loadSession(st.listId);
            if (!s) return;
            TS.respreadRest(s, keyOf);
            await saveSession(s);
          }).catch(() => {});
        }
        render();
        if (st.settings.autoStart && !before.autoStart) autoStart();
      }
      const own = st.listId && changes['s:' + st.listId];
      if (own && TS.isSession(own.newValue)) {
        st.session = own.newValue; // also follows changes made from another tab
        render();
      }
    });
  } catch (_) { /* extension reloaded underneath this page */ }

  // ------------------------------------------------------------------ boot

  async function init() {
    try { debug = localStorage.getItem('trueShuffle.debug') === '1'; } catch (_) { /* ignore */ }
    await loadSettings();
    if (document.readyState === 'loading') {
      await new Promise((r) => document.addEventListener('DOMContentLoaded', r, { once: true }));
    }
    if (st.retired) return;
    st.loc = readLoc();
    st.ui = globalThis.TrueShuffleUI.create(onUiAction);
    document.documentElement.appendChild(st.ui.host);
    hideStrays();
    // TEMP debug: follows the page watcher for the popup's debug line. Remove this, st.debugPage,
    // st.stopDebugWatch, debugPage in status() and #debug-page in the popup together.
    st.stopDebugWatch = globalThis.TrueShuffleWatcher.watch({
      enter(page) { st.debugPage = { type: page.type, videos: 0 }; },
      videos(cards) { st.debugPage.videos += cards.length; },
    });
    st.stopUnwatched = globalThis.TrueShuffleUnwatched.start();
    st.stopPlaylistTools = globalThis.TrueShufflePlaylistTools.start({ play: playView });
    st.stopRemoved = globalThis.TrueShuffleRemoved.start();
    const activeList = sessionStore.get(KEY_ACTIVE);
    if (activeList) await resumeAfterReload(activeList);
    else {
      await refreshSaved();
      render();
      autoStart();
    }
    if (st.retired) return;
    syncMediaKeys(); // the first sync, whatever path init took (mediaOn starts unknown)
    st.tickTimer = setInterval(tick, 1000);
  }

  init();
})();
