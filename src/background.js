/*
 * True Shuffle: the extension's background worker.
 *
 * Content scripts only reach YouTube tabs that load after the extension is installed, updated or
 * reloaded. This adds them to the YouTube tabs that were already open, so the shuffle button shows
 * up there too, without reloading the tab. It also answers the keyboard shortcut, and opens the welcome
 * page after the install and the What's new page once after an update that brings news.
 */
'use strict';

// Same files, same order as content_scripts in manifest.json.
const MAIN_FILES = ['src/yt-api.js', 'src/page.js'];
const ISOLATED_FILES = ['src/selectors.js', 'src/i18n.js', 'src/shuffle.js', 'src/ui.js', 'src/watcher.js', 'src/unwatched.js', 'src/playlist-tools.js', 'src/removed.js', 'src/content.js'];

// Alt+Shift+U (manifest "commands"; the browser lets you change the key): switches the unwatched filter.
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'toggle-unwatched') return;
  const { unwatched = {} } = await chrome.storage.local.get('unwatched');
  await chrome.storage.local.set({ unwatched: { ...unwatched, enabled: !unwatched.enabled } });
});

// Raise it when welcome/whats-new.html tells about a newer update: everyone who updates then sees it once.
const WHATS_NEW = 1;

/** Welcome page after the install; What's new once per edition after an update, behind the tab you're in. */
async function introduce(reason) {
  const { whatsNew = 0 } = await chrome.storage.local.get('whatsNew');
  if (whatsNew >= WHATS_NEW) return;
  await chrome.storage.local.set({ whatsNew: WHATS_NEW });
  if (reason === 'install') await chrome.tabs.create({ url: chrome.runtime.getURL('welcome/welcome.html') });
  else await chrome.tabs.create({ url: chrome.runtime.getURL('welcome/whats-new.html'), active: false }); // a video may be playing
}

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason !== 'install' && reason !== 'update') return;
  introduce(reason).catch(() => {});
  let tabs = [];
  try {
    tabs = await chrome.tabs.query({ url: 'https://www.youtube.com/*' });
  } catch (_) {
    return;
  }
  for (const tab of tabs) {
    if (tab.discarded) continue; // it gets the scripts when it loads again
    const target = { tabId: tab.id };
    try {
      await chrome.scripting.executeScript({ target, files: MAIN_FILES, world: 'MAIN' });
      await chrome.scripting.executeScript({ target, files: ISOLATED_FILES });
    } catch (_) {
      /* tab still loading or not scriptable: it gets the scripts the normal way */
    }
  }
});
