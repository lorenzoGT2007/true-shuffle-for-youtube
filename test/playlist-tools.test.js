'use strict';
// Unit tests for the playlist tools' pure parts (src/playlist-tools.js). Run from the repo root: node --test
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../src/playlist-tools.js');

test('clockSeconds reads duration badges', () => {
  assert.equal(P.clockSeconds('4:05'), 245);
  assert.equal(P.clockSeconds(' 12:34 '), 754);
  assert.equal(P.clockSeconds('1:02:03'), 3723);
  for (const bad of ['LIVE', 'SHORTS', '', null, '4:5', 'Watched', '1:02:03:04']) assert.equal(P.clockSeconds(bad), null, String(bad));
});

test('addedAge reads "Added …", relative or as a date', () => {
  const now = Date.parse('2026-11-01T12:00:00Z');
  assert.equal(P.addedAge('Added today', now), 0);
  assert.equal(P.addedAge('Added yesterday', now), 86400);
  assert.equal(P.addedAge('Added 3 days ago', now), 3 * 86400);
  assert.equal(P.addedAge('added 1 week ago', now), 604800);
  assert.equal(P.addedAge('Added 2 years ago', now), 2 * 31536000);
  assert.equal(P.addedAge('Added on Oct 30, 2026', now) > 86400, true);
  assert.equal(P.addedAge('Added on Oct 30, 2026', now) < 3 * 86400, true);
  for (const other of ['3 days ago', '1.2M views', 'Added', 'Added sometime', null]) assert.equal(P.addedAge(other, now), null, String(other));
});

test('countIn reads the playlist length in several languages', () => {
  assert.equal(P.countIn('My list • 1,234 videos • 5,678 views'), 1234);
  assert.equal(P.countIn('1 video'), 1);
  assert.equal(P.countIn('1.234 video'), 1234);
  assert.equal(P.countIn('1 234 vídeos'), 1234);
  assert.equal(P.countIn('No videos'), null);
});

test('matches: every word, in title or channel, any case or accent', () => {
  const text = P.fold('Perché Sì — Lofi Beats' + ' ' + 'Chillhop Music');
  assert.ok(P.matches(text, 'lofi'));
  assert.ok(P.matches(text, 'perche'));
  assert.ok(P.matches(text, 'LOFI chillhop'));
  assert.ok(P.matches(text, '  '));
  assert.equal(P.matches(text, 'lofi jazz'), false);
});

const rows = [
  { id: 'a', title: 'video 10', channel: 'Zed', duration: 300, added: 50, watched: 1 },
  { id: 'b', title: 'Video 2', channel: 'alpha', duration: null, added: null, watched: null },
  { id: 'c', title: 'apple', channel: 'Alpha', duration: 60, added: 10, watched: 0.4 },
  { id: 'd', title: 'Apple', channel: 'beta', duration: 300, added: 50, watched: null },
];
const ids = (key) => P.order(rows, key).map((r) => r.id).join('');

test('order: each sort, ties and missing values keep the playlist order', () => {
  assert.equal(ids('original'), 'abcd');
  assert.equal(ids('title'), 'cdba'); // apple = Apple (playlist order between them), then 2 before 10
  assert.equal(ids('duration'), 'cadb'); // 60, 300, 300, then the unknown one
  assert.equal(ids('channel'), 'bcda'); // alpha = Alpha, beta, Zed
  assert.equal(ids('added'), 'cadb'); // newest first, unknown last
  assert.equal(ids('unwatched'), 'bdca'); // nothing watched first, then 40%, then all of it
  assert.equal(ids('nonsense'), 'abcd');
  assert.deepEqual(rows.map((r) => r.id), ['a', 'b', 'c', 'd']); // the input itself isn't reordered
});

test('the sort menu offers exactly the sorts asked for', () => {
  assert.deepEqual(P.SORTS.map(([key]) => key), ['original', 'title', 'duration', 'channel', 'added', 'unwatched']);
  assert.deepEqual(P.PAGES, ['playlist', 'watchLater']);
});
