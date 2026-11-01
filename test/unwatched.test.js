'use strict';
// Unit tests for the unwatched filter's pure parts (src/unwatched.js). Run from the repo root: node --test
const test = require('node:test');
const assert = require('node:assert/strict');
const U = require('../src/unwatched.js');

test('percent reads a progress bar inline width', () => {
  assert.equal(U.percent('37%'), 0.37);
  assert.equal(U.percent(' 100% '), 1);
  assert.equal(U.percent('12.5%'), 0.125);
  assert.equal(U.percent('140%'), 1); // never more than all of it
  for (const bad of ['', null, undefined, '37px', 'calc(37%)', 'abc%']) assert.equal(U.percent(bad), null, String(bad));
});

test('hides: at or above the threshold, or any progress with partial on', () => {
  const cfg = { ...U.DEFAULTS, enabled: true };
  assert.equal(cfg.threshold, 90);
  assert.equal(U.hides(0.9, cfg), true); // "at or above"
  assert.equal(U.hides(1, cfg), true);
  assert.equal(U.hides(0.89, cfg), false);
  assert.equal(U.hides(0.05, cfg), false);
  assert.equal(U.hides(0.05, { ...cfg, partial: true }), true);
  assert.equal(U.hides(0.5, { ...cfg, threshold: 50 }), true);
  for (const none of [null, undefined, 0, NaN]) {
    assert.equal(U.hides(none, cfg), false, String(none));
    assert.equal(U.hides(none, { ...cfg, partial: true }), false, String(none)); // unwatched videos always stay
  }
});
