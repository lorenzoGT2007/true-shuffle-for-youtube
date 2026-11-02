# True Shuffle for YouTube: rules for AI helpers

Browser extension (Manifest V3) that shuffles a whole YouTube playlist like a deck of cards, growing into a YouTube library
manager (the owner's brief is at the end). One codebase for Chromium 111+ (Chrome, Edge, Opera) and Firefox 140+. Public
repo, MIT. `README.md` is the user guide, `PRIVACY.md` the privacy policy, `store/README.md` the store guide and listing text.

## Rules

1. **No build step, no dependencies.** Plain JavaScript and CSS, no npm, no bundler: the repo root is the extension.
   Node is only for `node --test` and packaging (`store/pack.js`).
2. **Two worlds on youtube.com.** `yt-api.js` and `page.js` run in YouTube's page world (MAIN), the only one that sees
   `ytcfg`, `ytd-app`'s methods and YouTube's `mediaSession` handlers; everything else runs isolated, with `chrome.*`.
   They talk only by `window.postMessage` (`{__trueShuffle: 'to-page'|'to-cs', type, reqId?, ...}`; answers are `reply`,
   `progress`, `mediaKey`). Any page script can read or fake these: keep privileged logic out of `page.js`.
3. **The old `page.js` outlives updates** (non-writable `window.__trueShufflePage`; keeps its captured `TrueShuffleYT`):
   keep the protocol backward compatible (old copies throw 'Unknown request'); never rename `__trueShuffle`,
   `true-shuffle-retire`, `#true-shuffle-root`. `content.js` yields only to a live copy, else retires the orphan.
4. **Load order** is the manifest `content_scripts` order, repeated in `background.js` (`MAIN_FILES`, `ISOLATED_FILES`):
   change both. `document_start` is load-bearing (`page.js` wraps `mediaSession` before YouTube does). Never list one file
   in both entries: Chrome runs it only once per page, in the first entry's world (Firefox runs both).
5. **Every YouTube DOM selector lives in `src/selectors.js`**, with a comment and a fallback where one exists: use `SEL.*`,
   never a literal. Isolated world only; `page.js` gets `SEL.app` with each `navigate` request.
6. **Pure logic stays pure and UMD** (`shuffle.js`, `yt-api.js`, the helpers above `start()` in feature modules), so
   `node --test` can `require()` it. New logic gets a test in `test/`.
7. **DOM:** build with `h()`/`icon()` from `ui.js` (createElement, textContent), never `innerHTML` (YouTube enforces
   Trusted Types). Injected UI: shadow roots, always dark (`color-scheme: dark`). The floating card's clicks must not take
   focus (Space pauses the video); a toolbar with a text box stops key events at its host, or YouTube's shortcuts fire.
8. **`serial()` is a per-tab queue** (no lock across tabs). Inside a `serial()` callback never await `serial`, `move` or
   anything using them (`goNext`, `commitWatching`, `syncCatalog`): the chain waits on itself and every later move hangs.
   Anything that navigates goes through `move()`, whose `st.dealing` tells `onLocationChange` the navigation is ours.
9. **Stored data outlives code.** `c:` items are unversioned tuples `[id, title, channel, seconds]`: only append. `s:` loads
   only if `isSession` passes; bumping `SESSION_VERSION` silently drops everyone's saved place.
10. **Kept in sync by hand:** `DEFAULTS` (`content.js` and `unwatched.js` vs `popup/settings.js`); the host pattern
    (manifest, `background.js`, `popup.js` `isYouTube`); `store/pack.js`'s shipped folders (miss one and Chrome refuses it).
11. **Docs follow the code:** new permissions, reads or stored data update `PRIVACY.md` + `docs/privacy.html` (its Pages copy)
    and `store/README.md`'s answers; behaviour changes update `README.md` and the store description. Comments give the reason.
    **Visible strings are messages** in `_locales/{en,it,es,pt_BR}/messages.json` (`t()`/`parts()` of `src/i18n.js`, `data-i18n*`
    in pages), each in all four with the same placeholders (`test/i18n.test.js`); they use `’`, README/PRIVACY/store plain `'`.
12. **Features hook in through `TrueShuffleWatcher.watch({pages, enter, videos, changed, leave})`**, never their own
    observers or location listeners, and `content.js` starts and stops them (so they retire with it).

## Where things are

| Path | What |
|---|---|
| `manifest.json` | The one manifest for every browser; `version` is the release version |
| `src/selectors.js` | `TrueShuffleSelectors`: every YouTube DOM selector, loaded first in the isolated world |
| `src/i18n.js`, `_locales/` | `TrueShuffleI18n` `{t, parts, translate}` over the browser's language (English the default); loaded second |
| `src/shuffle.js` | `TrueShuffle`: the deck engine (pure) |
| `src/yt-api.js` | `TrueShuffleYT`: parses `/youtubei/v1/browse`, builds the sign-in header (pure) |
| `src/page.js` | Page world: downloads the playlist, navigates with `yt-navigate`, takes over the media keys |
| `src/content.js` | Controller: state, storage, takeover (video end, autoplay, Next/Prev, Shift+N/P), popup messages, mounts the UI |
| `src/watcher.js` | `TrueShuffleWatcher`: page type (pure `pageType`), in-page navigation and new video cards, for features |
| `src/unwatched.js` | The unwatched filter: hides cards by progress bar width or "Watched" label |
| `src/playlist-tools.js` | Search and sort on playlist pages: CSS `order` only, rows never move; "Load all" scrolls; Play/Shuffle hand the shown ids to `content.js` `playView` |
| `src/removed.js` | Removed-video check on playlist pages (not WL/LL): snapshot, pure `compare` (needs the whole list loaded to call a video gone; reads YouTube's "N unavailable videos are hidden"), notice, `toCsv` |
| `src/ui.js` | `TrueShuffleUI.create(onAction)` → `{host, render(viewModel)}`: round button, card, "Up next" list; `h()` |
| `src/background.js` | Service worker (Firefox: event page): injects the scripts into open tabs on install/update; Alt+Shift+U; opens `welcome/welcome.html` on install, `whats-new.html` (background tab) once per `WHATS_NEW` |
| `popup/` | Popup: `popup.js` fills static `popup.html`, polls the tab every 800 ms with `chrome.tabs.sendMessage({type})` (`type` = the `data-act` names: `status`, `start`, `next`…), answered by `status()`. `settings.js` binds the settings controls of the popup and options page; `popup.css` styles every extension page (`body.page`) |
| `options/` (opens in a tab), `welcome/` | Options page: every setting; Alerts history (loads `src/removed.js`) with CSV export; About. Welcome and What's new pages (`.shot` placeholders await screenshots) |
| `test/` | `node --test`: `shuffle` (with the 1.0.0 spread as an oracle), `watcher`, `unwatched`, `playlist-tools`, `removed`, `i18n` |
| `store/`, `.github/workflows/release.yml` | `pack.js` builds the zips; store guide and images (not shipped). On a `v*` tag equal to `v` + manifest version, `release.yml` runs `pack.js` and publishes a release |

## How shuffling works

- **Reading** (`fetchPlaylist`, page.js): POST `/youtubei/v1/browse` (`browseId: 'VL' + listId`), then each continuation
  (≤ 600 pages), retrying network errors, 429 and 5xx 3 times; a continuation that still fails ends the read (`partial`).
  Signed in, requests carry `Authorization: SAPISIDHASH …`; a 4xx on the first page re-reads signed out.
- **Catalog** `c:<listId>`: saved once a shuffle uses it, never empty; re-read (`syncCatalog` → `reconcile`) at start or
  reload when older than 15 min or `partial`, or when an unknown video plays; empty or shorter cut-short re-reads are ignored.
- **Deck** (`buildOrder`): Fisher-Yates over `crypto.getRandomValues`, the playing video first; a new round keeps the last
  `min(10, max(1, n/3))` heard off its start (`pushBack`), then `spreadInPlace` (setting `spread`) breaks up runs of one
  channel, best effort. Session `s:<listId>` = `{v: 1, listId, order, pos, round, recent, ...}`, `pos` = last dealt (-1:
  none); `advance` deals `order[pos + 1]`, `retreat` steps back, a video you pick (`noteWatching`) is dealt next. A view
  (`s.view = {ids, ordered}`, the tools' Play/Shuffle) deals only its ids (`poolOf`), in order if `ordered`, is never
  reconciled, and replaces the list's session; `restart` ("Shuffle whole playlist") goes back to all of it.
- **Takeover**, only while attached (phase `active` on `/watch?v=…&list=<our list>`), never for loops or ads: 0.15 s before
  the end it pauses and deals the next video, so YouTube never sees the end; seeking to the end skips, a held time bar
  waits, a player error for 4 s skips. Player Next/Prev, Shift+N/P and media keys follow the deck.
- **Navigating:** `yt-navigate` on `ytd-app`, else `location.assign`. A navigation onto our list is your pick, unless (no
  click, Enter or Back in 3 s) ours is being dealt or just landed, or the previous video was ending: then ours wins.
- **Starting:** a video played from a playlist starts it by itself (`autoStart`); a playlist page offers the button.
  Mixes (`RD…`) and temporary `TL…` lists are refused. Leaving the watch page pauses; another playlist's video switches.

## Storage

| Where | Key | What |
|---|---|---|
| `chrome.storage.local` | `settings` | `{spread, onFinish, showButton, corner, collapsed, autoStart}`; `whatsNew`: the What's new edition shown |
| | `unwatched` | `{enabled, threshold (percent, 90), partial}`: popup, options page and the shortcut all write it |
| | `c:<listId>`, `s:<listId>` | Catalog and session per playlist |
| | `p:<listId>`, `snaps`, `alerts` | Snapshot `{v: 1, at, complete, hidden, videos: {id: [title, channel, seen, unavailable]}}` (≤ 2 MB each); `snaps` = `{listId: {bytes, at}}`, oldest dropped past 20 MB; alert history (≤ 500, `ack` = Seen it) |
| | `idx` | `{listId: {title, pos (videos played), total, round, updatedAt}}`. The only eviction of `s:`/`c:`: `saveSession` keeps the 40 newest (a new per-playlist key joins that `remove`) |
| tab `sessionStorage` | `trueShuffle.active`, `.off`, `.expect` | List this tab shuffles (resumes after a reload); lists closed in this tab; last navigation asked for (never read) |
| `localStorage` | `trueShuffle.debug` | `'1'`: each render writes `{phase, listId, pos, round, order, expected, error}` to `<html data-true-shuffle-debug>` |

## Permissions and why

- `storage`, `unlimitedStorage`: settings and each playlist's catalog and shuffle; big playlists pass the default 10 MB.
- `scripting`: only `background.js`, on install/update, injects the scripts into open YouTube tabs (Firefox does it too).
- Host `https://www.youtube.com/*`: everything runs there; `background.js` finds and scripts open YouTube tabs with it
  (no `tabs` permission), and the popup reads a YouTube tab's URL. Firefox users can revoke it.
- Chromium 111 first honours `"world": "MAIN"`. Firefox 140: MAIN needs 128, AMO's `data_collection_permissions` 140.

## Running, testing, building

- **Load:** Chrome/Edge `chrome://extensions` → Developer mode → **Load unpacked** → this folder (one harmless warning:
  `background.scripts` is for Firefox); Firefox `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on…**.
  After an edit reload the extension, and the YouTube tab too after editing `page.js` or `yt-api.js`.
- **Debug:** `localStorage.setItem('trueShuffle.debug', '1')` in the YouTube tab, reload, read `data-true-shuffle-debug`;
  `chrome-extension://<id>/popup/popup.html?tab=<numeric tab id>` opens the popup aimed at that tab.
- **Tests:** `node --test` (Node 24, nothing to install). Browser checks: headless Chrome with `--headless=new
  --remote-debugging-pipe --enable-unsafe-extension-debugging`, `Extensions.loadUnpacked`, a fake youtube.com via
  `Fetch.fulfillRequest`, trusted input (`Input.dispatch*Event`); the card ignores clicks for 450 ms after it switches.
- **Build:** `node store/pack.js` packs the last commit into `true-shuffle-for-youtube-vX.Y.Z.zip` (Chrome, Edge, Opera:
  manifest minus `background.scripts` and `browser_specific_settings`, which Edge's store rejects) and the `-firefox` zip
  (`npx addons-linter@10.15.0 <zip>`: 0 errors, 2 known warnings).
- **Release:** raise `version` in `manifest.json` and the zip name in `README.md` (and `WHATS_NEW` when `whats-new.html` has
  news), commit, `git tag vX.Y.Z`, `git push origin main --tags`; `release.yml` publishes both zips. Stores: by hand.
- **When YouTube breaks something,** check first: `src/selectors.js`; events `yt-navigate`, `yt-navigate-start`/`-finish`;
  `ytcfg` keys (`INNERTUBE_*`, `LOGGED_IN`, session ids), the `SAPISID` cookies; `yt-api.js`'s `continuationCommand.token`.

## Project brief (the owner's)

**Product:** grow the shuffler (already on the Chrome Web Store) into a YouTube library manager without breaking anything
current users have. Store single purpose: organize and play your YouTube playlists and Watch Later. Chrome first, Edge and
Firefox from the same code, Firefox for Android later; desktop youtube.com first, m.youtube.com later.

**Free features:** 1. Unwatched filter, 3. playlist tools, 4. Play this view, 5. removed-video check with Alerts history
and CSV export: done. 2. To do: an unwatched counter on a channel or playlist among loaded items; "Load all" scrolls for
you, only when clicked, at human pace, and updates the count. **Pro** (later, behind a flag that stays off): automatic
checks of chosen playlists, unlimited history, saved filters, backup export/import.

**Must never break:**
- Existing features and settings keep working; migrate any stored format that changes.
- Manifest V3. No new permission without asking the owner (it switches the extension off for existing users until they
  accept); prefer optional ones. No remote code, tracking or servers: everything stays in the browser.
- Never use YouTube's private APIs and never automate clicks on YouTube's menus: read the page, filter what's shown, scroll
  only when asked. (The shuffle's playlist read through `/youtubei/v1/browse` predates this: ask before extending it.)
- Selectors per rule 5, watch progress read more than one way; SPA navigation and infinite scroll per rule 12, debounced,
  no visible lag on long pages. Shadow DOM UI, accessible (keyboard, labels). Strings in i18n files (rule 11): English,
  Italian, Portuguese (Brazil), Spanish.
- Keep the stack unless approved. Unit tests for logic (the brief names Vitest; the repo uses `node --test`, no install:
  Vitest is over the 100 KB dependency limit, so ask first).

**Working with the owner:** not a professional developer: explain changes in plain words. One step at a time: plan, code,
run the tests and the build, then a short manual test on YouTube that always includes "shuffle still works", saying exactly
what needs their eyes or account. Don't touch unrelated code. Commit clearly once a step works (or when told to push).
