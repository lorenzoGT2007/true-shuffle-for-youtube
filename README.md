# True Shuffle for YouTube

Shuffles a YouTube playlist like a deck of cards: every video plays exactly once, in a truly random order, before anything repeats.

<a href="https://buymeacoffee.com/lorenzogt"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me a Coffee" height="41" width="174"></a>

![The True Shuffle card on YouTube, with the Up next list open](store/screenshot-1.png)

## Install

Works in Chrome, Edge, Brave, Opera, Vivaldi and other Chromium browsers (version 111 or newer).

Store listings are on their way. Until then, install it by hand:

1. Download `true-shuffle-for-youtube-v1.0.0.zip` from the [latest release](https://github.com/lorenzoGT2007/true-shuffle-for-youtube/releases/latest) and unzip it somewhere permanent (for example `Documents\True Shuffle`). The browser loads the extension from there, so leave it in place.
2. Open the extensions page: `chrome://extensions`, `edge://extensions` or `brave://extensions`.
3. Switch on **Developer mode**.
4. Click **Load unpacked** and choose the folder that contains `manifest.json`.
5. YouTube tabs that were already open pick it up by themselves. If one doesn't, reload it.

## Use

- Play any video from a playlist and the shuffle turns on by itself: the round button at the bottom right lights up with your progress. Click it to open the card.
- On a playlist's own page, click the round button to start with a random video.
- When a video ends, the next one comes from the shuffle. The player's Next and Previous buttons, Shift+N / Shift+P and your keyboard's media keys follow it too.
- Skipping through a video with the time bar is fine. Drag it to the very end (or press End) to skip to the next shuffled video; while you hold the bar nothing changes until you let go.
- The card shows how far you are, what plays next, and an "Up next" list you can jump around in. The arrow folds it into the small button; the × stops shuffling that playlist in this tab (your place is kept, and the round button starts it again).
- Pick a video yourself from the playlist and it counts as played.
- The toolbar icon shows the same controls plus settings. Switch off "Turn on by itself when a playlist plays" if you'd rather start it yourself every time.

## Why it's more random than YouTube's shuffle

- It reads the whole playlist (YouTube's shuffle only mixes the part of a long playlist it has loaded).
- One shuffled deck per round: no repeats until every video has played. Your place is saved, so it survives reloads and restarting the browser.
- Uniform Fisher-Yates shuffle with the browser's cryptographic random generator.
- Optional: never the same channel twice in a row.
- When a new round starts, the last songs you heard are kept away from the start of it.

## Good to know

- Mixes (YouTube's endless auto-generated lists) can't be shuffled. Save the songs to a playlist instead.
- If you browse other pages while the miniplayer plays, YouTube's own order takes over until you come back to the video page. The card then offers "Resume shuffle".
- Private playlists, Watch later and Liked videos work while you're signed in to YouTube.
- Nothing leaves your browser. The extension only talks to youtube.com and keeps its state in the browser's extension storage. See the [privacy policy](PRIVACY.md).

## Support

True Shuffle is free and has no ads. If it makes your playlists better, you can [buy me a coffee](https://buymeacoffee.com/lorenzogt). ☕

Found a bug or have an idea? [Open an issue](https://github.com/lorenzoGT2007/true-shuffle-for-youtube/issues).

## License

[MIT](LICENSE). True Shuffle is an independent project, not affiliated with or endorsed by YouTube or Google.
