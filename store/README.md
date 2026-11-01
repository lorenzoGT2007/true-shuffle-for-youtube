# Publishing True Shuffle

Everything needed to put the extension on the browser stores: how to build the package, the images, and the text to paste into each form.

## 1. Build the packages

There are two zips, each holding `manifest.json`, `_locales/`, `icons/`, `options/`, `popup/`, `src/` and `welcome/`, nothing else:

- `true-shuffle-for-youtube-vX.Y.Z.zip` for the Chrome Web Store, Edge Add-ons and Opera. Its manifest leaves out the two Firefox-only keys: Edge's store rejects `background.scripts`, and Chrome before 121 refuses to load it.
- `true-shuffle-for-youtube-firefox-vX.Y.Z.zip` for Firefox Add-ons, with `manifest.json` exactly as it is in the repo.

**Easiest:** download both from the [Releases page](https://github.com/lorenzoGT2007/true-shuffle-for-youtube/releases). The release workflow builds them each time you push a version tag.

**By hand**, from the repo folder (needs Node and Git). It packs the last commit, so commit first:

```sh
node store/pack.js
```

## 2. Images

| File | Size | Used for |
| --- | --- | --- |
| `store-icon.png` | 128×128 | Store icon (Chrome): 96×96 artwork with 16px transparent padding, as Google's guidelines ask |
| `../icons/icon128.png` | 128×128 | Extension logo (Edge, Opera) |
| `screenshot-1.png` | 1280×800 | Screenshot: the card and the Up next list |
| `screenshot-2.png` | 1280×800 | Screenshot: the toolbar popup |
| `screenshot-3.png` | 1280×800 | Screenshot: reading a long playlist |
| `promo-small.png` | 440×280 | Small promo tile (Chrome, Edge) |

A real screenshot of the extension on a YouTube video page helps too. Take one at 1280×800 and upload it first.

## 3. Chrome Web Store

Brave, Vivaldi, Arc and other Chromium browsers install from the Chrome Web Store, so this one listing covers them.

1. Go to the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole) and sign in with the Google account you want to publish under. Pay the one-time **$5** registration fee and verify your contact email. 2-Step Verification has to be on for that account.
2. Click **New item** and upload the zip.
3. **Store listing** tab: paste the description below, pick the category **Entertainment** and the language **English** (the package also has Italian, Portuguese (Brazil) and Spanish: the name and summary come translated from it, and the dashboard lets you add a description per language), then upload `store-icon.png`, the screenshots and the small promo tile. Under **Additional fields**, leave Official URL on None, set Homepage URL to `https://github.com/lorenzoGT2007/true-shuffle-for-youtube` and Support URL to `https://github.com/lorenzoGT2007/true-shuffle-for-youtube/issues`, and leave Mature content off.
4. **Privacy** tab: fill it in from [Privacy answers](#privacy-answers) below.
5. **Distribution** tab: **Public**, all regions.
6. Click **Submit for review**. Review usually takes a few days. You get an email when it's published.
7. Once it's live, add the store link to the main README's Install section.

## 4. Microsoft Edge Add-ons

Free, and it takes the same zip as the Chrome Web Store (not the `-firefox` one).

1. Register (free) in [Partner Center](https://partner.microsoft.com/dashboard/microsoftedge/overview) for the Microsoft Edge program.
2. **Create new extension** and upload the zip.
3. **Availability**: Public, all markets.
4. **Properties**: category **Entertainment**, privacy policy URL below, website `https://github.com/lorenzoGT2007/true-shuffle-for-youtube`.
5. **Store listings** (English): the description below, the logo (the 128×128 icon), the screenshots and the small promo tile.
6. **Submit**. Edge reviews take up to about a week.

## 5. Opera add-ons

1. Sign in at [addons.opera.com/developer](https://addons.opera.com/developer/) (free).
2. **Upload new extension**, choose the zip, then fill in the listing with the same text and images.

Opera users can also install straight from the Chrome Web Store, so this one is optional.

## 6. Firefox Add-ons

Free. Upload `true-shuffle-for-youtube-firefox-vX.Y.Z.zip`.

Before the first upload, decide on two things in `manifest.json`, because AMO keeps them:

- **Add-on ID** `true-shuffle-for-youtube@lorenzogt2007` (`browser_specific_settings.gecko.id`). It can never change after the first upload, so edit it now if you want another one: letters, digits, `-`, `.` and `_` around a single `@` (or a `{GUID}`), up to 80 characters.
- **Data collection** `"required": ["none"]`. Firefox shows this at install. The extension sends nothing to you or anyone else; its only requests go to youtube.com, the same ones YouTube's page makes, with the sign-in header YouTube's page uses. If a reviewer counts that as collecting, switch to `["authenticationInfo"]`.

1. Sign in at the [Add-on Developer Hub](https://addons.mozilla.org/developers/) and accept the distribution agreement.
2. **Submit a New Add-on**, choose **On this site**, and upload the Firefox zip. Tick **Firefox** only: the scripts run on www.youtube.com, and Firefox for Android uses m.youtube.com.
3. Asked whether a code generator, minifier or other tool made the files: **No**. They are hand-written, so no source code upload is needed.
4. Expect two harmless validation warnings: Firefox ignores `background.service_worker` (it runs `background.scripts`), and the minimum version doesn't cover Firefox for Android.
5. Listing: the same text and images as above, the privacy policy URL below, homepage and support URLs as for Chrome.
6. **Notes to Reviewer** (paste):

   ```
   True Shuffle only runs on www.youtube.com. To read a whole playlist it calls youtube.com's own endpoint /youtubei/v1/browse from the page (src/page.js), the same request YouTube's page makes. When the user is signed in, those requests carry the SAPISIDHASH authorization header YouTube's web client computes from the user's YouTube cookie (needed for private playlists, Watch later and Liked videos); it is built in the tab and sent only to youtube.com. Nothing goes to the developer or anyone else. unlimitedStorage: the video lists of big playlists are kept to resume a shuffle. scripting: injects the extension's own files into YouTube tabs already open on install or update. All code is in the package, unminified, with no remote code and no eval.
   ```

## Updating later

1. Make your changes, raise `"version"` in `manifest.json` (for example `1.0.1`) and update the zip name in the main README's Install section.
2. Commit, then tag and push:
   ```sh
   git tag v1.0.1
   git push origin main --tags
   ```
   The release workflow builds `true-shuffle-for-youtube-v1.0.1.zip` and `true-shuffle-for-youtube-firefox-v1.0.1.zip` and attaches them to a new release.
3. In each dashboard open the item, upload the new zip (Chrome: **Package → Upload new package**; Firefox Add-ons takes the `-firefox` one), and submit for review.

---

## Text to paste

### Name

```
True Shuffle for YouTube
```

### Summary (comes from the manifest, 132 characters max)

```
Shuffles a whole YouTube playlist like a deck of cards: every video plays once, in a truly random order, before anything repeats.
```

### Description

```
True Shuffle plays a YouTube playlist like a shuffled deck of cards: every video plays exactly once, in a truly random order, before anything repeats.

WHY IT'S MORE RANDOM THAN YOUTUBE'S SHUFFLE
• It reads the whole playlist. YouTube's own shuffle only mixes the part of a long playlist it has loaded.
• One shuffled deck per round: nothing repeats until every video has played.
• A uniform Fisher-Yates shuffle using the browser's cryptographic random generator.
• Optional: never the same channel twice in a row.
• When a new round starts, the last songs you heard are kept away from the start of it.

HOW IT WORKS
• Play any video from a playlist and the shuffle turns on by itself. The round button at the bottom right shows your progress; click it to open the card.
• When a video ends, the next one comes from the shuffle. The player's Next and Previous buttons, Shift+N / Shift+P and your keyboard's media keys follow it too.
• The card shows how far you are, what plays next, and an "Up next" list you can jump around in.
• Pick a video yourself from the playlist and it counts as played.
• Your place is saved, so it survives reloads and browser restarts.
• Private playlists, Watch later and Liked videos work while you're signed in to YouTube.
• The toolbar button shows the same controls plus settings.
• Optional: hide the videos you've already watched on Home, Subscriptions, channels, search and playlists, with one switch or Alt+Shift+U.
• Search and sort any playlist, Watch Later included, by title, duration, channel or unwatched first, then play or shuffle just the videos shown. Only the view changes, never your playlist.
• Find out when videos vanish: next time you open a playlist, a small notice names the ones that were removed or became private or deleted, with their old titles. History and CSV export in the options.
• Every setting in one place on the options page.
• In English, Italian, Portuguese and Spanish.

GOOD TO KNOW
Mixes (YouTube's endless auto-generated lists) can't be shuffled. Save the songs to a playlist instead.

PRIVACY
Nothing leaves your browser. True Shuffle only talks to youtube.com and has no servers, no analytics and no ads.

Free and open source: https://github.com/lorenzoGT2007/true-shuffle-for-youtube
Enjoying it? Buy me a coffee: https://buymeacoffee.com/lorenzogt

True Shuffle is an independent project, not affiliated with or endorsed by YouTube or Google.
```

### Privacy answers

**Single purpose**

```
Shuffles YouTube playlists so that every video plays exactly once, in a random order, before any video repeats.
```

**Permission justifications**

| Permission | Justification |
| --- | --- |
| `storage` | `Saves the user's settings and, for each shuffled playlist, the shuffled order, the user's place in it and the playlist's video list, so the shuffle survives reloads and browser restarts.` |
| `unlimitedStorage` | `Playlists can hold thousands of videos, and the shuffles of up to 40 playlists are remembered. Their saved video lists can exceed the default 10 MB extension storage limit.` |
| `scripting` | `Only right after the extension is installed or updated: injects the extension's own packaged scripts into YouTube tabs that were already open, so the user doesn't have to reload them. No other use.` |
| Host permission `https://www.youtube.com/*` | `The extension works only on YouTube. It reads the playlist being played (using the same requests YouTube's own page makes), follows which video is playing, and starts the next video of the shuffle.` |

**Remote code**: No, I am not using remote code.

```
All JavaScript is packaged in the extension. It loads no remote scripts and uses no eval.
```

**Data usage**: tick these two boxes (the store counts data handled only on the user's device too):

- **Authentication information**: requests that read private playlists carry the sign-in header YouTube's page creates from the user's YouTube cookie. It is sent only to youtube.com and never stored.
- **Website content**: playlist titles, video titles and channel names, stored on the user's device to run the shuffle and to tell the user when videos disappear from a playlist they open.

Then tick all three certifications:

- I do not sell or transfer user data to third parties, outside of the approved use cases
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL**

```
https://github.com/lorenzoGT2007/true-shuffle-for-youtube/blob/main/PRIVACY.md
```
