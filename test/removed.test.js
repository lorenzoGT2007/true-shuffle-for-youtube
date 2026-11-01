'use strict';
// Unit tests for the removed-video check's comparison and history (src/removed.js). Run from the repo root: node --test
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../src/removed.js');

const T0 = Date.parse('2026-10-01T10:00:00Z');
const T1 = Date.parse('2026-11-01T10:00:00Z');
const row = (id, title = 'Title ' + id, channel = 'Channel', unavailable = false) => ({ id, title, channel, unavailable });
const first = (rows, ctx = {}) => R.compare(undefined, rows, { complete: true, hidden: 0, now: T0, ...ctx }).snapshot;
const kinds = (found) => found.map((f) => `${f.id}:${f.kind}`).join(' ');

test('first visit: nothing to report, everything saved with the date seen', () => {
  const { found, snapshot } = R.compare(undefined, [row('a'), row('b'), row('a')], { complete: true, hidden: 0, now: T0 });
  assert.deepEqual(found, []);
  assert.deepEqual(snapshot.videos, { a: ['Title a', 'Channel', T0, 0], b: ['Title b', 'Channel', T0, 0] });
  assert.equal(snapshot.v, 1);
});

test('nothing changed: nothing reported, the date seen moves on', () => {
  const { found, snapshot } = R.compare(first([row('a'), row('b')]), [row('b'), row('a')], { complete: true, now: T1 });
  assert.deepEqual(found, []);
  assert.equal(snapshot.videos.a[2], T1);
});

test('a video gone from a fully loaded playlist is reported with its saved title, then forgotten', () => {
  const saved = first([row('a', 'Kept'), row('b', 'Lost song', 'Some band')]);
  const { found, snapshot } = R.compare(saved, [row('a', 'Kept')], { complete: true, now: T1 });
  assert.deepEqual(found, [{ id: 'b', title: 'Lost song', channel: 'Some band', seen: T0, kind: 'removed' }]);
  assert.equal('b' in snapshot.videos, false);
  assert.deepEqual(R.compare(snapshot, [row('a', 'Kept')], { complete: true, now: T1 }).found, []); // reported once
});

test('a partly loaded playlist never reports missing videos, and keeps them for next time', () => {
  const saved = first([row('a'), row('b'), row('c')]);
  const { found, snapshot } = R.compare(saved, [row('a')], { complete: false, now: T1 });
  assert.deepEqual(found, []);
  assert.deepEqual(Object.keys(snapshot.videos).sort(), ['a', 'b', 'c']);
  assert.equal(snapshot.videos.b[2], T0); // not seen this time
  // Once everything is loaded, the comparison runs against what was saved before.
  assert.equal(kinds(R.compare(snapshot, [row('a'), row('c')], { complete: true, now: T1 }).found), 'b:removed');
});

test('a row YouTube now shows as "[Private video]" is reported once, with the title saved before', () => {
  const saved = first([row('a', 'Nice video', 'Chan'), row('b')]);
  const now = [row('a', '[Private video]', '', true), row('b')];
  const { found, snapshot } = R.compare(saved, now, { complete: false, now: T1 });
  assert.deepEqual(found, [{ id: 'a', title: 'Nice video', channel: 'Chan', seen: T0, kind: 'unavailable' }]);
  assert.deepEqual(snapshot.videos.a, ['Nice video', 'Chan', T0, 1]); // the real title stays
  assert.deepEqual(R.compare(snapshot, now, { complete: true, now: T1 }).found, []); // not twice
  // YouTube then hides it ("1 unavailable video is hidden"): still not reported again.
  assert.deepEqual(R.compare(snapshot, [row('b')], { complete: true, hidden: 1, now: T1 }).found, []);
  // A video already unavailable on the first visit has no real title to report.
  const s2 = first([row('x', '[Deleted video]', '', true)]);
  assert.deepEqual(R.compare(s2, [row('x', '[Deleted video]', '', true)], { complete: true, now: T1 }).found, []);
});

test('YouTube\'s "N unavailable videos are hidden": gone videos explained by newly hidden ones', () => {
  const saved = first([row('a'), row('b'), row('c'), row('d')], { hidden: 1 }); // 1 was already hidden
  const ctx = (hidden) => ({ complete: true, hidden, now: T1 });
  assert.equal(kinds(R.compare(saved, [row('a'), row('b')], ctx(3)).found), 'c:hidden d:hidden'); // 2 more hidden: both
  assert.equal(kinds(R.compare(saved, [row('a'), row('b')], ctx(2)).found), 'c:unclear d:unclear'); // 1 more for 2 gone
  assert.equal(kinds(R.compare(saved, [row('a'), row('b')], ctx(1)).found), 'c:removed d:removed'); // none more
  assert.equal(kinds(R.compare(saved, [row('a'), row('b')], ctx(0)).found), 'c:removed d:removed');
});

test('the hidden count becomes the baseline only from a fully loaded visit', () => {
  const saved = first([row('a'), row('b')], { hidden: 0 });
  const partial = R.compare(saved, [row('a')], { complete: false, hidden: 1, now: T1 }).snapshot;
  assert.equal(partial.hidden, 0); // a partial visit doesn't move the baseline...
  assert.equal(kinds(R.compare(partial, [row('a')], { complete: true, hidden: 1, now: T1 }).found), 'b:hidden'); // ...so this still counts
  assert.equal(R.compare(saved, [row('a'), row('b')], { complete: true, hidden: 2, now: T1 }).snapshot.hidden, 2);
});

test('an unknown snapshot version is treated as a first visit', () => {
  assert.deepEqual(R.compare({ v: 99, videos: { a: ['x', 'y', T0, 0] } }, [row('b')], { complete: true, now: T1 }).found, []);
});

test('addAlerts appends with the playlist, unseen, and keeps the newest MAX_ALERTS', () => {
  const found = [{ id: 'b', title: 'Lost', channel: 'C', seen: T0, kind: 'removed' }];
  const h = R.addAlerts([], found, { list: 'PL1', listTitle: 'My list', now: T1 });
  assert.deepEqual(h, [{ at: T1, list: 'PL1', listTitle: 'My list', id: 'b', title: 'Lost', channel: 'C', seen: T0, kind: 'removed', ack: false }]);
  const many = Array.from({ length: R.MAX_ALERTS }, (_, i) => ({ id: 'old' + i }));
  const capped = R.addAlerts(many, found, { list: 'PL1', listTitle: 'x', now: T1 });
  assert.equal(capped.length, R.MAX_ALERTS);
  assert.equal(capped[0].id, 'old1');
  assert.equal(capped[capped.length - 1].id, 'b');
});

test('hiddenCount reads YouTube\'s note', () => {
  assert.equal(R.hiddenCount('1 unavailable video is hidden'), 1);
  assert.equal(R.hiddenCount('Some text. 12 unavailable videos are hidden Show'), 12);
  assert.equal(R.hiddenCount('1,204 unavailable videos are hidden'), 1204);
  assert.equal(R.hiddenCount('Nothing to see'), 0);
});

test('budget: a too-big snapshot isn\'t saved; the oldest snapshots go when all of them would not fit', () => {
  assert.deepEqual(R.budget({}, 'PL', R.MAX_SNAPSHOT_BYTES + 1), { save: false, drop: [] });
  assert.deepEqual(R.budget({ PL: { bytes: 5, at: 1 } }, 'PL', 1000), { save: true, drop: [] });
  // Ten saved snapshots at the per-playlist limit fill the total; a new 1 MB one pushes out just the oldest.
  const index = { PL: { bytes: R.MAX_SNAPSHOT_BYTES, at: 0 } }; // this playlist's own old entry doesn't count
  for (let i = 1; i <= R.MAX_TOTAL_BYTES / R.MAX_SNAPSHOT_BYTES; i++) index['p' + i] = { bytes: R.MAX_SNAPSHOT_BYTES, at: i };
  assert.deepEqual(R.budget(index, 'PL', 1000000), { save: true, drop: ['p1'] });
});

test('toCsv: newest first, quoted where needed, formulas defused', () => {
  const at = new Date(2026, 10, 1, 13, 5).getTime();
  const seen = new Date(2026, 9, 3, 9, 0).getTime();
  const csv = R.toCsv([
    { at, list: 'PL1', listTitle: 'Mix, vol. 2', id: 'v1', title: 'Say "hi"', channel: 'Chan', seen, kind: 'removed', ack: true },
    { at, list: 'PL1', listTitle: 'Mix', id: 'v2', title: '=HYPERLINK("x")', channel: '+Band', seen: null, kind: 'hidden', ack: false },
  ]);
  const lines = csv.split('\r\n');
  assert.equal(lines[0], 'Found,Playlist,Playlist ID,Video ID,Title,Channel,Last seen,What happened,Seen it');
  assert.equal(lines[1], `2026-11-01 13:05,Mix,PL1,v2,"'=HYPERLINK(""x"")",'+Band,,became private or deleted (YouTube hides it),no`);
  assert.equal(lines[2], '2026-11-01 13:05,"Mix, vol. 2",PL1,v1,"Say ""hi""",Chan,2026-10-03 09:00,removed from the playlist,yes');
  assert.equal(lines[3], '');
});
