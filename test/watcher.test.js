'use strict';
// Unit tests for the page watcher's URL classifier (src/watcher.js). Run from the repo root: node --test
const test = require('node:test');
const assert = require('node:assert/strict');
const W = require('../src/watcher.js');

const cases = {
  home: ['https://www.youtube.com/', 'https://www.youtube.com/?bp=wgUCEAE%3D', '/'],
  subscriptions: ['https://www.youtube.com/feed/subscriptions', '/feed/subscriptions/'],
  channelVideos: ['/@LinusTechTips/videos', '/@ユーチューブ/videos/', '/channel/UCXuqSBlHAE6Xw-yeJA0Tunw/videos',
    '/c/LinusTechTips/videos', '/user/LinusTechTips/videos', '/LinusTechTips/videos'],
  search: ['/results?search_query=lofi+beats', '/results?search_query=a&sp=EgIQAQ%3D%3D'],
  playlist: ['/playlist?list=PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG', '/playlist?list=LL'],
  watchLater: ['/playlist?list=WL'],
  watch: ['/watch?v=dQw4w9WgXcQ', '/watch?v=dQw4w9WgXcQ&list=WL&index=3', '/watch?v=a&list=PLx&t=42s'],
  other: ['/results', '/watch', '/playlist', '/@LinusTechTips', '/@LinusTechTips/shorts', '/channel/UCx/featured',
    '/shorts/abc', '/feed/history', '/feed/library', 'not a url ::', 'https://www.youtube.com/@a/videos/extra'],
};

for (const [type, urls] of Object.entries(cases)) {
  test(`pageType: ${type}`, () => {
    for (const url of urls) assert.equal(W.pageType(url), type, url);
  });
}

test('every type the tests use is a known type', () => {
  assert.deepEqual(Object.keys(cases).sort(), [...W.TYPES].sort());
});
