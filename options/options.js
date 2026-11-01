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
}

init();
