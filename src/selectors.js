/*
 * True Shuffle: every selector for YouTube's page that the extension relies on, in one place.
 * When YouTube changes its page and something stops working, check these first.
 *
 * Loaded in the isolated world, before content.js. page.js gets `app` with each navigate request:
 * Chrome runs a file listed in two content_scripts entries only once per page, so it can't be shared.
 */
(function (root) {
  'use strict';

  root.TrueShuffleSelectors = Object.freeze({
    // YouTube's app element. content.js hands it to page.js, which fires 'yt-navigate' on it to open
    // a video without a page load.
    app: 'ytd-app',

    // The player, and the video inside it (the second one is used when the class is missing).
    player: '#movie_player',
    video: '#movie_player video.html5-main-video',
    videoFallback: '#movie_player video',

    // Classes on the player while an ad plays: an ad ending is never taken for the video ending.
    ad: '.ad-showing, .ad-interrupting',

    // YouTube's miniplayer: the video plays on in a corner while you browse other pages, and the address
    // no longer names it. The app's attribute, or the player moved into the miniplayer (either may come first).
    miniplayer: 'ytd-app[miniplayer-is-active], ytd-miniplayer #movie_player',
    // Its box on screen (video and title; the size follows the video): the button and card stay clear of it.
    miniplayerBox: 'ytd-miniplayer',

    // A video that can't play: the player's own error overlay, or the watch page's error screen
    // (which only counts while the message inside it shows).
    playerError: '.ytp-error',
    errorScreen: 'ytd-watch-flexy #error-screen',
    errorScreenMessage: 'yt-playability-error-supported-renderers',

    // The time bar: pressing it means you're scrubbing, and the end of the video waits for you.
    timeBar: '#movie_player .ytp-progress-bar-container, #movie_player .ytp-progress-bar',

    // The player's Next and Previous buttons, which follow the shuffle.
    nextButton: '.ytp-next-button',
    prevButton: '.ytp-prev-button',

    // Video cards, for the page watcher: feed and channel grids, search results, playlist rows, the
    // watch page's sidebar and playlist panel. A card can sit inside another (a lockup in a grid item);
    // only the outer one counts. Lockups can also be playlist or mix cards.
    videoItem: 'ytd-rich-item-renderer, ytd-video-renderer, ytd-grid-video-renderer, ytd-playlist-video-renderer, ' +
      'ytd-compact-video-renderer, ytd-playlist-panel-video-renderer, yt-lockup-view-model',

    // YouTube keeps the pages you left in the DOM, hidden with this attribute: their cards don't count.
    hidden: '[hidden]',

    // Watch progress on a card's thumbnail, for the unwatched filter. The red bar's width is the share
    // watched (the classic overlay, then the newer view-model one). The playback-status overlay is
    // YouTube's "Watched" label; thumbnail badges are also read for the word "Watched".
    progressBar: 'ytd-thumbnail-overlay-resume-playback-renderer #progress, .ytThumbnailOverlayProgressBarHostWatchedProgressBarSegment',
    watchedLabel: 'ytd-thumbnail-overlay-playback-status-renderer',
    thumbnailBadge: 'ytd-thumbnail-overlay-time-status-renderer, yt-thumbnail-badge-view-model, badge-shape',

    // A card's link to its video: the watch URL carries the video id.
    cardLink: 'a[href*="/watch?v="]',

    // Playlist pages, for the playlist tools: the rows, the list that holds them and its spinner (the tools
    // sit right above it), and each row's title, channel and metadata line (where "Added …" can show).
    // Two layouts: the classic one, then the 2026 one (checked on youtube.com, November 2026), where each row
    // is a plain wrapper around a yt-lockup-view-model in the section list's #contents, and the spinner sits
    // next to that section; its channel is the first metadata row (a link, or plain text for several artists).
    playlistRow: 'ytd-playlist-video-renderer, yt-item-section-renderer > #contents > :has(> yt-lockup-view-model)',
    playlistList: 'ytd-playlist-video-list-renderer, yt-section-list-renderer',
    rowTitle: '#video-title, h3 a',
    // A row's heading (both layouts): an unavailable video's old title is shown at its end.
    rowHeading: 'h3',
    rowChannel: 'ytd-channel-name a, #channel-name a, #byline a, yt-content-metadata-view-model .ytContentMetadataViewModelMetadataRow',
    rowMetaText: '#video-info span, #metadata-line span, yt-content-metadata-view-model .ytContentMetadataViewModelMetadataText',
    // The header's "1,234 videos", read for the playlist's length.
    playlistHeader: 'ytd-playlist-header-renderer, yt-page-header-view-model, ytd-playlist-sidebar-renderer',
    // The spinner at the end of a list while more can load: scrolling to it loads the next part.
    continuation: 'ytd-continuation-item-renderer, ytd-continuation-item-view-model, yt-continuation-item-view-model',
    // The drag handle on rows of playlists you own: hidden while the tools show their own order.
    reorderHandle: '#reorder',
    // The note YouTube shows over a playlist when it hides unavailable videos ("2 unavailable videos are hidden",
    // or since 2026 just "Unavailable videos are hidden").
    playlistAlert: 'ytd-alert-with-button-renderer, ytd-alert-renderer, yt-alert-with-actions-renderer, yt-alert-view-model',

    // Places inside the player that open another video (end-screen cards, the video wall, autoplay's
    // countdown, up next, suggestions). Clicking one counts as your choice, not YouTube's autoplay.
    playerLinks: '.ytp-ce-element, .ytp-videowall-still, .ytp-autonav-endscreen, .ytp-upnext, .ytp-suggestion-set',
  });
})(globalThis);
