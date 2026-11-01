/*
 * True Shuffle: the unwatched filter. Hides the video cards you've watched on Home, Subscriptions, a
 * channel's Videos tab, search results and playlist pages, judged two ways: the width of the red
 * progress bar on the thumbnail, and YouTube's "Watched" label. Cards that load while you scroll come
 * through the page watcher; the video you're watching (or left playing in the miniplayer) never goes.
 *
 * Settings live in storage key `unwatched` = {enabled, threshold (percent), partial}: the popup switches
 * it, the options page sets the rest, Alt+Shift+U toggles it (background.js). content.js starts and stops
 * it. Isolated world, after watcher.js. percent() and hides() are pure, so Node can test them.
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TrueShuffleUnwatched = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  const DEFAULTS = { enabled: false, threshold: 90, partial: false }; // also in options/options.js
  // Where it filters (the project brief): not the watch page, so nothing next to your video changes.
  const PAGES = ['home', 'subscriptions', 'channelVideos', 'search', 'playlist', 'watchLater'];
  const ATTR = 'data-true-shuffle-watched'; // on the cards this filter hides
  const STYLE_ID = 'true-shuffle-unwatched';

  /** Share watched (0..1) from a progress bar's inline width such as "37%", or null. */
  function percent(width) {
    const m = /^\s*(\d+(?:\.\d+)?)%\s*$/.exec(width || '');
    return m ? Math.min(1, Number(m[1]) / 100) : null;
  }

  /** Whether a card with this share watched (null: nothing shows) goes, under these settings. */
  function hides(watched, cfg) {
    if (!(watched > 0)) return false;
    return watched >= cfg.threshold / 100 || !!cfg.partial;
  }

  /** How much of a card's video you've watched, 0..1, or null when the card shows no progress. */
  function progressOf(card, SEL) {
    if (card.querySelector(SEL.watchedLabel)) return 1;
    for (const badge of card.querySelectorAll(SEL.thumbnailBadge)) {
      if (/^\s*watched\s*$/i.test(badge.textContent)) return 1;
    }
    let watched = null;
    for (const bar of card.querySelectorAll(SEL.progressBar)) {
      let share = percent(bar.style.width);
      if (share == null) { // no inline width: measure the bar against its track
        const track = bar.parentElement ? bar.parentElement.getBoundingClientRect().width : 0;
        if (track) share = Math.min(1, bar.getBoundingClientRect().width / track);
      }
      if (share != null) watched = Math.max(watched || 0, share);
    }
    return watched;
  }

  /** Starts the filter on this page. Returns a function that stops it and shows every card again. */
  function start() {
    const SEL = root.TrueShuffleSelectors;
    let cfg = { ...DEFAULTS };
    let stopWatch = null;
    let watching = null; // the last watch page's video: also kept while it plays on in the miniplayer
    const stopTracking = root.TrueShuffleWatcher.watch({
      pages: ['watch'],
      enter(page) { watching = new URL(page.url).searchParams.get('v'); },
    });
    let stopped = false;

    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = `[${ATTR}] { display: none !important; }`;
      (document.head || document.documentElement).appendChild(style);
    }

    function videoOf(card) {
      const link = card.querySelector(SEL.cardLink);
      try { return link ? new URL(link.getAttribute('href'), location.href).searchParams.get('v') : null; } catch (_) { return null; }
    }
    function apply(card) {
      card.removeAttribute(ATTR); // a hidden card has no size, and a bar without a set width gets measured
      if (hides(progressOf(card, SEL), cfg) && videoOf(card) !== watching) card.setAttribute(ATTR, ''); // same task: no flicker
    }
    function showAll() {
      for (const el of document.querySelectorAll(`[${ATTR}]`)) el.removeAttribute(ATTR);
    }

    // Any change of settings: show everything, then judge every card again (a fresh watch scans them all).
    function restart() {
      if (stopWatch) stopWatch();
      stopWatch = null;
      showAll();
      if (stopped || !cfg.enabled) return;
      stopWatch = root.TrueShuffleWatcher.watch({
        pages: PAGES,
        videos(cards) { cards.forEach(apply); },
        changed(cards) { cards.forEach(apply); }, // the progress bar often shows up after the card
      });
    }
    const load = (stored) => {
      cfg = { ...DEFAULTS, ...(stored || {}) };
      restart();
    };
    const onChanged = (changes, area) => {
      if (area === 'local' && changes.unwatched) load(changes.unwatched.newValue);
    };

    chrome.storage.onChanged.addListener(onChanged);
    chrome.storage.local.get('unwatched').then((r) => { if (!stopped) load(r.unwatched); }, () => {});
    return () => {
      stopped = true;
      try { chrome.storage.onChanged.removeListener(onChanged); } catch (_) { /* extension reloaded underneath */ }
      stopTracking();
      restart();
    };
  }

  return { DEFAULTS, PAGES, percent, hides, progressOf, start }; // progressOf: also for "unwatched first"
});
