/*
 * True Shuffle: the settings controls, shared by the toolbar popup and the options page. Each page has
 * the controls it shows, found by id or input name; the ones present are tied to storage and kept in step
 * when something else changes a setting (the other page, the card's fold-away arrow, Alt+Shift+U).
 * Needs src/i18n.js.
 */
(function (root) {
  'use strict';

  const DEFAULTS = {
    settings: { spread: true, onFinish: 'reshuffle', showButton: true, corner: 'right', collapsed: false, autoStart: true }, // also in src/content.js
    unwatched: { enabled: false, threshold: 90, partial: false }, // also in src/unwatched.js
  };
  // Switch id -> [storage key, field].
  const SWITCHES = {
    'set-auto': ['settings', 'autoStart'],
    'set-spread': ['settings', 'spread'],
    'set-button': ['settings', 'showButton'],
    'set-unwatched': ['unwatched', 'enabled'],
    'set-partial': ['unwatched', 'partial'],
  };
  const RADIOS = { onFinish: 'settings', corner: 'settings' }; // input name -> storage key

  async function read(key) {
    return { ...DEFAULTS[key], ...((await chrome.storage.local.get(key))[key] || {}) };
  }
  // Read again before writing: another page, the card or the shortcut may have changed it meanwhile.
  const save = async (key, patch) => chrome.storage.local.set({ [key]: { ...(await read(key)), ...patch } });

  async function init(doc = document) {
    const { parts } = root.TrueShuffleI18n;
    const switches = Object.entries(SWITCHES).map(([id, at]) => [doc.getElementById(id), ...at]).filter(([el]) => el);
    const radios = Object.entries(RADIOS).flatMap(([name, key]) => [...doc.querySelectorAll(`input[name="${name}"]`)].map((el) => [el, key, name]));
    const range = doc.getElementById('threshold');
    const rangeLabel = doc.getElementById('threshold-label');
    const percent = doc.createElement('strong');
    const showPercent = (n) => { percent.textContent = (n / 100).toLocaleString(undefined, { style: 'percent' }); };
    if (rangeLabel) rangeLabel.replaceChildren(...parts('setThreshold', percent));

    async function fill() {
      const values = { settings: await read('settings'), unwatched: await read('unwatched') };
      for (const [el, key, field] of switches) el.checked = !!values[key][field];
      for (const [el, key, name] of radios) el.checked = el.value === values[key][name];
      if (range && !range.matches(':active')) { // not while you drag it
        range.value = String(values.unwatched.threshold);
        showPercent(values.unwatched.threshold);
      }
    }

    for (const [el, key, field] of switches) el.addEventListener('change', () => save(key, { [field]: el.checked }));
    for (const [el, key, name] of radios) el.addEventListener('change', () => { if (el.checked) save(key, { [name]: el.value }); });
    if (range) {
      range.addEventListener('input', () => showPercent(Number(range.value)));
      range.addEventListener('change', () => save('unwatched', { threshold: Number(range.value) })); // on release, not every step
    }
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && (changes.settings || changes.unwatched)) fill();
    });
    await fill();
  }

  root.TrueShuffleSettings = { DEFAULTS, init };
})(globalThis);
