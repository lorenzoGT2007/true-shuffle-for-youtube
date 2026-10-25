/*
 * True Shuffle: helpers for YouTube's own web API ("InnerTube").
 *
 * Runs in YouTube's page world (it needs the page's config and cookies), and is
 * also loaded by the tests. The parser walks the response generically instead of
 * hard-coding one layout, so small layout changes on YouTube's side don't break it.
 */
(function (root) {
  'use strict';

  const RECOMMENDED_STYLE = 'PLAYLIST_VIDEO_RENDERER_STYLE_RECOMMENDED_VIDEO';
  const CLOCK = /^\s*(\d{1,3}):(\d{2})(?::(\d{2}))?\s*$/;

  /** Plain text from YouTube's text objects ({simpleText}, {runs}, {content}) or strings. */
  function text(t) {
    if (t == null) return '';
    if (typeof t === 'string') return t;
    if (typeof t.simpleText === 'string') return t.simpleText;
    if (Array.isArray(t.runs)) return t.runs.map((r) => (r && r.text) || '').join('');
    if (typeof t.content === 'string') return t.content;
    return '';
  }

  function toInt(v) {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : null;
  }

  function clockToSeconds(s) {
    const m = CLOCK.exec(s || '');
    if (!m) return null;
    return m[3] != null ? (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) : (+m[1]) * 60 + (+m[2]);
  }

  /** First number in a string like "1,234 videos", "1.234 vídeos" or "1 234 vidéos". */
  function parseCount(s) {
    const m = /\d[\d.,\u00a0\u202f' ]*/.exec(s || '');
    if (!m) return null;
    const n = parseInt(m[0].replace(/\D/g, ''), 10);
    return Number.isFinite(n) ? n : null;
  }

  /** Depth-first search for the first value of `key` that passes `test`. */
  function findDeep(node, test) {
    const stack = [node];
    while (stack.length) {
      const cur = stack.pop();
      if (!cur || typeof cur !== 'object') continue;
      const hit = test(cur);
      if (hit != null) return hit;
      for (const k in cur) {
        const v = cur[k];
        if (v && typeof v === 'object') stack.push(v);
      }
    }
    return null;
  }

  function continuationToken(node) {
    return findDeep(node, (o) => (o.continuationCommand && typeof o.continuationCommand.token === 'string'
      ? o.continuationCommand.token : null));
  }

  function lockupDuration(lockup) {
    return findDeep(lockup && lockup.contentImage, (o) => {
      for (const k of ['text', 'content', 'simpleText']) {
        if (typeof o[k] === 'string') {
          const secs = clockToSeconds(o[k]);
          if (secs != null) return secs;
        }
      }
      return null;
    });
  }

  /** The playlist a card's tap action plays from (cards in a playlist carry its id). */
  function lockupPlaylistId(lockup) {
    const ctx = lockup && lockup.rendererContext;
    const direct = ctx && ctx.commandContext && ctx.commandContext.onTap && ctx.commandContext.onTap.innertubeCommand &&
      ctx.commandContext.onTap.innertubeCommand.watchEndpoint;
    if (direct && typeof direct.playlistId === 'string') return direct.playlistId;
    return findDeep(ctx, (o) => (o.watchEndpoint && typeof o.watchEndpoint.playlistId === 'string' ? o.watchEndpoint.playlistId : null));
  }

  /**
   * What a list entry is, as far as shuffling goes.
   *   strong: classic playlist rows, or cards whose tap action plays this playlist (the reliable signal)
   *   weak:   other cards, only trusted when nothing strong exists
   */
  function classify(entry, listId) {
    const r = entry.playlistVideoRenderer || entry.playlistPanelVideoRenderer;
    if (r) {
      if (!r.videoId) return null;
      if (r.style === RECOMMENDED_STYLE) return { kind: 'recommended', strong: true };
      if (r.isPlayable === false || r.unplayableText) return { kind: 'unplayable', strong: true };
      return {
        kind: 'video', strong: true, id: r.videoId,
        title: text(r.title),
        channel: text(r.shortBylineText) || text(r.longBylineText),
        duration: toInt(r.lengthSeconds) ?? clockToSeconds(text(r.lengthText)),
      };
    }
    const l = entry.lockupViewModel;
    if (l) {
      if (l.contentType !== 'LOCKUP_CONTENT_TYPE_VIDEO' || !l.contentId) return null;
      const md = l.metadata && l.metadata.lockupMetadataViewModel;
      const rows = md && md.metadata && md.metadata.contentMetadataViewModel && md.metadata.contentMetadataViewModel.metadataRows;
      const firstPart = Array.isArray(rows) && rows[0] && Array.isArray(rows[0].metadataParts) ? rows[0].metadataParts[0] : null;
      return {
        kind: 'video', strong: !!listId && lockupPlaylistId(l) === listId, id: l.contentId,
        title: text(md && md.title),
        channel: text(firstPart && firstPart.text),
        duration: lockupDuration(l),
      };
    }
    const sl = entry.shortsLockupViewModel;
    if (sl) {
      const cmd = sl.onTap && sl.onTap.innertubeCommand;
      const id = (cmd && cmd.reelWatchEndpoint && cmd.reelWatchEndpoint.videoId) ||
        (typeof sl.entityId === 'string' ? sl.entityId.replace(/^shorts-shelf-item-/, '') : '');
      if (!id) return null;
      return {
        kind: 'video', strong: false, id,
        title: text(sl.overlayMetadata && sl.overlayMetadata.primaryText), channel: '', duration: null,
      };
    }
    const reel = entry.reelItemRenderer;
    if (reel && reel.videoId) {
      return { kind: 'video', strong: false, id: reel.videoId, title: text(reel.headline), channel: '', duration: null };
    }
    return null;
  }

  function findTitle(json) {
    const md = json && json.metadata && json.metadata.playlistMetadataRenderer;
    const hd = json && json.header;
    return text(md && md.title) ||
      text(hd && hd.playlistHeaderRenderer && hd.playlistHeaderRenderer.title) ||
      text(hd && hd.pageHeaderRenderer && hd.pageHeaderRenderer.pageTitle) ||
      text(json && json.microformat && json.microformat.microformatDataRenderer && json.microformat.microformatDataRenderer.title) ||
      null;
  }

  function findTotal(json) {
    const candidates = [];
    const sidebar = json && json.sidebar && json.sidebar.playlistSidebarRenderer && json.sidebar.playlistSidebarRenderer.items;
    if (Array.isArray(sidebar)) {
      for (const it of sidebar) {
        const p = it && it.playlistSidebarPrimaryInfoRenderer;
        if (p && Array.isArray(p.stats) && p.stats[0]) candidates.push(text(p.stats[0]));
      }
    }
    const ph = json && json.header && json.header.playlistHeaderRenderer;
    if (ph) {
      candidates.push(text(ph.numVideosText));
      if (Array.isArray(ph.stats) && ph.stats[0]) candidates.push(text(ph.stats[0]));
    }
    // Newer header layouts: any short string in the header that reads like "342 videos".
    const stack = [json && json.header];
    while (stack.length) {
      const cur = stack.pop();
      if (typeof cur === 'string') {
        if (cur.length < 80 && /\d/.test(cur) && /v[ií]d[eé]o/i.test(cur)) candidates.push(cur);
      } else if (cur && typeof cur === 'object') {
        for (const k in cur) stack.push(cur[k]);
      }
    }
    for (const c of candidates) {
      if (c && /\d/.test(c)) {
        const n = parseCount(c);
        if (n != null) return n;
      }
    }
    return null;
  }

  function findError(json) {
    for (const a of (json && json.alerts) || []) {
      const r = a && (a.alertRenderer || a.alertWithButtonRenderer);
      if (r && r.type === 'ERROR') return text(r.text) || 'YouTube could not open this playlist.';
    }
    return null;
  }

  /**
   * Parses a /youtubei/v1/browse response for a playlist (first page or continuation).
   * Returns { items, continuation, skipped, title, total, error }.
   */
  function parseBrowse(json, listId) {
    const groups = []; // arrays that hold playlist entries
    const looseTokens = []; // continuation tokens in arrays that hold no entries
    const stack = [json];
    while (stack.length) {
      const cur = stack.pop();
      if (Array.isArray(cur)) {
        let skipped = 0;
        let token = null;
        let entries = 0;
        let recommended = 0;
        const strongItems = [];
        const weakItems = [];
        for (const entry of cur) {
          if (!entry || typeof entry !== 'object') continue;
          const c = classify(entry, listId);
          if (c) {
            entries++;
            if (c.kind === 'video') (c.strong ? strongItems : weakItems).push({ id: c.id, title: c.title, channel: c.channel, duration: c.duration });
            else if (c.kind === 'unplayable') skipped++;
            else if (c.kind === 'recommended') recommended++;
            continue;
          }
          const cont = entry.continuationItemRenderer || entry.continuationItemViewModel;
          if (cont) token = continuationToken(cont) || token;
        }
        if (entries) {
          const onlyRecommended = recommended === entries;
          if (!onlyRecommended) groups.push({ strongItems, weakItems, skipped, token });
        } else if (token) {
          looseTokens.push(token);
        }
        for (const v of cur) if (v && typeof v === 'object') stack.push(v);
      } else if (cur && typeof cur === 'object') {
        for (const k in cur) {
          const v = cur[k];
          if (v && typeof v === 'object') stack.push(v);
        }
      }
    }

    // Classic rows and cards that belong to this playlist win; other cards (recommendations
    // and the like) only count when the response has nothing better.
    const anyStrong = groups.some((g) => g.strongItems.length || g.skipped);
    const used = groups.filter((g) => (anyStrong ? g.strongItems.length || g.skipped : g.weakItems.length));
    const out = { items: [], continuation: null, skipped: 0, title: null, total: null, error: null };
    for (const g of used) {
      out.items.push(...(anyStrong ? g.strongItems : g.weakItems));
      out.skipped += g.skipped;
      if (g.token) out.continuation = g.token;
    }
    // A continuation page can come back with nothing but another continuation: follow it.
    const isContinuationPage = !!(json && (json.onResponseReceivedActions || json.onResponseReceivedEndpoints || json.continuationContents));
    if (!out.continuation && !used.length && isContinuationPage && looseTokens.length) out.continuation = looseTokens[0];
    // Very old layout.
    if (!out.continuation && json && json.continuationContents) {
      const old = json.continuationContents.playlistVideoListContinuation;
      const nc = old && old.continuations && old.continuations[0] && old.continuations[0].nextContinuationData;
      if (nc && nc.continuation) out.continuation = nc.continuation;
    }
    out.title = findTitle(json);
    out.total = findTotal(json);
    out.error = findError(json);
    return out;
  }

  function parseCookies(str) {
    const out = {};
    for (const part of String(str || '').split(/;\s*/)) {
      const i = part.indexOf('=');
      if (i <= 0) continue;
      const k = part.slice(0, i).trim();
      if (!(k in out)) out[k] = part.slice(i + 1);
    }
    return out;
  }

  /** DATASYNC_ID is "delegated||user" for a brand channel, or "user||" for the main account. */
  function parseDataSyncId(ds) {
    if (typeof ds !== 'string' || !ds) return { delegated: null, user: null };
    const i = ds.indexOf('||');
    const first = i >= 0 ? ds.slice(0, i) : ds;
    const second = i >= 0 ? ds.slice(i + 2) : '';
    return second ? { delegated: first || null, user: second } : { delegated: null, user: first || null };
  }

  async function sha1Hex(str) {
    const buf = await globalThis.crypto.subtle.digest('SHA-1', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * The Authorization header YouTube's own web client sends for signed-in requests
   * (same scheme yt-dlp uses): one SAPISID-style hash per available cookie.
   */
  async function sidAuthorization(cookies, origin, userSessionId, nowMs = Date.now()) {
    const ts = String(Math.round(nowMs / 1000));
    const schemes = [
      ['SAPISIDHASH', cookies.SAPISID || cookies['__Secure-3PAPISID']],
      ['SAPISID1PHASH', cookies['__Secure-1PAPISID']],
      ['SAPISID3PHASH', cookies['__Secure-3PAPISID']],
    ];
    const parts = [];
    for (const [scheme, sid] of schemes) {
      if (!sid) continue;
      const input = (userSessionId ? userSessionId + ' ' : '') + ts + ' ' + sid + ' ' + origin;
      parts.push(`${scheme} ${ts}_${await sha1Hex(input)}${userSessionId ? '_u' : ''}`);
    }
    return parts.length ? parts.join(' ') : null;
  }

  const api = { text, parseCount, clockToSeconds, classify, parseBrowse, parseCookies, parseDataSyncId, sha1Hex, sidAuthorization };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TrueShuffleYT = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
