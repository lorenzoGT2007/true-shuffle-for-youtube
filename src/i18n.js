/*
 * True Shuffle: the extension's words, from _locales/<language>/messages.json (English is the default).
 * The browser picks the language from its own; a missing message falls back to English by itself.
 *
 * t('key', ...values) gives a message with its $PLACEHOLDERS$ filled in. parts('key', ...nodes) gives
 * the same message split around elements (a bold number, a link) for append() or h(), because the
 * order of words differs between languages. translate(document) fills the extension's own pages:
 * data-i18n="key" sets an element's text, data-i18n-title / -aria-label / -placeholder / -alt its attributes.
 * Loaded first in the isolated world and by every extension page; Node's tests require() it.
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TrueShuffleI18n = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  const ATTRS = ['title', 'aria-label', 'placeholder', 'alt'];
  const MARK = '\uE000'; // private-use character: never in a message, so it can't be mistaken for one

  /** The message, or its key when there is none (a missing key then shows up instead of a blank). */
  function t(key, ...values) {
    let text = '';
    try { text = root.chrome.i18n.getMessage(key, values.map(String)); } catch (_) { /* extension reloaded underneath */ }
    return text || key;
  }

  /** t() with each value an element: ['3 ', strong, ' of ', span] for append(...parts(key, strong, span)). */
  function parts(key, ...nodes) {
    const text = t(key, ...nodes.map((_, i) => MARK + i + MARK));
    return text.split(new RegExp(MARK + '(\\d+)' + MARK)).map((piece, i) => (i % 2 ? nodes[Number(piece)] : piece)).filter((p) => p !== '');
  }

  /** Fills an extension page's marked elements, and sets its language for screen readers. */
  function translate(doc) {
    for (const el of doc.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
    for (const attr of ATTRS) {
      for (const el of doc.querySelectorAll(`[data-i18n-${attr}]`)) el.setAttribute(attr, t(el.getAttribute(`data-i18n-${attr}`)));
    }
    if (doc.documentElement) doc.documentElement.lang = t('lang');
  }

  return { t, parts, translate };
});
