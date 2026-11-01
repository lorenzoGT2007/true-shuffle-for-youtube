'use strict';

const DEFAULTS = { enabled: false, threshold: 90, partial: false }; // also in src/unwatched.js

async function current() {
  return { ...DEFAULTS, ...((await chrome.storage.local.get('unwatched')).unwatched || {}) };
}

async function init() {
  const threshold = document.getElementById('threshold');
  const value = document.getElementById('threshold-value');
  const partial = document.getElementById('partial');
  const cfg = await current();
  threshold.value = String(cfg.threshold);
  value.textContent = cfg.threshold + '%';
  partial.checked = !!cfg.partial;

  // Read again before writing: the popup or Alt+Shift+U may have switched the filter meanwhile.
  const save = async (patch) => chrome.storage.local.set({ unwatched: { ...(await current()), ...patch } });
  threshold.addEventListener('input', () => { value.textContent = threshold.value + '%'; });
  threshold.addEventListener('change', () => save({ threshold: Number(threshold.value) })); // on release, not every step
  partial.addEventListener('change', () => save({ partial: partial.checked }));
  await initAlerts();
}

/** Alerts: the removed-video check's history (src/removed.js), newest first, with CSV export. */
async function initAlerts() {
  const R = globalThis.TrueShuffleRemoved;
  const list = document.getElementById('alerts-list');
  const empty = document.getElementById('alerts-empty');
  const csv = document.getElementById('alerts-csv');
  const clear = document.getElementById('alerts-clear');
  const el = (tag, cls, text) => Object.assign(document.createElement(tag), cls ? { className: cls } : {}, text != null ? { textContent: text } : {});
  const link = (href, text) => Object.assign(el('a', null, text), { href, target: '_blank', rel: 'noopener' });
  const load = async () => (await chrome.storage.local.get('alerts')).alerts || [];

  async function render() {
    const alerts = await load();
    list.replaceChildren(...[...alerts].reverse().map((a) => {
      const li = el('li', a.ack ? 'alert' : 'alert new');
      li.append(
        link('https://www.youtube.com/watch?v=' + encodeURIComponent(a.id), a.title || a.id),
        a.channel ? ` (${a.channel})` : '',
        el('span', 'what', ` ${R.WHAT[a.kind] || a.kind}`),
        el('span', 'meta', ` · ${R.stamp(a.at)} in `),
        link('https://www.youtube.com/playlist?list=' + encodeURIComponent(a.list), a.listTitle || a.list),
        a.seen ? el('span', 'meta', ` · last seen ${R.stamp(a.seen)}`) : '');
      return li;
    }));
    empty.hidden = alerts.length > 0;
    csv.disabled = clear.disabled = !alerts.length;
  }

  csv.addEventListener('click', async () => {
    const url = URL.createObjectURL(new Blob(['﻿' + R.toCsv(await load())], { type: 'text/csv' })); // BOM: spreadsheets read UTF-8
    const a = Object.assign(document.createElement('a'), { href: url, download: 'true-shuffle-alerts.csv' });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  });
  clear.addEventListener('click', async () => {
    if (!confirm('Delete the whole alert history? The saved playlist snapshots stay.')) return;
    await chrome.storage.local.set({ alerts: [] });
  });
  chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && changes.alerts) render(); });
  await render();
}

init();
