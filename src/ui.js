/*
 * True Shuffle: the small floating control shown on YouTube.
 * Lives in a shadow root so YouTube's styles and ours never touch.
 * Built with DOM calls only (no innerHTML), so YouTube's Trusted Types policy is never involved.
 */
(function (root) {
  'use strict';

  const SVG_NS = 'http://www.w3.org/2000/svg';

  // 24x24 stroke icons, drawn for this extension.
  const ICONS = {
    shuffle: [
      'M3.5 7.5h3c2.2 0 3.4 1 4.5 2.8l2.1 3.4c1.1 1.8 2.3 2.8 4.5 2.8h2.9',
      'M3.5 16.5h3c1.3 0 2.2-.35 3-1.1',
      'M14 8.6c.8-.75 1.7-1.1 3-1.1h2.9',
      'M17.5 4.5l3 3-3 3',
      'M17.5 13.5l3 3-3 3',
    ],
    prev: ['M6.5 5.5v13', { d: 'M18 6.2v11.6L9.4 12z', fill: true }],
    next: ['M17.5 5.5v13', { d: 'M6 6.2v11.6l8.6-5.8z', fill: true }],
    queue: ['M4 6.5h11', 'M4 11.5h11', 'M4 16.5h7', { d: 'M15.5 14v6l4.8-3z', fill: true }],
    collapse: ['M6.5 9.5l5.5 5.5 5.5-5.5'],
    close: ['M6.5 6.5l11 11', 'M17.5 6.5l-11 11'],
    play: [{ d: 'M8 5.8v12.4l9.6-6.2z', fill: true }],
  };

  function icon(name, size = 20) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', String(size));
    svg.setAttribute('height', String(size));
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    for (const p of ICONS[name]) {
      const path = document.createElementNS(SVG_NS, 'path');
      const spec = typeof p === 'string' ? { d: p } : p;
      path.setAttribute('d', spec.d);
      if (spec.fill) {
        path.setAttribute('fill', 'currentColor');
        path.setAttribute('stroke', 'none');
      }
      svg.appendChild(path);
    }
    return svg;
  }

  /** Tiny element builder: h('div', {class: 'x', dataset: {act: 'next'}}, child, 'text'). */
  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'dataset') Object.assign(el.dataset, v);
        else if (k === 'text') el.textContent = v;
        else el.setAttribute(k, v === true ? '' : String(v));
      }
    }
    for (const c of children) {
      if (c == null || c === false) continue;
      el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return el;
  }

  function iconButton(act, name, label) {
    return h('button', { class: 'btn', type: 'button', dataset: { act }, 'aria-label': label, title: label }, icon(name));
  }

  const fmt = (n) => (n == null ? '' : Number(n).toLocaleString());

  const CSS = `
:host { all: initial; }
:host([hidden]) { display: none !important; }
.stack {
  --felt: #13382c;
  --felt-deep: #0d2820;
  --line: rgba(243, 236, 221, 0.13);
  --hover: rgba(243, 236, 221, 0.09);
  --ivory: #f3ecdd;
  --ivory-2: rgba(243, 236, 221, 0.66);
  --brass: #e2b04f;
  --brass-hi: #f1c877;
  --ink: #241a06;
  --shadow: 0 14px 34px rgba(0, 0, 0, 0.38), 0 2px 8px rgba(0, 0, 0, 0.28);
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 2147482000;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 10px;
  max-width: calc(100vw - 40px);
  font: 400 13px/1.35 Roboto, "YouTube Sans", "Segoe UI", system-ui, -apple-system, sans-serif;
  color: var(--ivory);
  -webkit-font-smoothing: antialiased;
  pointer-events: none;
}
.stack.left { right: auto; left: 20px; align-items: flex-start; }
.stack > * { pointer-events: auto; }
[hidden] { display: none !important; }
button { font: inherit; color: inherit; }

/* Round button: idle, or the shuffle folded away */
.fab {
  position: relative;
  width: 52px; height: 52px;
  border-radius: 50%;
  border: 1px solid var(--line);
  background: var(--felt);
  color: var(--brass);
  box-shadow: var(--shadow);
  display: grid; place-items: center;
  cursor: pointer;
  transition: transform .15s ease, background .15s ease;
}
.fab:hover { background: #184536; transform: translateY(-1px); }
.fab:active { transform: translateY(0); }
.fab svg { width: 24px; height: 24px; }
.fab .ring {
  position: absolute; inset: -4px; border-radius: 50%;
  background: conic-gradient(var(--brass) calc(var(--p, 0) * 1turn), rgba(243, 236, 221, 0.14) 0);
  -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 3px));
          mask: radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 3px));
}
.fab .tip {
  position: absolute; right: calc(100% + 12px); top: 50%;
  transform: translateY(-50%);
  white-space: nowrap;
  background: var(--felt-deep);
  color: var(--ivory);
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 7px 10px;
  font-size: 12.5px;
  opacity: 0; pointer-events: none;
  transition: opacity .15s ease;
  box-shadow: var(--shadow);
}
.fab.paused { color: var(--ivory-2); }
.fab.paused .ring { opacity: 0.55; }
.stack.left .fab .tip { right: auto; left: calc(100% + 12px); }
.fab:hover .tip, .fab:focus-visible .tip { opacity: 1; }

/* The card */
.card {
  width: 348px;
  max-width: 100%;
  background: var(--felt);
  border: 1px solid var(--line);
  border-radius: 16px;
  box-shadow: var(--shadow);
  overflow: hidden;
  animation: rise .18s ease-out;
}
@keyframes rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
.top { display: flex; align-items: center; gap: 10px; padding: 10px 8px 6px 12px; min-height: 36px; }
.mark {
  position: relative;
  width: 32px; height: 32px; flex: none;
  border-radius: 10px;
  background: var(--brass);
  color: var(--ink);
  display: grid; place-items: center;
}
.mark svg { width: 19px; height: 19px; stroke-width: 2.4; }
.mark.spin::after {
  content: ""; position: absolute; inset: -4px; border-radius: 13px;
  border: 2px solid transparent; border-top-color: var(--brass-hi);
  animation: spin .9s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
.count { font-size: 14px; color: var(--ivory-2); font-variant-numeric: tabular-nums; white-space: nowrap; }
.count strong { font-size: 17px; font-weight: 600; color: var(--ivory); margin-right: 2px; }
.msg { min-width: 0; display: flex; flex-direction: column; }
.msg strong { font-size: 14px; font-weight: 600; color: var(--ivory); }
.msg span { font-size: 12.5px; color: var(--ivory-2); }
.ctl { margin-left: auto; display: flex; gap: 0; flex: none; }
.btn {
  width: 34px; height: 34px;
  border: 0; border-radius: 10px;
  background: transparent; color: var(--ivory);
  display: grid; place-items: center;
  cursor: pointer;
}
.btn:hover { background: var(--hover); }
.btn[aria-pressed="true"] { color: var(--brass); }
.btn svg { width: 20px; height: 20px; }
.sub {
  display: flex; gap: 8px; align-items: baseline;
  padding: 0 14px 11px 54px;
  min-width: 0;
  white-space: nowrap;
}
.sub .label { color: var(--brass); font-size: 12px; flex: none; }
.sub .nt { color: var(--ivory); overflow: hidden; text-overflow: ellipsis; flex: 0 1 auto; min-width: 0; }
.sub .nc { color: var(--ivory-2); font-size: 12px; overflow: hidden; text-overflow: ellipsis; flex: 0 10000 auto; min-width: 0; }
.actions { display: flex; gap: 8px; padding: 2px 12px 12px 54px; }
.pill {
  border: 0; border-radius: 999px;
  padding: 7px 14px;
  font-size: 13px; font-weight: 500;
  cursor: pointer;
  background: var(--hover); color: var(--ivory);
}
.pill:hover { background: rgba(243, 236, 221, 0.15); }
.pill.primary { background: var(--brass); color: var(--ink); font-weight: 600; }
.pill.primary:hover { background: var(--brass-hi); }
.bar { height: 3px; background: rgba(243, 236, 221, 0.1); }
.bar i { display: block; height: 100%; width: calc(var(--p, 0) * 100%); background: var(--brass); transition: width .4s ease; }
.bar.busy i { width: 30%; animation: slide 1.1s ease-in-out infinite; }
@keyframes slide { from { transform: translateX(-100%); } to { transform: translateX(340%); } }

/* Up-next list */
.queue {
  width: 348px; max-width: 100%;
  max-height: min(60vh, 440px);
  display: flex; flex-direction: column;
  background: var(--felt-deep);
  border: 1px solid var(--line);
  border-radius: 16px;
  box-shadow: var(--shadow);
  overflow: hidden;
  animation: rise .18s ease-out;
}
.qhead { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; padding: 12px 14px 8px; }
.qhead strong { font-size: 14px; font-weight: 600; }
.qhead span { font-size: 12px; color: var(--ivory-2); }
.qlist { list-style: none; margin: 0; padding: 0 6px 6px; overflow-y: auto; overscroll-behavior: contain; }
.qlist::-webkit-scrollbar { width: 8px; }
.qlist::-webkit-scrollbar-thumb { background: rgba(243, 236, 221, 0.18); border-radius: 8px; }
.qitem {
  width: 100%;
  display: grid; grid-template-columns: 36px minmax(0, 1fr); align-items: start;
  padding: 7px 8px; gap: 2px;
  border: 0; border-radius: 10px;
  background: transparent; text-align: left;
  cursor: pointer;
}
.qitem:hover { background: var(--hover); }
.qn { color: var(--brass); font-size: 12px; font-variant-numeric: tabular-nums; padding-top: 1px; }
.qtext { display: flex; flex-direction: column; min-width: 0; }
.qt { color: var(--ivory); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.qc { color: var(--ivory-2); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.qfoot { display: flex; gap: 8px; padding: 10px 12px 12px; border-top: 1px solid var(--line); }
.qempty { padding: 6px 14px 14px; color: var(--ivory-2); }

button:focus-visible { outline: 2px solid var(--brass); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) {
  .card, .queue { animation: none; }
  .mark.spin::after, .bar.busy i { animation: none; }
  .fab, .bar i { transition: none; }
}
`;

  function create(onAction) {
    const host = document.createElement('div');
    host.id = 'true-shuffle-root';
    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = CSS;
    const stack = h('div', { class: 'stack', role: 'region', 'aria-label': 'True Shuffle' });
    shadow.append(style, stack);

    const queue = h('section', { class: 'queue', hidden: true, 'aria-label': 'Up next' });
    const card = h('div', { class: 'card', hidden: true });
    const fabRing = h('span', { class: 'ring', hidden: true });
    const fabTip = h('span', { class: 'tip' });
    const fab = h('button', { class: 'fab', type: 'button', hidden: true }, fabRing, icon('shuffle', 24), fabTip);
    stack.append(queue, card, fab);

    // Ignore clicks for a moment after the layout changes, so the second click of a
    // double-click can't land on a button that just appeared under the pointer.
    let guardUntil = 0;
    const guard = () => { guardUntil = performance.now() + 450; };

    // A mouse click shouldn't move keyboard focus into our buttons: Space must keep pausing the video.
    stack.addEventListener('mousedown', (e) => {
      if (e.target instanceof Element && e.target.closest('button')) e.preventDefault();
    });
    stack.addEventListener('click', (e) => {
      const target = e.target instanceof Element ? e.target.closest('[data-act]') : null;
      if (!target) return;
      e.preventDefault();
      e.stopPropagation();
      if (performance.now() < guardUntil) return;
      onAction(target.dataset.act, target.dataset.id || null);
    });

    let cardMode = null;
    let shownAs = null;
    let refs = {};
    let queueKey = '';

    function buildCard(mode) {
      card.replaceChildren();
      refs = {};
      card.dataset.mode = mode;
      if (mode === 'active') {
        refs.pos = h('strong');
        refs.total = document.createTextNode('');
        refs.queueBtn = iconButton('queue', 'queue', 'Up next');
        refs.nt = h('span', { class: 'nt' });
        refs.nc = h('span', { class: 'nc' });
        refs.bar = h('div', { class: 'bar' }, h('i'));
        card.append(
          h('div', { class: 'top' },
            h('div', { class: 'mark' }, icon('shuffle')),
            h('div', { class: 'count' }, refs.pos, refs.total),
            h('div', { class: 'ctl' },
              iconButton('prev', 'prev', 'Previous (Shift+P)'),
              iconButton('next', 'next', 'Next (Shift+N)'),
              refs.queueBtn,
              iconButton('collapse', 'collapse', 'Fold away'),
              iconButton('stop', 'close', 'Stop shuffling (your place is kept)'))),
          refs.sub = h('div', { class: 'sub' }, h('span', { class: 'label', text: 'Next' }), refs.nt, refs.nc),
          refs.bar,
        );
        return;
      }
      const msgTitle = h('strong');
      const msgText = h('span');
      refs.msgTitle = msgTitle;
      refs.msgText = msgText;
      const mark = h('div', { class: mode === 'loading' ? 'mark spin' : 'mark' }, icon('shuffle'));
      const top = h('div', { class: 'top' }, mark, h('div', { class: 'msg' }, msgTitle, msgText),
        h('div', { class: 'ctl' }, iconButton(mode === 'loading' ? 'cancel' : 'stop', 'close',
          mode === 'loading' ? 'Cancel' : 'Close')));
      card.append(top);
      if (mode === 'paused') {
        refs.switchBtn = h('button', { class: 'pill', type: 'button', dataset: { act: 'switch' } }, 'Shuffle this one instead');
        card.append(h('div', { class: 'actions' },
          h('button', { class: 'pill primary', type: 'button', dataset: { act: 'resume' } }, 'Resume shuffle'),
          refs.switchBtn));
      } else if (mode === 'finished') {
        card.append(h('div', { class: 'actions' },
          h('button', { class: 'pill primary', type: 'button', dataset: { act: 'again' } }, 'Shuffle again')));
      } else if (mode === 'error') {
        card.append(h('div', { class: 'actions' },
          h('button', { class: 'pill primary', type: 'button', dataset: { act: 'retry' } }, 'Try again')));
      } else if (mode === 'loading') {
        refs.bar = h('div', { class: 'bar' }, h('i'));
        card.append(refs.bar);
      }
    }

    function renderQueue(q) {
      if (!q) {
        queue.hidden = true;
        queueKey = '';
        return;
      }
      const key = JSON.stringify([q.round, q.left, q.items.map((i) => i.id)]);
      queue.hidden = false;
      if (key === queueKey) return;
      queueKey = key;
      const list = h('ol', { class: 'qlist' });
      for (const it of q.items) {
        list.appendChild(h('li', null,
          h('button', { class: 'qitem', type: 'button', dataset: { act: 'play', id: it.id }, title: 'Play now' },
            h('span', { class: 'qn', text: String(it.n) }),
            h('span', { class: 'qtext' },
              h('span', { class: 'qt', text: it.title || it.id }),
              it.channel ? h('span', { class: 'qc', text: it.channel }) : null))));
      }
      queue.replaceChildren(
        h('div', { class: 'qhead' },
          h('strong', { text: 'Up next' }),
          h('span', { text: q.left === 1 ? '1 left in round ' + q.round : fmt(q.left) + ' left in round ' + q.round })),
        q.items.length ? list : h('div', { class: 'qempty', text: 'This is the last video of the round.' }),
        h('div', { class: 'qfoot' },
          h('button', { class: 'pill', type: 'button', dataset: { act: 'reshuffle' } }, 'Reshuffle what’s left'),
          h('button', { class: 'pill', type: 'button', dataset: { act: 'restart' } }, 'Start over')),
      );
    }

    function render(vm) {
      stack.classList.toggle('left', vm.corner === 'left');
      const mode = vm.mode;
      host.hidden = mode === 'hidden';
      if (mode === 'hidden') return;

      const fabMode = mode === 'fab' || mode === 'mini';
      const layout = fabMode ? 'fab' : 'card';
      if (shownAs !== null && layout !== shownAs) guard();
      shownAs = layout;
      fab.hidden = !fabMode;
      card.hidden = fabMode;
      if (fabMode) {
        cardMode = null;
        renderQueue(null);
        fab.dataset.act = mode === 'fab' ? 'start' : 'expand';
        fab.classList.toggle('paused', !!vm.paused);
        fabTip.textContent = vm.tip;
        fab.setAttribute('aria-label', vm.tip);
        fabRing.hidden = vm.progress == null;
        if (vm.progress != null) fab.style.setProperty('--p', String(vm.progress));
        return;
      }

      if (cardMode !== mode) {
        buildCard(mode);
        cardMode = mode;
      }
      if (mode === 'active') {
        refs.pos.textContent = fmt(vm.position);
        refs.total.textContent = ' of ' + fmt(vm.total);
        refs.bar.style.setProperty('--p', String(vm.total ? vm.position / vm.total : 0));
        if (vm.next) {
          refs.nt.textContent = vm.next.title || vm.next.id;
          refs.nc.textContent = vm.next.channel || '';
          refs.sub.title = vm.next.channel ? `${vm.next.title} (${vm.next.channel})` : vm.next.title || '';
        } else {
          refs.nt.textContent = vm.onFinish === 'stop' ? 'Nothing. This is the last one.' : 'A fresh shuffle of the whole playlist';
          refs.nc.textContent = '';
          refs.sub.title = '';
        }
        refs.queueBtn.setAttribute('aria-pressed', vm.queue ? 'true' : 'false');
        renderQueue(vm.queue);
        return;
      }
      renderQueue(null);
      if (mode === 'loading') {
        refs.msgTitle.textContent = 'Reading the playlist';
        refs.msgText.textContent = vm.loaded
          ? (vm.total ? `${fmt(vm.loaded)} of ${fmt(vm.total)} videos` : `${fmt(vm.loaded)} videos so far`)
          : 'Getting every video, not just the first 200';
        refs.bar.classList.toggle('busy', !vm.total);
        refs.bar.style.setProperty('--p', String(vm.total ? Math.min(1, vm.loaded / vm.total) : 0));
      } else if (mode === 'paused') {
        refs.msgTitle.textContent = 'Shuffle paused';
        refs.msgText.textContent = `You left the playlist. ${fmt(vm.position)} of ${fmt(vm.total)} played.`;
        refs.switchBtn.hidden = !vm.canSwitch;
      } else if (mode === 'finished') {
        refs.msgTitle.textContent = `All ${fmt(vm.total)} videos played`;
        refs.msgText.textContent = 'Each one exactly once.';
      } else if (mode === 'error') {
        refs.msgTitle.textContent = 'Couldn’t start the shuffle';
        refs.msgText.textContent = vm.message || 'Something went wrong.';
      }
    }

    return { host, render };
  }

  root.TrueShuffleUI = { create };
})(globalThis);
