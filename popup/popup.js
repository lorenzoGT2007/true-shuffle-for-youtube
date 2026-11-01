'use strict';

const DEFAULTS = { spread: true, onFinish: 'reshuffle', showButton: true, corner: 'right', collapsed: false, autoStart: true };
const VIEWS = ['none', 'reload', 'noplaylist', 'idle', 'loading', 'active', 'paused', 'finished', 'error'];
const LINKS = {
  'open-playlists': 'https://www.youtube.com/feed/playlists',
  coffee: 'https://buymeacoffee.com/lorenzogt',
};
const fmt = (n) => Number(n || 0).toLocaleString();

let tab = null;

function show(name) {
  for (const v of VIEWS) document.getElementById('view-' + v).hidden = v !== name;
}

function setField(view, name, value) {
  for (const el of document.querySelectorAll(`#view-${view} [data-field="${name}"]`)) el.textContent = value;
}

function setBar(view, name, fraction) {
  const el = document.querySelector(`#view-${view} [data-field="${name}"]`);
  if (el) el.style.width = `${Math.max(0, Math.min(1, fraction || 0)) * 100}%`;
}

const isYouTube = (url) => /^https:\/\/www\.youtube\.com\//.test(url || '');

function render(s) {
  const title = s.title || 'This playlist';
  switch (s.phase) {
    case 'loading': {
      const l = s.loading || {};
      setField('loading', 'loading-text', l.loaded
        ? (l.total ? `${fmt(l.loaded)} of ${fmt(l.total)} videos` : `${fmt(l.loaded)} videos so far`)
        : 'Getting every video, not just the first 200');
      setBar('loading', 'loading-bar', l.total ? l.loaded / l.total : 0);
      return show('loading');
    }
    case 'active':
      setField('active', 'title', title);
      setField('active', 'pos', fmt(s.position));
      setField('active', 'total', fmt(s.total));
      setField('active', 'round', s.round > 1 ? `Round ${s.round}` : '');
      setField('active', 'next', s.next
        ? (s.next.title || s.next.id) + (s.next.channel ? `, ${s.next.channel}` : '')
        : 'A fresh shuffle of the whole playlist');
      setBar('active', 'bar', s.total ? s.position / s.total : 0);
      return show('active');
    case 'paused':
      setField('paused', 'title', title);
      setField('paused', 'paused-text', `You left the playlist. ${fmt(s.position)} of ${fmt(s.total)} played.`);
      document.getElementById('switch-btn').hidden = !(s.page.shufflable && s.page.list !== s.listId);
      return show('paused');
    case 'finished':
      setField('finished', 'title', title);
      setField('finished', 'finished-text', `All ${fmt(s.total)} videos played`);
      return show('finished');
    case 'error':
      setField('error', 'error', s.error || 'Something went wrong.');
      return show('error');
    default:
      break;
  }
  if (!s.page.shufflable) {
    if (s.page.mix) {
      document.getElementById('noplaylist-lead').textContent = 'Mixes can’t be shuffled';
      document.getElementById('noplaylist-text').textContent = 'A Mix is an endless list YouTube keeps generating. Save the songs to a playlist and shuffle that.';
    }
    return show('noplaylist');
  }
  setField('idle', 'title', title);
  const saved = s.saved;
  document.getElementById('idle-saved').hidden = !saved;
  document.getElementById('idle-new').hidden = !!saved;
  if (saved) {
    setField('idle', 'saved-pos', fmt(saved.pos));
    setField('idle', 'saved-total', fmt(saved.total));
    setBar('idle', 'saved-bar', saved.total ? saved.pos / saved.total : 0);
  }
  return show('idle');
}

async function refresh() {
  if (!tab) return show('none');
  let status = null;
  try {
    status = await chrome.tabs.sendMessage(tab.id, { type: 'status' });
  } catch (_) {
    status = null;
  }
  // TEMP debug: what the page watcher sees in the tab.
  const debugLine = document.getElementById('debug-page');
  const dp = status && status.ok && status.debugPage;
  debugLine.hidden = !dp;
  if (dp) debugLine.textContent = `Debug: page ${dp.type || 'unknown'}, ${fmt(dp.videos)} videos seen`;
  if (!status || !status.ok) return show(isYouTube(tab.url) ? 'reload' : 'none');
  return render(status);
}

async function act(type) {
  if (LINKS[type]) {
    await chrome.tabs.create({ url: LINKS[type] });
    window.close();
    return;
  }
  if (type === 'options') {
    await chrome.runtime.openOptionsPage();
    window.close();
    return;
  }
  if (type === 'reload-tab') {
    await chrome.tabs.reload(tab.id);
    window.close();
    return;
  }
  try {
    const status = await chrome.tabs.sendMessage(tab.id, { type });
    if (status && status.ok) render(status);
  } catch (_) {
    refresh();
  }
}

async function initSettings() {
  const stored = (await chrome.storage.local.get('settings')).settings || {};
  const settings = { ...DEFAULTS, ...stored };
  const save = (patch) => {
    Object.assign(settings, patch);
    chrome.storage.local.set({ settings });
  };
  const auto = document.getElementById('set-auto');
  const spread = document.getElementById('set-spread');
  const button = document.getElementById('set-button');
  auto.checked = !!settings.autoStart;
  spread.checked = !!settings.spread;
  button.checked = !!settings.showButton;
  auto.addEventListener('change', () => save({ autoStart: auto.checked }));
  spread.addEventListener('change', () => save({ spread: spread.checked }));
  button.addEventListener('change', () => save({ showButton: button.checked }));
  // The unwatched filter keeps its own storage key; read it fresh so the options page's values stay.
  const unwatched = document.getElementById('set-unwatched');
  const filter = async () => (await chrome.storage.local.get('unwatched')).unwatched || {};
  unwatched.checked = !!(await filter()).enabled;
  unwatched.addEventListener('change', async () => {
    chrome.storage.local.set({ unwatched: { ...(await filter()), enabled: unwatched.checked } });
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.unwatched) unwatched.checked = !!(changes.unwatched.newValue || {}).enabled;
  });
  for (const name of ['onFinish', 'corner']) {
    for (const input of document.querySelectorAll(`input[name="${name}"]`)) {
      input.checked = input.value === settings[name];
      input.addEventListener('change', () => { if (input.checked) save({ [name]: input.value }); });
    }
  }
}

async function init() {
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (btn) act(btn.dataset.act);
  });
  await initSettings();
  const forced = new URLSearchParams(location.search).get('tab');
  if (forced) tab = await chrome.tabs.get(Number(forced));
  else [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  await refresh();
  requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.remove('preload')));
  setInterval(refresh, 800);
}

init();
