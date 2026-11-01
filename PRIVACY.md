# Privacy policy

**True Shuffle for YouTube** · last updated 29 October 2026

True Shuffle does not collect, send, sell or share any of your data. It has no servers, no analytics, no ads and no tracking. Everything it does happens inside your browser, on youtube.com.

## What it reads

The extension runs only on `https://www.youtube.com/`. There it reads:

- **The page you're on**: which playlist and which video are playing, so it can pick the next video.
- **How much of each video on the page you've watched**, from YouTube's red progress bars and "Watched" labels, only while "Hide watched videos" is on, so it can hide those videos. This is never stored.
- **The playlist's contents**: video ids, titles, channel names and durations. To get every video (not just the first 200 YouTube loads), it asks YouTube for the rest of the playlist with the same requests YouTube's own page makes. These requests go only to youtube.com. On a playlist page, the search box and sort menu read the same details from the page itself and keep nothing.
- **Your YouTube sign-in**: so that private playlists, Watch later and Liked videos work, those requests carry the same sign-in header YouTube's page creates from your YouTube cookie. That happens inside the YouTube tab. The header goes only to youtube.com, and the cookie is never stored or sent anywhere else.

## What it stores

All of this stays on your device, in the browser's extension storage:

- your settings;
- for up to 40 playlists you shuffled: the playlist's title and video list (ids, titles, channels, durations), the shuffled order and how far you got.
- for playlists you open (not Watch later or Liked videos): a snapshot of their videos (ids, titles, channels and the date each was last seen), so it can tell you next time which ones were removed or became private or deleted; and the list of those alerts (at most 500). The snapshots are limited in size, and the oldest are dropped first.

In the YouTube tab's session storage it also notes which playlist that tab is shuffling, which playlists you switched off in that tab, and the video it is about to open. That is cleared when the tab closes.

Removing the extension deletes everything it stored in the browser's extension storage. The notes in a YouTube tab's session storage go when that tab closes.

## What it shares

Nothing. No data is sent to the developer or to anyone else, and none is used for advertising, profiling or any purpose other than shuffling your playlists.

## Permissions

- **Access to youtube.com**: to run the shuffle on YouTube pages and read the playlist you're playing.
- **Storage** and **unlimited storage**: to keep your settings and your place in each playlist. Playlists with thousands of videos can exceed the browser's default storage limit.
- **Scripting**: right after the extension is installed or updated, to add its own scripts to YouTube tabs that are already open, so you don't have to reload them.

## Contact

Questions about this policy: [open an issue on GitHub](https://github.com/lorenzoGT2007/true-shuffle-for-youtube/issues).
