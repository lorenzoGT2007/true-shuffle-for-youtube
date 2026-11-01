'use strict';

const { t, parts, translate } = TrueShuffleI18n;

async function init() {
  translate(document);
  document.getElementById('version').textContent = t('optVersion', chrome.runtime.getManifest().version);
  await TrueShuffleSettings.init(); // ../popup/settings.js: every switch on this page
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
      const where = el('span', 'meta', ' · ');
      where.append(...parts('optAlertWhere', R.stamp(a.at),
        link('https://www.youtube.com/playlist?list=' + encodeURIComponent(a.list), a.listTitle || a.list)));
      li.append(
        link('https://www.youtube.com/watch?v=' + encodeURIComponent(a.id), a.title || a.id),
        a.channel ? ` (${a.channel})` : '',
        el('span', 'what', ` ${R.WHAT[a.kind] ? t(R.WHAT[a.kind]) : a.kind}`),
        where,
        a.seen ? el('span', 'meta', ' · ' + t('optAlertLastSeen', R.stamp(a.seen))) : '');
      return li;
    }));
    empty.hidden = alerts.length > 0;
    csv.disabled = clear.disabled = !alerts.length;
  }

  csv.addEventListener('click', async () => {
    const url = URL.createObjectURL(new Blob(['﻿' + R.toCsv(await load(), t)], { type: 'text/csv' })); // BOM: spreadsheets read UTF-8
    const a = Object.assign(document.createElement('a'), { href: url, download: 'true-shuffle-alerts.csv' });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  });
  clear.addEventListener('click', async () => {
    if (!confirm(t('optAlertsConfirm'))) return;
    await chrome.storage.local.set({ alerts: [] });
  });
  chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && changes.alerts) render(); });
  await render();
}

init();
