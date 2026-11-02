'use strict';

const VIEWS = ['none', 'reload', 'noplaylist', 'idle', 'loading', 'active', 'paused', 'finished', 'error'];
const LINKS = {
  'open-playlists': 'https://www.youtube.com/feed/playlists',
  coffee: 'https://buymeacoffee.com/lorenzogt',
};
const fmt = (n) => Number(n || 0).toLocaleString();
const { t, parts } = TrueShuffleI18n;

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
  const title = s.title || t('popupThisPlaylist');
  switch (s.phase) {
    case 'loading': {
      const l = s.loading || {};
      setField('loading', 'loading-text', l.loaded
        ? (l.total ? t('popupLoadingOf', fmt(l.loaded), fmt(l.total)) : t('popupLoadingSoFar', fmt(l.loaded)))
        : t('popupLoadingStart'));
      setBar('loading', 'loading-bar', l.total ? l.loaded / l.total : 0);
      return show('loading');
    }
    case 'active':
      setField('active', 'title', title);
      setField('active', 'pos', fmt(s.position));
      setField('active', 'total', fmt(s.total));
      setField('active', 'round', s.round > 1 ? t('popupRound', s.round) : '');
      setField('active', 'next', s.next
        ? (s.next.title || s.next.id) + (s.next.channel ? `, ${s.next.channel}` : '')
        : t('popupNextFresh'));
      setBar('active', 'bar', s.total ? s.position / s.total : 0);
      return show('active');
    case 'paused':
      setField('paused', 'title', title);
      setField('paused', 'paused-text', t('popupPausedText', fmt(s.position), fmt(s.total)));
      document.getElementById('switch-btn').hidden = !(s.page.shufflable && s.page.list !== s.listId);
      return show('paused');
    case 'finished':
      setField('finished', 'title', title);
      setField('finished', 'finished-text', t('popupFinishedText', fmt(s.total)));
      document.querySelector('#view-finished [data-act="again"]').textContent = t(s.ordered ? 'popupPlayAgain' : 'popupShuffleAgain');
      return show('finished');
    case 'error':
      setField('error', 'error', s.error || t('popupErrorFallback'));
      return show('error');
    default:
      break;
  }
  if (!s.page.shufflable) {
    if (s.page.mix) {
      document.getElementById('noplaylist-lead').textContent = t('popupMixLead');
      document.getElementById('noplaylist-text').textContent = t('popupMixText');
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

async function init() {
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (btn) act(btn.dataset.act);
  });
  TrueShuffleI18n.translate(document);
  // The counts' numbers are elements inside the sentence, so setField() keeps finding them in any word order.
  const field = (view, name) => document.querySelector(`#view-${view} [data-field="${name}"]`);
  document.querySelector('#view-idle .count').replaceChildren(...parts('popupSavedCount', field('idle', 'saved-pos'), field('idle', 'saved-total')));
  document.querySelector('#view-active .count').replaceChildren(...parts('popupActiveCount', field('active', 'pos'), field('active', 'total')), field('active', 'round'));
  await TrueShuffleSettings.init();
  const forced = new URLSearchParams(location.search).get('tab');
  if (forced) tab = await chrome.tabs.get(Number(forced));
  else [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  await refresh();
  requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.remove('preload')));
  setInterval(refresh, 800);
}

init();
