'use strict';
// Unit tests for the shuffle engine (src/shuffle.js). Run from the repo root: node --test
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../src/shuffle.js');

const range = (n, prefix = 'v') => Array.from({ length: n }, (_, i) => prefix + i);
const sorted = (a) => [...a].sort();
// Test ids are '<channel letter><number>': 'a3' is the fourth video of channel 'a'.
const channelOf = (id) => id[0];
const videos = (channels, perChannel) => [...channels].flatMap((c) => range(perChannel, c));

function sameChannelPairs(order, keyOf = channelOf) {
  let n = 0;
  for (let i = 1; i < order.length; i++) if (keyOf(order[i]) && keyOf(order[i]) === keyOf(order[i - 1])) n++;
  return n;
}

// Statistical checks use bounds of 6+ standard deviations, so they don't fail by chance.

test('randomInt stays in [0, n) and rejects bad n', () => {
  for (const n of [1, 2, 3, 7, 1000, 2 ** 32 - 1]) {
    for (let i = 0; i < 200; i++) {
      const x = T.randomInt(n);
      assert.ok(Number.isInteger(x) && x >= 0 && x < n, `${x} for n = ${n}`);
    }
  }
  for (const bad of [0, -1, 1.5, NaN, '3']) assert.throws(() => T.randomInt(bad), RangeError);
});

test('randomInt is uniform', () => {
  const n = 6;
  const runs = 60000;
  const counts = new Array(n).fill(0);
  for (let i = 0; i < runs; i++) counts[T.randomInt(n)]++;
  for (const c of counts) assert.ok(Math.abs(c - runs / n) < 600, `bucket count ${c}`);
});

test('shuffleInPlace makes every ordering equally likely', () => {
  const runs = 48000;
  const counts = new Map();
  for (let i = 0; i < runs; i++) {
    const key = T.shuffleInPlace(['a', 'b', 'c', 'd']).join('');
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  assert.equal(counts.size, 24);
  for (const c of counts.values()) assert.ok(Math.abs(c - runs / 24) < 300, `ordering count ${c}`);
});

test('shuffleInPlace leaves arr[..from) alone', () => {
  for (let i = 0; i < 200; i++) {
    const arr = T.shuffleInPlace(range(10), 4);
    assert.deepEqual(arr.slice(0, 4), range(4));
    assert.deepEqual(sorted(arr.slice(4)), sorted(range(10).slice(4)));
  }
});

test('buildOrder returns each id once and puts `first` in front', () => {
  for (let i = 0; i < 100; i++) {
    const order = T.buildOrder(['x', 'y', 'z', 'x', 'w', 'y'], { first: 'z' });
    assert.deepEqual(sorted(order), ['w', 'x', 'y', 'z']);
    assert.equal(order[0], 'z');
  }
  // A `first` that isn't in the list is ignored.
  assert.deepEqual(sorted(T.buildOrder(['a', 'b'], { first: 'q' })), ['a', 'b']);
});

// The spread is a best-effort heuristic (as in 1.0.0): on balanced mixes it always succeeds; on small lopsided
// ones (a0 a1 b0) it can leave a pair it could have avoided.
test('buildOrder with spread never plays one channel twice in a row on a balanced mix', () => {
  const ids = videos('abcde', 6);
  for (let i = 0; i < 2000; i++) {
    const order = T.buildOrder(ids, { spread: true, keyOf: channelOf, first: i % 2 ? 'c3' : undefined });
    assert.equal(sameChannelPairs(order), 0, order.join(' '));
  }
});

test('buildOrder with spread still returns every video when one channel dominates', () => {
  const ids = [...range(10, 'a'), 'b0', 'b1'];
  for (let i = 0; i < 200; i++) assert.deepEqual(sorted(T.buildOrder(ids, { spread: true, keyOf: channelOf })), sorted(ids));
});

test('the spread leaves videos without a channel where they are', () => {
  const arr = ['x', 'y', 'z'];
  T.spreadInPlace(arr, () => '');
  assert.deepEqual(arr, ['x', 'y', 'z']);
});

test('spreadInPlace and respreadRest leave arr[..from) alone', () => {
  for (let i = 0; i < 300; i++) {
    const arr = T.shuffleInPlace(videos('abc', 4));
    const head = arr.slice(0, 5);
    T.spreadInPlace(arr, channelOf, 5);
    assert.deepEqual(arr.slice(0, 5), head);
    assert.deepEqual(sorted(arr), sorted(videos('abc', 4)));

    const s = T.createSession('PL', videos('abc', 4));
    for (let k = 0; k < 4; k++) T.advance(s);
    const played = s.order.slice(0, 4);
    T.respreadRest(s, channelOf);
    assert.deepEqual(s.order.slice(0, 4), played);
  }
});

test('buildOrder keeps the `avoid` ids out of the first slots', () => {
  const avoid = new Set(['v1', 'v2', 'v3']);
  for (let i = 0; i < 2000; i++) {
    const order = T.buildOrder(range(30), { avoid });
    assert.ok(order.slice(0, 3).every((id) => !avoid.has(id)), order.slice(0, 3).join());
  }
  // The protected window shrinks so the job stays possible: 3 of 4 ids avoided leaves 1 safe slot.
  for (let i = 0; i < 200; i++) assert.equal(T.buildOrder(['v0', 'v1', 'v2', 'v3'], { avoid })[0], 'v0');
});

test('createSession starts with nothing dealt, or with `first` dealt', () => {
  const s = T.createSession('PL1', ['a', 'b', 'c']);
  assert.equal(s.v, 1);
  assert.equal(s.listId, 'PL1');
  assert.equal(s.pos, -1);
  assert.equal(s.round, 1);
  assert.deepEqual(s.recent, []);
  assert.deepEqual(sorted(s.order), ['a', 'b', 'c']);
  assert.ok(Number.isFinite(s.createdAt) && s.updatedAt === s.createdAt);

  const f = T.createSession('PL1', ['a', 'b', 'c'], { first: 'b' });
  assert.equal(f.order[0], 'b');
  assert.equal(f.pos, 0);
  assert.deepEqual(f.recent, ['b']);
});

test('isSession accepts only current-version sessions', () => {
  const s = T.createSession('PL', ['a', 'b']);
  assert.ok(T.isSession(s));
  const bad = [null, undefined, {}, { ...s, v: 2 }, { ...s, order: 'ab' }, { ...s, pos: 2 }, { ...s, pos: -2 },
    { ...s, pos: 0.5 }, { ...s, recent: null }];
  for (const b of bad) assert.equal(T.isSession(b), false, JSON.stringify(b));
});

test('advance deals every video exactly once per round, then starts a new round', () => {
  const ids = range(25);
  const s = T.createSession('PL', ids);
  const dealt = [];
  for (let i = 0; i < 25; i++) {
    const r = T.advance(s, ids);
    assert.equal(r.newRound, false);
    assert.equal(r.finished, false);
    assert.equal(r.id, s.order[s.pos]);
    dealt.push(r.id);
  }
  assert.deepEqual(sorted(dealt), sorted(ids));
  const r = T.advance(s, ids);
  assert.deepEqual(r, { id: s.order[0], newRound: true, finished: false });
  assert.equal(s.round, 2);
  assert.equal(s.pos, 0);
  assert.deepEqual(sorted(s.order), sorted(ids));
});

test("advance with onFinish 'stop' reports finished and changes nothing", () => {
  const s = T.createSession('PL', ['a', 'b']);
  T.advance(s, ['a', 'b']);
  T.advance(s, ['a', 'b']);
  const before = JSON.stringify(s);
  assert.deepEqual(T.advance(s, ['a', 'b'], { onFinish: 'stop' }), { id: null, newRound: false, finished: true });
  assert.equal(JSON.stringify(s), before);
});

test('a new round uses the playlist as it is now, or the old deck when none is given', () => {
  const s = T.createSession('PL', ['a', 'b', 'c']);
  for (let i = 0; i < 3; i++) T.advance(s, null);
  T.advance(s, ['a', 'b', 'c', 'd']);
  assert.deepEqual(sorted(s.order), ['a', 'b', 'c', 'd']);
  for (let i = 0; i < 3; i++) T.advance(s, []);
  T.advance(s, []);
  assert.equal(s.round, 3);
  assert.deepEqual(sorted(s.order), ['a', 'b', 'c', 'd']);
});

test('advance on an empty deck finishes', () => {
  const s = T.createSession('PL', []);
  assert.deepEqual(T.advance(s, []), { id: null, newRound: true, finished: true });
});

test('a new round keeps the last videos heard away from its start', () => {
  const ids = range(30); // k = min(10, floor(30 / 3)) = 10
  for (let run = 0; run < 300; run++) {
    const s = T.createSession('PL', ids);
    for (let i = 0; i < 30; i++) T.advance(s, ids);
    const last10 = new Set(s.recent.slice(-10));
    T.advance(s, ids);
    assert.ok(s.order.slice(0, 10).every((id) => !last10.has(id)), s.order.slice(0, 10).join());
  }
});

test('recent remembers the last 60 videos dealt, without back-to-back repeats', () => {
  const ids = range(100);
  const s = T.createSession('PL', ids);
  const dealt = [];
  for (let i = 0; i < 100; i++) dealt.push(T.advance(s, ids).id);
  assert.deepEqual(s.recent, dealt.slice(-60));
  T.noteWatching(s, dealt[99]); // a replay of the video on screen isn't remembered twice
  assert.deepEqual(s.recent, dealt.slice(-60));
});

test('retreat steps back, and returns to the last dealt video after a replay', () => {
  const s = T.createSession('PL', ['a', 'b', 'c', 'd']);
  const x = T.advance(s).id;
  const y = T.advance(s).id;
  const z = T.advance(s).id;
  assert.equal(T.retreat(s, z), y);
  assert.equal(s.pos, 1);
  assert.equal(T.retreat(s, y), x);
  assert.equal(s.pos, 0);
  assert.equal(T.retreat(s, x), null); // nothing before the first video of a round
  assert.equal(s.pos, 0);
  T.advance(s);
  // You replayed `x` while `y` is the last dealt: previous goes back to `y` and pos stays.
  assert.equal(T.retreat(s, x), y);
  assert.equal(s.pos, 1);
});

test('noteWatching deals a picked video next, and treats a played one as a replay', () => {
  const s = T.createSession('PL', ['a', 'b', 'c', 'd', 'e']);
  const first = T.advance(s).id;
  const picked = s.order[3];
  assert.equal(T.noteWatching(s, picked), 'dealt');
  assert.equal(s.pos, 1);
  assert.equal(s.order[1], picked);
  assert.deepEqual(sorted(s.order), ['a', 'b', 'c', 'd', 'e']);

  const before = s.order.slice();
  assert.equal(T.noteWatching(s, first), 'replay');
  assert.deepEqual(s.order, before);
  assert.equal(s.pos, 1);
  assert.equal(s.recent[s.recent.length - 1], first);

  assert.equal(T.noteWatching(s, 'nope'), 'unknown');
  assert.deepEqual(s.order, before);
});

test('reconcile drops removed videos and slips new ones in among the unplayed', () => {
  for (let run = 0; run < 200; run++) {
    const s = T.createSession('PL', ['a', 'b', 'c', 'd', 'e', 'f']);
    for (let i = 0; i < 3; i++) T.advance(s);
    const played = s.order.slice(0, 3);
    const gone = [played[0], s.order[4]];
    const now = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].filter((id) => !gone.includes(id));
    assert.deepEqual(T.reconcile(s, now), { added: 2, removed: 2 });
    assert.deepEqual(sorted(s.order), sorted(now));
    assert.equal(s.pos, 1);
    assert.deepEqual(s.order.slice(0, 2), played.slice(1)); // what played stays played, in order
  }
});

test('reshuffleRest only reorders what has not played yet', () => {
  const s = T.createSession('PL', range(20));
  for (let i = 0; i < 7; i++) T.advance(s);
  const before = s.order.slice();
  T.reshuffleRest(s);
  assert.deepEqual(s.order.slice(0, 7), before.slice(0, 7));
  assert.deepEqual(sorted(s.order.slice(7)), sorted(before.slice(7)));
});

// ---------------------------------------------------------------- fixed bugs

// spreadInPlace as it was in 1.0.0, kept to prove the faster one makes exactly the same moves.
function spreadV1(arr, keyOf, from = 0) {
  const start = Math.max(from, 1);
  for (let i = start; i < arr.length; i++) {
    const prev = keyOf(arr[i - 1]);
    if (!prev || keyOf(arr[i]) !== prev) continue;
    let j = i + 1;
    while (j < arr.length && keyOf(arr[j]) === prev) j++;
    if (j >= arr.length) break;
    const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
  for (let i = start; i < arr.length; i++) {
    const c = keyOf(arr[i]);
    if (!c || keyOf(arr[i - 1]) !== c) continue;
    let p = -1;
    for (let q = start; q < i; q++) {
      if (keyOf(arr[q - 1]) !== c && keyOf(arr[q]) !== c) { p = q; break; }
    }
    if (p < 0) continue;
    const [moved] = arr.splice(i, 1);
    arr.splice(p, 0, moved);
  }
  return arr;
}

test('spreadInPlace makes exactly the moves 1.0.0 made', () => {
  // Mixes from balanced to one dominant channel, some videos without a channel ('-').
  const mixes = [videos('abcde', 6), [...range(40, 'a'), ...range(6, 'b'), ...range(3, 'c')],
    [...range(25, 'a'), ...range(25, 'b')], range(30, 'a'), [...videos('ab', 8), ...range(6, '-')]];
  const keyOf = (id) => (id[0] === '-' ? '' : id[0]);
  for (const mix of mixes) {
    for (let run = 0; run < 400; run++) {
      const arr = T.shuffleInPlace(mix.slice());
      const from = run % 3 === 0 ? 0 : T.randomInt(arr.length);
      assert.deepEqual(T.spreadInPlace(arr.slice(), keyOf, from), spreadV1(arr.slice(), keyOf, from));
    }
  }
  // Random shapes: 1 to 5 channels with skewed sizes, 2 to 121 videos.
  for (let run = 0; run < 2000; run++) {
    const channels = 'abcde'.slice(0, 1 + T.randomInt(5));
    const arr = range(2 + T.randomInt(120)).map((id) => (T.randomInt(20) ? channels[T.randomInt(1 + T.randomInt(channels.length))] : '-') + id);
    const from = T.randomInt(arr.length);
    assert.deepEqual(T.spreadInPlace(arr.slice(), keyOf, from), spreadV1(arr.slice(), keyOf, from));
  }
});

test('spreadInPlace stays linear when one channel fills most of the list', () => {
  // 1.0.0 rescanned for every pair: up to about n²/2 channel lookups (seconds on big lists).
  const mixes = [range(5000, 'u'), range(5000).map((id, i) => (i % 10 ? 'u' : 'x') + id),
    range(5000).map((id, i) => (i % 10 < 3 ? 'x' : 'u') + id)];
  for (const ids of mixes) {
    let lookups = 0;
    T.spreadInPlace(T.shuffleInPlace(ids), (id) => { lookups++; return id[0]; });
    assert.ok(lookups < 20 * ids.length, `${lookups} lookups for ${ids.length} videos`);
  }
});

test('a 2-video playlist never plays the same video twice in a row across rounds', () => {
  for (let i = 0; i < 2000; i++) {
    const s = T.createSession('PL', ['a', 'b']);
    T.advance(s);
    const last = T.advance(s).id;
    T.advance(s, ['a', 'b']);
    assert.notEqual(s.order[0], last);
  }
});

test('later rounds of a balanced mix keep the channel spread, across the round boundary too, and keep recent videos off the start', () => {
  const opts = { spread: true, keyOf: channelOf };
  for (const [channels, perChannel] of [['abcde', 6], ['ab', 15], ['abcd', 3], ['abcdefghij', 5]]) {
    const ids = videos(channels, perChannel);
    const k = Math.min(10, Math.floor(ids.length / 3));
    for (let run = 0; run < 500; run++) {
      const s = T.createSession('PL', ids, opts);
      for (let i = 0; i < ids.length; i++) T.advance(s, ids, opts); // all of round 1
      for (let round = 2; round <= 4; round++) {
        const last = s.order[s.pos];
        const recent = new Set(s.recent.slice(-k));
        T.advance(s, ids, opts); // shuffles the new round and deals its first video
        assert.equal(s.round, round);
        assert.equal(sameChannelPairs(s.order), 0, s.order.join(' '));
        assert.notEqual(channelOf(s.order[0]), channelOf(last));
        assert.ok(s.order.slice(0, k).every((id) => !recent.has(id)), s.order.slice(0, k).join());
        for (let i = 1; i < ids.length; i++) T.advance(s, ids, opts); // the rest of the round
      }
    }
  }
});

test('an ordered session (the playlist tools\' Play) deals exactly the videos given, in order, round after round', () => {
  const view = ['d', 'b', 'a', 'b', 'c']; // as shown on screen, a duplicate included
  const opts = { ordered: true, spread: true, keyOf: () => 'same channel' };
  const s = T.createSession('PL', view, opts);
  assert.deepEqual(s.order, ['d', 'b', 'a', 'c']);
  assert.equal(s.pos, -1);
  const dealt = [];
  for (let i = 0; i < 8; i++) dealt.push(T.advance(s, view, opts).id);
  assert.deepEqual(dealt, ['d', 'b', 'a', 'c', 'd', 'b', 'a', 'c']); // no spread, no recent-video rule
  assert.equal(s.round, 2);
  assert.deepEqual(T.advance(s, view, { ...opts, onFinish: 'stop' }).id, null);
});

test('a shuffled view deals only its own videos, in later rounds too', () => {
  const view = ['v3', 'v7', 'v1', 'v9'];
  const s = T.createSession('PL', view, { spread: true, keyOf: channelOf });
  const dealt = [];
  for (let i = 0; i < 12; i++) dealt.push(T.advance(s, view).id);
  assert.deepEqual([...new Set(dealt)].sort(), [...view].sort());
  for (let r = 0; r < 3; r++) assert.deepEqual(sorted(dealt.slice(r * 4, r * 4 + 4)), sorted(view)); // each round is the whole view
});

test('peekNext, upcoming and summary describe the deck from pos', () => {
  const s = T.createSession('PL', ['a', 'b', 'c']);
  assert.equal(T.peekNext(s), s.order[0]);
  assert.deepEqual(T.summary(s), { position: 0, total: 3, round: 1, left: 3 });
  T.advance(s);
  assert.deepEqual(T.upcoming(s, 5), s.order.slice(1));
  assert.deepEqual(T.upcoming(s, 1), s.order.slice(1, 2));
  assert.deepEqual(T.summary(s), { position: 1, total: 3, round: 1, left: 2 });
  T.advance(s);
  T.advance(s);
  assert.equal(T.peekNext(s), null);
  assert.deepEqual(T.upcoming(s, 5), []);
  assert.deepEqual(T.summary(s), { position: 3, total: 3, round: 1, left: 0 });
});
