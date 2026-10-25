/*
 * True Shuffle: the shuffle engine.
 *
 * Works like dealing from a deck of cards: the whole playlist is shuffled once
 * (Fisher-Yates with crypto-grade randomness), then dealt one video at a time.
 * Nothing repeats until every video has played. When the deck runs out, a new
 * deck is shuffled, and the last few videos you heard are kept away from the
 * top of it so a song never plays twice in a row across the boundary.
 *
 * Pure logic: the only browser API used is crypto.getRandomValues.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TrueShuffle = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const RECENT_MAX = 60;
  const SESSION_VERSION = 1;

  // Random 32-bit words from the browser's cryptographic generator, fetched in batches.
  const pool = new Uint32Array(256);
  let poolAt = pool.length;
  function rand32() {
    if (poolAt >= pool.length) {
      globalThis.crypto.getRandomValues(pool);
      poolAt = 0;
    }
    return pool[poolAt++];
  }

  /** Uniform random integer in [0, n), without modulo bias. */
  function randomInt(n) {
    if (!Number.isInteger(n) || n <= 0) throw new RangeError('randomInt: n must be a positive integer');
    if (n === 1) return 0;
    const limit = 0x100000000 - (0x100000000 % n); // largest multiple of n that fits in 32 bits
    for (;;) {
      const x = rand32();
      if (x < limit) return x % n;
    }
  }

  /** Fisher-Yates shuffle of arr[from..end], in place. Every ordering is equally likely. */
  function shuffleInPlace(arr, from = 0) {
    for (let i = arr.length - 1; i > from; i--) {
      const j = from + randomInt(i - from + 1);
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  /**
   * Breaks up runs of the same channel in arr[from..], in place.
   * arr[from - 1] (if any) is treated as fixed, so the item after the one
   * that is playing right now is also checked. Videos without a channel are left alone.
   */
  function spreadInPlace(arr, keyOf, from = 0) {
    const start = Math.max(from, 1);
    // Forward pass: pull the nearest video from another channel into the gap.
    for (let i = start; i < arr.length; i++) {
      const prev = keyOf(arr[i - 1]);
      if (!prev || keyOf(arr[i]) !== prev) continue;
      let j = i + 1;
      while (j < arr.length && keyOf(arr[j]) === prev) j++;
      if (j >= arr.length) break; // the rest is all one channel; the pass below handles it
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    // Backward pass: a leftover same-channel pair near the end gets one of its videos
    // tucked into an earlier spot whose neighbours are both from other channels.
    for (let i = start; i < arr.length; i++) {
      const c = keyOf(arr[i]);
      if (!c || keyOf(arr[i - 1]) !== c) continue;
      let p = -1;
      for (let q = start; q < i; q++) {
        if (keyOf(arr[q - 1]) !== c && keyOf(arr[q]) !== c) { p = q; break; }
      }
      if (p < 0) continue; // nowhere to put it: this channel simply dominates the rest
      const [moved] = arr.splice(i, 1);
      arr.splice(p, 0, moved);
    }
    return arr;
  }

  /**
   * Keeps the ids in `avoid` out of the first positions of arr[from..].
   * The protected window is as large as it can be while staying solvable.
   */
  function pushBack(arr, avoid, from = 0) {
    let count = 0;
    for (let i = from; i < arr.length; i++) if (avoid.has(arr[i])) count++;
    const free = arr.length - from;
    const window = Math.min(count, free - count);
    if (window <= 0) return arr;
    const end = from + window;
    const spots = [];
    for (let j = end; j < arr.length; j++) if (!avoid.has(arr[j])) spots.push(j);
    for (let i = from; i < end; i++) {
      if (!avoid.has(arr[i])) continue;
      const pick = randomInt(spots.length);
      const j = spots[pick];
      spots[pick] = spots[spots.length - 1];
      spots.pop();
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  /**
   * A freshly shuffled order of `ids` (duplicates removed).
   * opts.first: put this id first (it is already playing).
   * opts.spread + opts.keyOf: avoid the same channel twice in a row.
   * opts.avoid: Set of ids to keep away from the start.
   */
  function buildOrder(ids, opts = {}) {
    const order = Array.from(new Set(ids));
    shuffleInPlace(order);
    let fixed = 0;
    if (opts.first != null) {
      const k = order.indexOf(opts.first);
      if (k >= 0) {
        order.splice(k, 1);
        order.unshift(opts.first);
        fixed = 1;
      }
    }
    if (opts.spread && typeof opts.keyOf === 'function') spreadInPlace(order, opts.keyOf, fixed);
    if (opts.avoid && opts.avoid.size) pushBack(order, opts.avoid, fixed);
    return order;
  }

  function remember(s, id) {
    if (s.recent[s.recent.length - 1] === id) return;
    s.recent.push(id);
    if (s.recent.length > RECENT_MAX) s.recent.splice(0, s.recent.length - RECENT_MAX);
  }

  /**
   * A new shuffle session.
   * `pos` is the index in `order` of the video playing now (-1 = nothing dealt yet).
   */
  function createSession(listId, ids, opts = {}) {
    const order = buildOrder(ids, opts);
    const now = Date.now();
    const s = { v: SESSION_VERSION, listId, order, pos: -1, round: 1, recent: [], createdAt: now, updatedAt: now };
    if (opts.first != null && order[0] === opts.first) {
      s.pos = 0;
      remember(s, opts.first);
    }
    return s;
  }

  function isSession(s) {
    return !!s && s.v === SESSION_VERSION && Array.isArray(s.order) && Number.isInteger(s.pos) &&
      s.pos >= -1 && s.pos < s.order.length && Array.isArray(s.recent);
  }

  /** Shuffles a brand-new deck for the next round. Nothing is dealt yet afterwards (pos = -1). */
  function startRound(s, ids, opts = {}) {
    const pool = ids && ids.length ? ids : s.order;
    const n = new Set(pool).size;
    const k = Math.min(10, Math.floor(n / 3));
    const avoid = new Set(k > 0 ? s.recent.slice(-k) : []);
    s.order = buildOrder(pool, { spread: opts.spread, keyOf: opts.keyOf, avoid });
    s.pos = -1;
    s.round += 1;
    return s;
  }

  /**
   * Deals the next video. Starts a new round when the deck is used up,
   * unless opts.onFinish === 'stop'.
   */
  function advance(s, ids, opts = {}) {
    if (s.pos + 1 < s.order.length) {
      s.pos += 1;
      remember(s, s.order[s.pos]);
      return { id: s.order[s.pos], newRound: false, finished: false };
    }
    if (opts.onFinish === 'stop') return { id: null, newRound: false, finished: true };
    startRound(s, ids, opts);
    if (!s.order.length) return { id: null, newRound: true, finished: true };
    s.pos = 0;
    remember(s, s.order[0]);
    return { id: s.order[0], newRound: true, finished: false };
  }

  /**
   * Where "previous" should go. If the video on screen isn't the last one dealt
   * (you jumped to an old one), previous returns to the last dealt video.
   */
  function retreat(s, currentId) {
    if (s.pos >= 0 && currentId && s.order[s.pos] !== currentId) return s.order[s.pos];
    if (s.pos > 0) {
      s.pos -= 1;
      return s.order[s.pos];
    }
    return null;
  }

  /**
   * Records that `id` is on screen (you picked it yourself, or the shuffle navigated there).
   * Unplayed: it is moved to the next slot and dealt, so it won't come up again this round.
   * Already played this round: a replay, nothing changes.
   */
  function noteWatching(s, id) {
    const k = s.order.indexOf(id);
    if (k < 0) return 'unknown';
    if (k <= s.pos) {
      remember(s, id);
      return 'replay';
    }
    s.order.splice(k, 1);
    s.order.splice(s.pos + 1, 0, id);
    s.pos += 1;
    remember(s, id);
    return 'dealt';
  }

  /**
   * Brings a session in line with the playlist as it is now: removed videos leave the deck,
   * new videos are slipped into random spots among the ones not played yet.
   */
  function reconcile(s, ids, opts = {}) {
    const want = new Set(ids);
    const kept = [];
    let pos = s.pos;
    let removed = 0;
    s.order.forEach((id, i) => {
      if (want.has(id)) kept.push(id);
      else {
        removed++;
        if (i <= s.pos) pos--;
      }
    });
    s.order = kept;
    s.pos = Math.min(pos, kept.length - 1);
    const have = new Set(kept);
    let added = 0;
    for (const id of ids) {
      if (have.has(id)) continue;
      const lo = s.pos + 1;
      const at = lo + randomInt(s.order.length - lo + 1);
      s.order.splice(at, 0, id);
      have.add(id);
      added++;
    }
    if (added && opts.spread && typeof opts.keyOf === 'function') spreadInPlace(s.order, opts.keyOf, s.pos + 1);
    return { added, removed };
  }

  /** New random order for the videos not played yet; what already played stays played. */
  function reshuffleRest(s, opts = {}) {
    shuffleInPlace(s.order, s.pos + 1);
    if (opts.spread && typeof opts.keyOf === 'function') spreadInPlace(s.order, opts.keyOf, s.pos + 1);
    return s;
  }

  /** Re-applies the channel spread to the unplayed part without reshuffling it. */
  function respreadRest(s, keyOf) {
    spreadInPlace(s.order, keyOf, s.pos + 1);
    return s;
  }

  function peekNext(s) {
    return s.pos + 1 < s.order.length ? s.order[s.pos + 1] : null;
  }

  function upcoming(s, n) {
    return s.order.slice(s.pos + 1, s.pos + 1 + n);
  }

  function summary(s) {
    return { position: s.pos + 1, total: s.order.length, round: s.round, left: s.order.length - s.pos - 1 };
  }

  return {
    randomInt, shuffleInPlace, spreadInPlace, pushBack, buildOrder,
    createSession, isSession, startRound, advance, retreat, noteWatching,
    reconcile, reshuffleRest, respreadRest, peekNext, upcoming, summary,
  };
});
