/*
 * True Shuffle: the removed-video check. When you open a playlist it keeps a snapshot of its videos
 * (id, title, channel, date seen) in storage.local. On the next visit it compares, and a small notice
 * lists the videos that left the playlist or became private or deleted, with the titles saved before,
 * until you press "Seen it". The history (and a CSV export) is on the options page.
 *
 * It only reads the page. A video counts as gone only when the whole playlist is on the page (no
 * "load more" spinner); a partly loaded one only reveals rows that now show "[Private video]" and the
 * like. YouTube's own "N unavailable videos are hidden" note tells removed videos from hidden ones.
 * Watch Later and Liked videos are skipped: videos come and go there because of you.
 *
 * Isolated world, after watcher.js and ui.js; content.js starts it. The helpers above start() are pure
 * (the options page loads this file for them too), so Node can test them.
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TrueShuffleRemoved = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  const SNAPSHOT_VERSION = 1;
  const MAX_SNAPSHOT_BYTES = 2000000; // one playlist (about 15,000 videos); a bigger one isn't saved
  const MAX_TOTAL_BYTES = 20000000; // all snapshots together: the least recently checked go first
  const MAX_ALERTS = 500; // history kept (unlimited history is for later)
  const SETTLE_MS = 2000; // check once the rows stop arriving
  const SKIP = /^(WL|LL|RD|TL)/; // Watch Later, Liked videos, mixes and temporary lists

  // Message keys, translated on use: Node loads this file without chrome.i18n.
  const WHAT = {
    removed: 'removedWhatRemoved',
    hidden: 'removedWhatHidden',
    unclear: 'removedWhatUnclear',
    unavailable: 'removedWhatUnavailable',
  };

  // ---------------------------------------------------------------- pure helpers

  /**
   * Compares the playlist on the page with the snapshot saved last time.
   * rows: [{id, title, channel, unavailable}] in page order. ctx: {complete, hidden, now}:
   * complete = the whole playlist is loaded; hidden = YouTube's "N unavailable videos are hidden".
   * Returns {found: [{id, title, channel, seen, kind}], snapshot} (kind: a key of WHAT).
   * Snapshot videos are [title, channel, last seen (ms), 1 once reported unavailable].
   */
  function compare(saved, rows, { complete, hidden = 0, now }) {
    const before = saved && saved.v === SNAPSHOT_VERSION && saved.videos ? saved.videos : null;
    const videos = {};
    const found = [];
    const here = new Set();
    for (const r of rows) {
      if (!r.id || here.has(r.id)) continue;
      here.add(r.id);
      const old = before && before[r.id];
      if (r.unavailable) { // "[Private video]": keep the title we saved while it was fine
        if (old && !old[3]) found.push({ id: r.id, title: old[0], channel: old[1], seen: old[2], kind: 'unavailable' });
        videos[r.id] = old ? [old[0], old[1], old[2], 1] : [r.title, r.channel, now, 1];
      } else {
        videos[r.id] = [r.title, r.channel, now, 0];
      }
    }
    if (before) {
      const gone = [];
      for (const id of Object.keys(before)) {
        if (here.has(id)) continue;
        // Not loaded yet, or already reported as unavailable (YouTube may just be hiding it): keep it.
        if (!complete || before[id][3]) videos[id] = before[id];
        else gone.push(id);
      }
      // Videos YouTube started hiding since last time explain that many of the gone ones.
      const newlyHidden = Math.max(0, hidden - (saved.hidden || 0));
      const kind = !newlyHidden ? 'removed' : newlyHidden >= gone.length ? 'hidden' : 'unclear';
      for (const id of gone) {
        const [title, channel, seen] = before[id];
        found.push({ id, title, channel, seen, kind });
      }
    }
    // The hidden count is only a fair baseline once the whole list was read.
    const baseline = complete || !before ? hidden : saved.hidden || 0;
    return { found, snapshot: { v: SNAPSHOT_VERSION, at: now, complete: !!complete, hidden: baseline, videos } };
  }

  /** The history with these findings added (newest last, at most MAX_ALERTS). */
  function addAlerts(history, found, { list, listTitle, now }) {
    const added = found.map((f) => ({ at: now, list, listTitle, id: f.id, title: f.title, channel: f.channel, seen: f.seen, kind: f.kind, ack: false }));
    return [...(history || []), ...added].slice(-MAX_ALERTS);
  }

  /** The number in YouTube's "2 unavailable videos are hidden", or 0. */
  function hiddenCount(text) {
    const m = /(\d[\d.,  ]*)\s+unavailable\s+videos?\s+(?:is|are)\s+hidden/i.exec(text || '');
    return m ? parseInt(m[1].replace(/\D/g, ''), 10) || 0 : 0;
  }

  /** Whether a snapshot this big may be saved, and which saved ones to drop so all of them fit. */
  function budget(index, listId, bytes) {
    if (bytes > MAX_SNAPSHOT_BYTES) return { save: false, drop: [] };
    const others = Object.entries(index || {}).filter(([id]) => id !== listId).sort((a, b) => a[1].at - b[1].at);
    let total = bytes + others.reduce((sum, [, e]) => sum + (e.bytes || 0), 0);
    const drop = [];
    while (total > MAX_TOTAL_BYTES && others.length) {
      const [id, e] = others.shift();
      drop.push(id);
      total -= e.bytes || 0;
    }
    return { save: true, drop };
  }

  const pad = (n) => String(n).padStart(2, '0');
  /** Local "2026-11-01 13:05". */
  function stamp(ms) {
    const d = new Date(ms);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  /** One CSV field: quoted when needed; text starting like a formula gets a ' so spreadsheets show it as text. */
  function field(value) {
    let s = String(value == null ? '' : value);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\r\n]|^\s|\s$/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  /** The alert history as CSV, newest first; t translates a message key (TrueShuffleI18n.t). */
  function toCsv(alerts, t) {
    const head = ['removedCsvFound', 'removedCsvPlaylist', 'removedCsvPlaylistId', 'removedCsvVideoId', 'removedCsvTitle',
      'removedCsvChannel', 'removedCsvLastSeen', 'removedCsvWhat', 'removedCsvSeenIt'].map((key) => field(t(key)));
    const lines = [...(alerts || [])].reverse().map((a) => [stamp(a.at), a.listTitle, a.list, a.id, a.title, a.channel,
      a.seen ? stamp(a.seen) : '', WHAT[a.kind] ? t(WHAT[a.kind]) : a.kind, t(a.ack ? 'removedCsvYes' : 'removedCsvNo')].map(field).join(','));
    return [head.join(','), ...lines].join('\r\n') + '\r\n';
  }

  // ---------------------------------------------------------------- on the page

  const CSS = `
:host { all: initial; color-scheme: dark; display: block; margin: 8px 0; }
.note {
  padding: 12px 14px; border-radius: 12px;
  background: #3a2a0b; color: #f3ecdd; border: 1px solid rgba(226, 176, 79, 0.45);
  font: 400 13px/1.4 Roboto, "YouTube Sans", "Segoe UI", system-ui, -apple-system, sans-serif;
}
h2 { margin: 0 0 6px; font-size: 14px; font-weight: 600; }
ul { margin: 0 0 10px; padding-left: 18px; }
li { margin: 2px 0; }
.what, .more, .where { color: rgba(243, 236, 221, 0.72); }
.row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
button {
  padding: 6px 14px; border: 0; border-radius: 999px;
  background: #e2b04f; color: #241a06; font: inherit; font-weight: 600; cursor: pointer;
}
button:hover { background: #f1c877; }
:focus-visible { outline: 2px solid #e2b04f; outline-offset: 2px; }
`;
  const SHOWN = 10; // titles listed in the notice; the rest are on the options page

  function start() {
    const SEL = root.TrueShuffleSelectors;
    const { h } = root.TrueShuffleUI;
    const { t } = root.TrueShuffleI18n;
    let timer = 0;
    let stopped = false;
    let listId = null;

    const host = document.createElement('div');
    host.id = 'true-shuffle-removed';
    const shadow = host.attachShadow({ mode: 'open' });
    const css = document.createElement('style');
    css.textContent = CSS;
    shadow.append(css);

    const sget = async (key) => (await chrome.storage.local.get(key))[key];
    const activeList = () => [...document.querySelectorAll(SEL.playlistList)].find((el) => !el.closest(SEL.hidden)) || null;
    const textOf = (el, attr) => (el ? ((attr && el.getAttribute(attr)) || el.textContent || '').trim() : '');
    function read(row) {
      const link = row.querySelector(SEL.cardLink);
      let id = null;
      try { id = link ? new URL(link.getAttribute('href'), location.href).searchParams.get('v') : null; } catch (_) { /* no id */ }
      const title = textOf(row.querySelector(SEL.rowTitle), 'title');
      const channel = textOf(row.querySelector(SEL.rowChannel));
      // YouTube shows unavailable videos as "[Private video]", "[Deleted video]" (in your language), with no channel.
      return { id, title, channel, unavailable: /^\[.+\]$/.test(title) && !channel };
    }

    async function check() {
      timer = 0;
      const list = activeList();
      if (stopped || !list || !listId) return;
      const rows = [...list.querySelectorAll(SEL.playlistRow)].map(read).filter((r) => r.id);
      if (!rows.length) return;
      let hidden = 0;
      for (const el of document.querySelectorAll(SEL.playlistAlert)) if (!el.closest(SEL.hidden)) hidden += hiddenCount(el.textContent);
      const id = listId;
      const now = Date.now();
      const { found, snapshot } = compare(await sget('p:' + id), rows, { complete: !list.querySelector(SEL.continuation), hidden, now });
      const index = (await sget('snaps')) || {};
      const bytes = JSON.stringify(snapshot).length;
      const room = budget(index, id, bytes);
      const writes = {};
      if (room.save) {
        writes['p:' + id] = snapshot;
        index[id] = { bytes, at: now };
      }
      for (const old of room.drop) delete index[old];
      writes.snaps = index;
      if (found.length) {
        writes.alerts = addAlerts(await sget('alerts'), found, { list: id, listTitle: document.title.replace(/\s*-\s*YouTube\s*$/, ''), now });
      }
      await chrome.storage.local.set(writes);
      if (room.drop.length) await chrome.storage.local.remove(room.drop.map((old) => 'p:' + old));
      if (id === listId) await show();
    }

    /** The notice: this playlist's alerts you haven't marked as seen. */
    async function show() {
      const mine = ((await sget('alerts')) || []).filter((a) => a.list === listId && !a.ack);
      const list = activeList();
      if (stopped || !mine.length || !list) { host.remove(); return; }
      const items = mine.slice(-SHOWN).reverse().map((a) => h('li', null,
        h('strong', { text: a.title || a.id }),
        a.channel ? ` (${a.channel})` : '',
        h('span', { class: 'what', text: ` · ${WHAT[a.kind] ? t(WHAT[a.kind]) : a.kind}${a.seen ? ' · ' + t('optAlertLastSeen', new Date(a.seen).toLocaleDateString()) : ''}` })));
      const seenBtn = h('button', { type: 'button' }, t('removedSeenIt'));
      seenBtn.addEventListener('click', async () => {
        const all = ((await sget('alerts')) || []).map((a) => (a.list === listId ? { ...a, ack: true } : a));
        await chrome.storage.local.set({ alerts: all });
        host.remove();
      });
      const note = h('section', { class: 'note', role: 'region', 'aria-label': t('removedRegion') },
        h('h2', { text: mine.length === 1 ? t('removedHeadingOne') : t('removedHeadingMany', mine.length) }),
        h('ul', null, ...items),
        h('div', { class: 'row' }, seenBtn,
          mine.length > SHOWN ? h('span', { class: 'more', text: t('removedMore', mine.length - SHOWN) }) : null,
          h('span', { class: 'where', text: t('removedWhere') })));
      [...shadow.children].filter((el) => el !== css).forEach((el) => el.remove());
      shadow.append(note);
      const anchor = list.closest(SEL.playlistList) || list;
      const tools = anchor.previousElementSibling; // the playlist tools sit right above the list: go above them
      if (!host.isConnected) (tools && tools.id === 'true-shuffle-playlist-tools' ? tools : anchor).before(host);
    }

    function schedule() {
      clearTimeout(timer);
      timer = setTimeout(() => { check().catch(() => {}); }, SETTLE_MS);
    }
    const stopWatch = root.TrueShuffleWatcher.watch({
      pages: ['playlist'],
      enter(page) {
        const id = new URL(page.url).searchParams.get('list');
        listId = id && !SKIP.test(id) ? id : null;
        host.remove();
      },
      videos: () => { if (listId) schedule(); },
      leave() {
        clearTimeout(timer);
        listId = null;
        host.remove();
      },
    });
    return () => {
      stopped = true;
      clearTimeout(timer);
      stopWatch();
      host.remove();
    };
  }

  return { MAX_SNAPSHOT_BYTES, MAX_TOTAL_BYTES, MAX_ALERTS, WHAT, compare, addAlerts, hiddenCount, budget, field, stamp, toCsv, start };
});
