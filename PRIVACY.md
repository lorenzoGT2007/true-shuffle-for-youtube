# Privacy policy

**True Shuffle for YouTube** · last updated 2 November 2026

**Your data stays on your device.** True Shuffle never sends anything to the developer or to anyone else, and it does not sell or share any of your data. It has no servers, no analytics, no ads and no tracking. Its only requests go to youtube.com: the same ones YouTube's own page makes, to read the playlist you play.

## What it reads

The extension runs only on `https://www.youtube.com/`. There it reads:

- **The page you're on**: which playlist and which video are playing, so it can pick the next video.
- **How much of each video on the page you've watched**, from YouTube's red progress bars and "Watched" labels: while "Hide watched videos" is on, to hide those videos, and when you sort a playlist by "Unwatched first", to sort it. The progress itself is never stored.
- **The videos on a playlist page you open** (not Watch later or Liked videos): their ids, titles and channels, the playlist's name and YouTube's "N unavailable videos are hidden" note, to spot videos removed since your last visit (saved as described below). The search box and sort menu read the same details and keep nothing.
- **The playlist you shuffle**: video ids, titles, channel names and durations. To get every video (not just the first 200 YouTube loads), it asks YouTube for the rest of the playlist with the same requests YouTube's own page makes. These requests go only to youtube.com.
- **Your YouTube sign-in**: so that private playlists, Watch later and Liked videos work, the extension reads your YouTube sign-in cookie inside the YouTube tab and builds from it the same sign-in header YouTube's own page builds. That header is sent only to youtube.com, with those requests. The cookie and the header are never stored or sent anywhere else.

## What it stores

All of this stays on your device, in the browser's extension storage:

- your settings, and whether the What's new page was already shown;
- for up to 40 playlists you shuffled: the playlist's title and video list (ids, titles, channels, durations), the shuffled order and how far you got;
- for playlists you open (not Watch later or Liked videos): a snapshot of their videos (ids, titles, channels and the date each was last seen), so it can tell you next time which ones were removed or became private or deleted; and the list of those alerts (at most 500), each with the playlist's name and the video's id, title and channel. The snapshots are limited in size, and the oldest are dropped first.

In the YouTube tab's session storage it also notes which playlist that tab is shuffling, which playlists you switched off in that tab, and the video it is about to open. That is cleared when the tab closes.

Removing the extension deletes everything it stored in the browser's extension storage.

## What it shares

Nothing. No data is sent to the developer or to anyone else, and none is used for advertising, profiling or any purpose other than the extension's own features. The links to GitHub and Buy Me a Coffee in the extension's pages open those sites only when you click them, and send nothing with them.

## Permissions

- **Access to youtube.com**: to run on YouTube pages and read the playlist you're playing.
- **Storage** and **unlimited storage**: to keep your settings, your place in each playlist and the playlist snapshots. Playlists with thousands of videos can exceed the browser's default storage limit.
- **Scripting**: right after the extension is installed or updated, to add its own scripts to YouTube tabs that are already open, so you don't have to reload them.

## Contact

Questions about this policy: [open an issue on GitHub](https://github.com/lorenzoGT2007/true-shuffle-for-youtube/issues).

True Shuffle is free and open source. It is an independent project, not affiliated with or endorsed by YouTube or Google.
