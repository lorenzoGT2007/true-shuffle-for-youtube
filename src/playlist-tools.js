/*
 * True Shuffle: playlist tools. On every playlist page (Watch Later included) a search box filters the
 * rows by title and channel as you type, and a sort menu shows them by title, duration, channel, date
 * added (when YouTube shows it), unwatched first, or in the playlist's own order.
 *
 * It only changes what's shown: rows never move in the page (CSS `order` sorts them), the real playlist
 * is untouched, and YouTube's drag handles hide while the order on screen isn't the real one. When more
 * of the playlist can load, "Load all" scrolls to YouTube's spinner at a person's pace until it's all in.
 * Isolated world, after watcher.js and unwatched.js; content.js starts it. The helpers above start()
 * are pure, so Node can test them.
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TrueShufflePlaylistTools = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  const PAGES = ['playlist', 'watchLater'];
  const SORTS = [
    ['original', 'toolsSortOriginal'],
    ['title', 'toolsSortTitle'],
    ['duration', 'toolsSortDuration'],
    ['channel', 'toolsSortChannel'],
    ['added', 'toolsSortAdded'],
    ['unwatched', 'toolsSortUnwatched'],
  ];
  const STEP_MS = 1000; // "Load all": one scroll every second or so, like someone reading down the list
  const GIVE_UP_STEPS = 6; // that many scrolls with no new rows: YouTube has nothing more to give

  // ---------------------------------------------------------------- pure helpers

  /** Seconds in a duration badge such as "4:05" or "1:02:03", or null ("LIVE", "SHORTS"…). */
  function clockSeconds(text) {
    const m = /^\s*(?:(\d+):)?(\d{1,2}):(\d{2})\s*$/.exec(text || '');
    return m ? (Number(m[1] || 0) * 60 + Number(m[2])) * 60 + Number(m[3]) : null;
  }

  const UNIT_S = { second: 1, minute: 60, hour: 3600, day: 86400, week: 604800, month: 2592000, year: 31536000 };

  /** How long ago a row says it was added ("Added 3 days ago", "Added on Mar 3, 2024"), in seconds, or null. */
  function addedAge(text, now = Date.now()) {
    const m = /^\s*added\s+(.+?)\s*$/i.exec(text || '');
    if (!m) return null;
    const when = m[1].toLowerCase();
    if (when === 'today') return 0;
    if (when === 'yesterday') return UNIT_S.day;
    const rel = /^(\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago$/.exec(when);
    if (rel) return Number(rel[1]) * UNIT_S[rel[2]];
    const t = Date.parse(m[1].replace(/^on\s+/i, ''));
    return Number.isFinite(t) ? Math.max(0, Math.round((now - t) / 1000)) : null;
  }

  /** The number in "1,234 videos" (also "1.234 video", "1 234 vídeos"), or null. */
  function countIn(text) {
    const m = /(\d[\d.,  ' ]*)\s*v[ií]deos?\b/i.exec(text || '');
    const n = m ? parseInt(m[1].replace(/\D/g, ''), 10) : NaN;
    return Number.isFinite(n) ? n : null;
  }

  /** Lowercase without accents, so "perche" finds "Perché". */
  const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  /** Whether folded row text holds every word of the search. */
  const matches = (text, query) => fold(query).split(/\s+/).filter(Boolean).every((word) => text.includes(word));

  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  const nullsLast = (a, b) => (a == null) - (b == null);
  const COMPARE = {
    title: (a, b) => collator.compare(a.title, b.title),
    duration: (a, b) => nullsLast(a.duration, b.duration) || (a.duration || 0) - (b.duration || 0),
    channel: (a, b) => collator.compare(a.channel, b.channel),
    added: (a, b) => nullsLast(a.added, b.added) || (a.added || 0) - (b.added || 0), // smallest age = newest
    unwatched: (a, b) => (a.watched || 0) - (b.watched || 0),
  };

  /** Row infos (in playlist order) in the order a sort shows them; ties, and 'original', keep the playlist order. */
  function order(infos, key) {
    const cmp = COMPARE[key];
    return infos.map((info, i) => ({ info, i }))
      .sort((a, b) => (cmp ? cmp(a.info, b.info) : 0) || a.i - b.i)
      .map((x) => x.info);
  }

  // ---------------------------------------------------------------- on the page

  const CSS = `
:host { all: initial; color-scheme: dark; display: block; margin: 8px 0 12px; }
[hidden] { display: none !important; }
.bar {
  display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px;
  padding: 10px 12px; border-radius: 12px;
  background: #13382c; color: #f3ecdd;
  font: 400 13px/1.35 Roboto, "YouTube Sans", "Segoe UI", system-ui, -apple-system, sans-serif;
}
.search, .sort {
  padding: 7px 12px;
  border: 1px solid rgba(243, 236, 221, 0.22); border-radius: 999px;
  background: #0d2820; color: inherit; font: inherit;
}
.search { flex: 1 1 220px; min-width: 0; }
.search::placeholder { color: rgba(243, 236, 221, 0.6); }
.status { color: rgba(243, 236, 221, 0.75); font-variant-numeric: tabular-nums; }
.load {
  margin-left: auto; padding: 7px 14px;
  border: 0; border-radius: 999px;
  background: #e2b04f; color: #241a06; font: inherit; font-weight: 600;
  cursor: pointer;
}
.load:hover { background: #f1c877; }
.play {
  padding: 7px 14px;
  border: 1px solid rgba(243, 236, 221, 0.22); border-radius: 999px;
  background: transparent; color: inherit; font: inherit; font-weight: 600;
  cursor: pointer;
}
.play:hover:not(:disabled) { background: rgba(243, 236, 221, 0.1); }
.play:disabled { opacity: 0.45; cursor: default; }
:focus-visible { outline: 2px solid #e2b04f; outline-offset: 2px; }
`;

  /** `play(ids, ordered)`: content.js's Play/Shuffle for the videos shown (the existing shuffle engine). */
  function start({ play } = {}) {
    const SEL = root.TrueShuffleSelectors;
    const { h } = root.TrueShuffleUI;
    const { t } = root.TrueShuffleI18n;
    const VIEW = 'data-true-shuffle-view'; // on the list while it shows a search or another order
    const LOADING = 'data-true-shuffle-loading'; // on the list while "Load all" runs
    const MISS = 'data-true-shuffle-search'; // on the rows the search hides
    const fmt = (n) => Number(n).toLocaleString();
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const cache = new WeakMap(); // row -> what it shows, until YouTube reuses the row for another video

    if (!document.getElementById('true-shuffle-playlist-tools-style')) {
      const style = document.createElement('style');
      style.id = 'true-shuffle-playlist-tools-style';
      style.textContent = [
        `[${VIEW}] { display: flex !important; flex-direction: column; }`, // lets CSS order sort the rows
        `[${VIEW}] > :is(${SEL.continuation}) { order: 2147483647; }`, // the spinner stays last
        // No loading by surprise under a search or sort: more comes in through "Load all".
        `[${VIEW}]:not([${LOADING}]) > :is(${SEL.continuation}) { display: none !important; }`,
        `[${VIEW}] :is(${SEL.reorderHandle}) { visibility: hidden !important; }`, // no dragging a shown-only order
        `[${MISS}] { display: none !important; }`,
      ].join('\n');
      (document.head || document.documentElement).appendChild(style);
    }

    const host = document.createElement('div');
    host.id = 'true-shuffle-playlist-tools';
    const shadow = host.attachShadow({ mode: 'open' });
    const css = document.createElement('style');
    css.textContent = CSS;
    const search = h('input', {
      class: 'search', type: 'search', placeholder: t('toolsSearchPlaceholder'),
      'aria-label': t('toolsSearchLabel'), autocomplete: 'off', spellcheck: 'false',
    });
    const options = SORTS.map(([value, label]) => h('option', { value }, t(label)));
    const addedOption = options[SORTS.findIndex(([value]) => value === 'added')];
    const sort = h('select', { class: 'sort', 'aria-label': t('toolsSortLabel') }, ...options);
    const status = h('span', { class: 'status', role: 'status' });
    const loadBtn = h('button', { class: 'load', type: 'button', hidden: true });
    const playBtn = h('button', { class: 'play', type: 'button', title: t('toolsPlayTitle') }, t('toolsPlay'));
    const shuffleBtn = h('button', { class: 'play', type: 'button', title: t('toolsShuffleTitle') }, t('toolsShuffle'));
    shadow.append(css, h('div', { class: 'bar', role: 'search', 'aria-label': t('toolsLabel') },
      search, sort, playBtn, shuffleBtn, status, loadBtn));
    // YouTube's keyboard shortcuts listen on the page: what you type here stays here.
    for (const type of ['keydown', 'keypress', 'keyup']) host.addEventListener(type, (e) => e.stopPropagation());

    let query = '';
    let sortKey = 'original';
    let list = null; // the element that holds the rows
    let loading = false;

    const rowsOf = () => (list ? [...list.children].filter((el) => el.matches(SEL.playlistRow)) : []);
    const textOf = (el, attr) => (el ? ((attr && el.getAttribute(attr)) || el.textContent || '').trim() : '');
    function moreToLoad() {
      const scope = list && (list.closest(SEL.playlistList) || list);
      return scope ? scope.querySelector(SEL.continuation) : null;
    }
    function total() {
      for (const el of document.querySelectorAll(SEL.playlistHeader)) {
        if (!el.closest(SEL.hidden)) return countIn(el.textContent);
      }
      return null;
    }

    function info(row) {
      const link = row.querySelector(SEL.cardLink);
      const key = link ? link.getAttribute('href') : '';
      let it = cache.get(row);
      if (it && it.key === key) return it;
      const title = textOf(row.querySelector(SEL.rowTitle), 'title');
      const channel = textOf(row.querySelector(SEL.rowChannel));
      let duration = null;
      for (const badge of row.querySelectorAll(SEL.thumbnailBadge)) {
        duration = clockSeconds(badge.textContent);
        if (duration != null) break;
      }
      let added = null;
      for (const span of row.querySelectorAll(SEL.rowMetaText)) {
        added = addedAge(span.textContent);
        if (added != null) break;
      }
      it = { key, title, channel, duration, added, text: fold(title + ' ' + channel) };
      cache.set(row, it);
      return it;
    }

    function apply() {
      if (!list || !list.isConnected) return;
      const rows = rowsOf();
      const infos = rows.map(info);
      list.toggleAttribute(VIEW, !!query || sortKey !== 'original');
      list.toggleAttribute(LOADING, loading);
      let shown = 0;
      rows.forEach((row, i) => {
        const hit = !query || matches(infos[i].text, query);
        row.toggleAttribute(MISS, !hit);
        if (hit) shown++;
      });
      if (sortKey === 'original') {
        for (const row of rows) row.style.removeProperty('order');
      } else {
        if (sortKey === 'unwatched') infos.forEach((it, i) => { it.watched = root.TrueShuffleUnwatched.progressOf(rows[i], SEL); });
        const rank = new Map(order(infos, sortKey).map((it, r) => [it, r]));
        rows.forEach((row, i) => row.style.setProperty('order', String(rank.get(infos[i]))));
      }
      addedOption.hidden = !infos.some((it) => it.added != null); // only when YouTube shows it
      const more = !!moreToLoad();
      const all = total();
      let line = query ? t('toolsStatusMatch', fmt(shown), fmt(rows.length))
        : more ? (all ? t('toolsStatusLoadedOf', fmt(rows.length), fmt(all)) : t('toolsStatusLoadedMore', fmt(rows.length)))
          : t('toolsStatusAll', fmt(rows.length));
      if (more && !loading && (query || sortKey !== 'original')) line += ' · ' + t('toolsStatusOnlyLoaded');
      status.textContent = line;
      loadBtn.hidden = !more && !loading;
      playBtn.disabled = shuffleBtn.disabled = !shown;
      loadBtn.textContent = loading ? t('toolsStopLoading') : all ? t('toolsLoadAllCount', fmt(all)) : t('toolsLoadAll');
    }

    /** Scrolls to YouTube's spinner, a step at a time, until the whole playlist is in (or you stop it). */
    async function loadAll() {
      if (loading) { loading = false; return; }
      loading = true;
      apply();
      let idle = 0;
      while (loading && list && list.isConnected && idle < GIVE_UP_STEPS) {
        const spinner = moreToLoad();
        if (!spinner) break;
        const before = rowsOf().length;
        spinner.scrollIntoView({ block: 'end' });
        await sleep(STEP_MS + Math.random() * 400);
        idle = rowsOf().length > before ? 0 : idle + 1;
      }
      loading = false;
      apply();
      if (host.isConnected) host.scrollIntoView({ block: 'start' }); // back to the tools, at the top of the result
    }

    /** Puts the tools above the list that holds these rows. */
    function mount(rows) {
      if (!list || !list.isConnected) {
        reset();
        if (!rows[0] || !rows[0].parentElement) return;
        list = rows[0].parentElement;
      }
      const anchor = list.closest(SEL.playlistList) || list;
      if (!host.isConnected || host.nextElementSibling !== anchor) anchor.before(host);
    }

    /** Back to YouTube's own view: no search, playlist order, no tools on the page. */
    function reset() {
      loading = false;
      if (list) {
        list.removeAttribute(VIEW);
        list.removeAttribute(LOADING);
        for (const row of rowsOf()) {
          row.removeAttribute(MISS);
          row.style.removeProperty('order');
        }
      }
      list = null;
      query = '';
      sortKey = 'original';
      search.value = '';
      sort.value = 'original';
      host.remove();
    }

    /** The videos on screen now, top to bottom: after the search, the sort and the unwatched filter. */
    function shownIds() {
      const rows = rowsOf().filter((row) => getComputedStyle(row).display !== 'none');
      if (sortKey !== 'original') rows.sort((a, b) => Number(a.style.order) - Number(b.style.order));
      return rows.map((row) => {
        const link = row.querySelector(SEL.cardLink);
        try { return link ? new URL(link.getAttribute('href'), location.href).searchParams.get('v') : null; } catch (_) { return null; }
      }).filter(Boolean);
    }
    playBtn.addEventListener('click', () => { if (play) play(shownIds(), true); });
    shuffleBtn.addEventListener('click', () => { if (play) play(shownIds(), false); });

    search.addEventListener('input', () => { query = search.value.trim(); apply(); });
    sort.addEventListener('change', () => { sortKey = sort.value; apply(); });
    loadBtn.addEventListener('click', loadAll);

    const stopWatch = root.TrueShuffleWatcher.watch({
      pages: PAGES,
      enter: reset,
      videos(cards) {
        const rows = cards.filter((el) => el.matches(SEL.playlistRow));
        if (rows.length) mount(rows);
        apply();
      },
      changed(cards) {
        for (const el of cards) cache.delete(el); // late titles or durations: read again
        apply();
      },
      leave: reset,
    });
    return () => {
      stopWatch();
      reset();
    };
  }

  return { PAGES, SORTS, clockSeconds, addedAge, countIn, fold, matches, order, start };
});
