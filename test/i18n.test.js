'use strict';
// The language files: every language has English's messages with the same placeholders, every key the code
// asks for exists, and no English is left in the extension's pages.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const LOCALES = fs.readdirSync(path.join(ROOT, '_locales'));
const messages = Object.fromEntries(LOCALES.map((l) => [l, JSON.parse(read(`_locales/${l}/messages.json`))]));
const EN = messages.en;
const KEYS = Object.keys(EN);
const tokens = (text) => [...text.matchAll(/\$([A-Za-z0-9_@]+)\$/g)].map((m) => m[1].toLowerCase()).sort();
const placeholders = (entry) => Object.entries(entry.placeholders || {}).map(([name, p]) => `${name.toLowerCase()}=${p.content}`).sort();

// Every source file that can ask for a message.
const SOURCES = ['manifest.json', ...['src', 'popup', 'options', 'welcome'].flatMap((dir) => fs.readdirSync(path.join(ROOT, dir))
  .filter((f) => /\.(js|html)$/.test(f)).map((f) => `${dir}/${f}`))];
const code = Object.fromEntries(SOURCES.map((f) => [f, read(f)]));

test('the languages: English, Italian, Portuguese (Brazil), Spanish', () => {
  assert.deepEqual(LOCALES.sort(), ['en', 'es', 'it', 'pt_BR']);
  assert.equal(JSON.parse(read('manifest.json')).default_locale, 'en');
});

test('every language has exactly the English keys, each with a message', () => {
  for (const [locale, msgs] of Object.entries(messages)) {
    assert.deepEqual(Object.keys(msgs).sort(), [...KEYS].sort(), locale);
    for (const [key, entry] of Object.entries(msgs)) assert.ok(entry.message && entry.message.trim(), `${locale}: ${key} is empty`);
  }
  for (const [key, entry] of Object.entries(EN)) assert.ok(entry.description, `en: ${key} has no description for translators`);
});

test('message names are unique ignoring case (the browser compares them that way)', () => {
  const lower = KEYS.map((k) => k.toLowerCase());
  assert.equal(new Set(lower).size, lower.length);
  for (const key of KEYS) assert.match(key, /^[A-Za-z0-9_]+$/);
});

test('placeholders: defined, used, and the same in every language', () => {
  for (const [locale, msgs] of Object.entries(messages)) {
    for (const [key, entry] of Object.entries(msgs)) {
      const defined = Object.keys(entry.placeholders || {}).map((n) => n.toLowerCase()).sort();
      assert.deepEqual([...new Set(tokens(entry.message))].sort(), defined, `${locale}: ${key}`);
      assert.deepEqual(placeholders(entry), placeholders(EN[key]), `${locale}: ${key} placeholders differ from English`);
      assert.doesNotMatch(entry.message.replace(/\$[A-Za-z0-9_@]+\$/g, ''), /\$/, `${locale}: ${key} has a stray $`);
    }
  }
});

test('typographic apostrophes (’), and store limits', () => {
  for (const [locale, msgs] of Object.entries(messages)) {
    for (const [key, entry] of Object.entries(msgs)) assert.doesNotMatch(entry.message, /'/, `${locale}: ${key}`);
    assert.ok(msgs.extDescription.message.length <= 132, `${locale}: the store summary is over 132 characters`);
    assert.equal(msgs.extName.message, EN.extName.message, `${locale}: the name is a brand`);
    assert.equal(msgs.extShortName.message, EN.extShortName.message, `${locale}: the short name is a brand`);
  }
});

test('every key the code names exists, and every key is used somewhere', () => {
  const asked = new Set();
  const add = (key, where) => { assert.ok(EN[key], `${where} asks for "${key}", which en/messages.json lacks`); asked.add(key); };
  const prefixes = 'ext|opt|card|shuffle|err|tools|removed|popup|welcome|news'; // not set*: page.js has a 'setActive' request
  for (const [file, text] of Object.entries(code)) {
    if (file === 'src/i18n.js') continue; // the helper itself: its comments show t('key')
    for (const m of text.matchAll(/__MSG_(\w+)__/g)) add(m[1], file);
    for (const m of text.matchAll(/data-i18n(?:-[a-z-]+)?="([^"]+)"/g)) add(m[1], file);
    for (const m of text.matchAll(/\b(?:t|parts)\(\s*'([^']+)'/g)) add(m[1], file);
    if (file.endsWith('.js')) for (const m of text.matchAll(new RegExp(`'((?:${prefixes})[A-Z]\\w*)'`, 'g'))) add(m[1], file);
  }
  for (const [, key] of require('../src/playlist-tools.js').SORTS) add(key, 'SORTS');
  for (const key of Object.values(require('../src/removed.js').WHAT)) add(key, 'WHAT');
  add('lang', 'translate()');
  const everything = Object.values(code).join('\n');
  for (const key of KEYS) assert.ok(asked.has(key) || everything.includes(`'${key}'`), `"${key}" is in en/messages.json but nothing uses it`);
});

test('no English left in the extension pages: every text and label comes from a message', () => {
  const BRAND = /^(True Shuffle|Alt\+Shift\+U)?$/;
  for (const file of SOURCES.filter((f) => f.endsWith('.html'))) {
    const html = code[file].replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)\b[\s\S]*?<\/\1>/g, '');
    for (const m of html.matchAll(/>([^<]+)</g)) assert.match(m[1].trim(), BRAND, `${file}: text "${m[1].trim()}"`);
    for (const m of html.matchAll(/\s(title|aria-label|placeholder|alt)="([^"]*)"/g)) assert.match(m[2], BRAND, `${file}: ${m[1]}="${m[2]}"`);
  }
});

test('parts() puts elements where the message has its placeholders, in the language\'s word order', () => {
  const said = { a: '$1 of $2 played', b: 'Riprodotti: $2 su... $1' };
  globalThis.chrome = { i18n: { getMessage: (k, v) => (said[k] || '').replace(/\$(\d)/g, (_, n) => v[n - 1]) } };
  delete require.cache[require.resolve('../src/i18n.js')];
  const { t, parts } = require('../src/i18n.js');
  const pos = { el: 'strong' };
  assert.deepEqual(parts('a', pos, '40'), [pos, ' of ', '40', ' played']);
  assert.deepEqual(parts('b', pos, '40'), ['Riprodotti: ', '40', ' su... ', pos]);
  assert.equal(t('a', 3, 40), '3 of 40 played');
  assert.equal(t('nope'), 'nope'); // a missing message shows its key, not a blank
  delete globalThis.chrome;
  assert.equal(t('a'), 'a'); // no extension context: still no crash
});
