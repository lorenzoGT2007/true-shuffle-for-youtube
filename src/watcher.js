/*
 * True Shuffle: the page watcher. Knows which kind of YouTube page is on screen, notices YouTube's
 * in-page navigations and the videos its infinite scroll adds, and tells the features that asked
 * when to run. Isolated world, after selectors.js. pageType() is pure, so Node can test it.
 *
 *   const stop = TrueShuffleWatcher.watch({
 *     pages: ['subscriptions', 'channelVideos'], // leave out for every page
 *     enter(page) {},          // page = { type, url }: on arrival, or right away if already there
 *     videos(cards, page) {},  // video cards new on screen: those there on arrival, then each scroll batch
 *     changed(cards, page) {}, // cards already reported that got new content (YouTube fills overlays in late)
 *     leave(page) {},          // before the next page's enter
 *   });
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TrueShuffleWatcher = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  const TYPES = ['home', 'subscriptions', 'channelVideos', 'search', 'playlist', 'watchLater', 'watch', 'other'];
  const FLUSH_MS = 150; // cards arrive in bursts: one report per burst

  /** Which kind of page a YouTube URL is (one of TYPES). */
  function pageType(href) {
    let u;
    try { u = new URL(href, 'https://www.youtube.com/'); } catch (_) { return 'other'; }
    const path = u.pathname.length > 1 ? u.pathname.replace(/\/+$/, '') : u.pathname;
    const q = u.searchParams;
    if (path === '/') return 'home';
    if (path === '/feed/subscriptions') return 'subscriptions';
    if (path === '/results') return q.get('search_query') ? 'search' : 'other';
    if (path === '/watch') return q.get('v') ? 'watch' : 'other';
    if (path === '/playlist') return !q.get('list') ? 'other' : q.get('list') === 'WL' ? 'watchLater' : 'playlist';
    // /@handle/videos, /channel/UC…/videos, /c/Name/videos, /user/Name/videos, and old /Name/videos
    if (/^\/(?:@[^/]+|(?:channel|c|user)\/[^/]+|[^/@]+)\/videos$/.test(path)) return 'channelVideos';
    return 'other';
  }

  // Another video, another search or another list is another page, even when the type stays.
  function pageKey(href) {
    const u = new URL(href, 'https://www.youtube.com/');
    const q = u.searchParams;
    return [u.pathname, q.get('v'), q.get('list'), q.get('search_query')].join('\n');
  }

  const subs = new Set();
  let SEL = null;
  let page = null; // { type, url } of the page on screen, while anyone watches
  let key = '';
  let pending = []; // elements added since the last report
  let timer = 0;
  let observer = null;

  const wants = (sub, type) => !sub.pages || sub.pages.includes(type);
  const cardAround = (el) => (el.parentElement ? el.parentElement.closest(SEL.videoItem) : null);
  const nested = (el) => !!cardAround(el);
  function outermost(card) {
    for (let up = cardAround(card); up; up = cardAround(up)) card = up;
    return card;
  }

  function call(fn, ...args) {
    if (typeof fn !== 'function') return;
    try { fn(...args); } catch (err) { setTimeout(() => { throw err; }); } // a feature's error stays its own
  }

  /** Moves to the page in the address bar if it changed: leave, then enter, then a full scan. */
  function checkPage() {
    const href = location.href;
    if (page && pageKey(href) === key) return;
    const before = page;
    page = { type: pageType(href), url: href };
    key = pageKey(href);
    for (const sub of [...subs]) {
      if (before && wants(sub, before.type)) call(sub.leave, { ...before });
      sub.seen = new WeakSet();
      if (wants(sub, page.type)) call(sub.enter, { ...page });
    }
    pending.push(document.documentElement);
  }

  function schedule() {
    if (!timer) timer = setTimeout(flush, FLUSH_MS);
  }

  function flush() {
    timer = 0;
    if (!subs.size) return;
    checkPage(); // a navigation that came without YouTube's event still shows up here
    const roots = pending;
    pending = [];
    const listening = [...subs].filter((sub) => (typeof sub.videos === 'function' || typeof sub.changed === 'function') && wants(sub, page.type));
    if (!listening.length) return;
    const found = new Set();
    const touched = new Set(); // cards something was added inside
    for (const el of roots) {
      if (!el.isConnected) continue;
      if (el.matches(SEL.videoItem)) found.add(el);
      if (el.firstElementChild) for (const card of el.querySelectorAll(SEL.videoItem)) found.add(card);
      const around = cardAround(el);
      if (around) touched.add(outermost(around));
    }
    const cards = [...found].filter((el) => !el.closest(SEL.hidden) && !nested(el));
    for (const sub of listening) {
      const changed = sub.changed ? [...touched].filter((el) => sub.seen.has(el) && !el.closest(SEL.hidden)) : [];
      const fresh = cards.filter((el) => !sub.seen.has(el));
      for (const el of fresh) sub.seen.add(el);
      if (fresh.length) call(sub.videos, fresh, { ...page });
      if (changed.length) call(sub.changed, changed, { ...page });
    }
  }

  function onNavigate() {
    checkPage();
    schedule();
  }

  function start() {
    SEL = root.TrueShuffleSelectors;
    observer = new MutationObserver((records) => {
      for (const r of records) for (const n of r.addedNodes) if (n.nodeType === 1) pending.push(n);
      if (pending.length) schedule();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    document.addEventListener('yt-navigate-finish', onNavigate, true);
    window.addEventListener('popstate', onNavigate, true);
  }

  function stopAll() {
    observer.disconnect();
    document.removeEventListener('yt-navigate-finish', onNavigate, true);
    window.removeEventListener('popstate', onNavigate, true);
    clearTimeout(timer);
    timer = 0;
    page = null;
    key = '';
    pending = [];
  }

  /** Registers a feature (see the top of this file). Returns a function that unregisters it. */
  function watch(feature) {
    const unknown = (feature.pages || []).filter((t) => !TYPES.includes(t));
    if (unknown.length) throw new Error('Unknown page type: ' + unknown.join(', '));
    const sub = { pages: feature.pages || null, enter: feature.enter, videos: feature.videos, changed: feature.changed, leave: feature.leave, seen: new WeakSet() };
    subs.add(sub);
    if (subs.size === 1) {
      start();
      checkPage(); // enters this feature
    } else {
      if (wants(sub, page.type)) call(sub.enter, { ...page });
      pending.push(document.documentElement);
    }
    schedule();
    return () => {
      if (subs.delete(sub) && !subs.size) stopAll();
    };
  }

  return { TYPES, pageType, watch };
});
