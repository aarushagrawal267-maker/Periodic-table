/*
 * The reel stage runtime. It builds one frame's DOM from window.__PLAN__ and exposes
 * window.__stage.seek(t): every moving property is a pure function of t (seconds), so frames can be
 * captured in any order, by several pages at once, and always come out the same.
 *
 * Layout: 1080x1920. Platform overlays cover the top ~250 px, the bottom ~420 px and the right ~150 px,
 * so everything that matters sits in x 80..930, y 250..1500.
 */
(() => {
  const P = window.__PLAN__;
  const L = 80; // left edge of content
  const R = 930; // right edge of content
  const CW = R - L; // content width
  const TOP = 380; // first content line, under the brand row
  const BOTTOM = 1500; // last pixel of content

  // ---------------------------------------------------------------- motion (one curve, as in docs/DESIGN.md)

  function bezier(x1, y1, x2, y2) {
    const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
    const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
    const sx = (u) => ((ax * u + bx) * u + cx) * u;
    const sy = (u) => ((ay * u + by) * u + cy) * u;
    const dx = (u) => (3 * ax * u + 2 * bx) * u + cx;
    return (x) => {
      if (x <= 0) return 0;
      if (x >= 1) return 1;
      let u = x;
      for (let i = 0; i < 8; i++) {
        const e = sx(u) - x;
        const d = dx(u);
        if (Math.abs(e) < 1e-6 || Math.abs(d) < 1e-6) break;
        u -= e / d;
      }
      let lo = 0, hi = 1;
      for (let i = 0; i < 30 && Math.abs(sx(u) - x) > 1e-6; i++) {
        if (sx(u) < x) lo = u; else hi = u;
        u = (lo + hi) / 2;
      }
      return sy(u);
    };
  }
  const ease = bezier(0.22, 1, 0.36, 1);
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const prog = (t, at, dur) => ease(clamp01((t - at) / dur));
  const lin = (t, at, dur) => clamp01((t - at) / dur);
  const lerp = (a, b, p) => a + (b - a) * p;
  const ENTER = 0.42; // entrance, a little longer than the app's 360 ms for a frame seen from arm's length
  const EXIT = 0.2;

  /**
   * Visibility of a block that rises in at `inAt` and fades out at `outAt` (null: stays).
   * Returns [opacity, translateY].
   */
  function life(t, inAt, outAt, dy = 28) {
    if (t < inAt) return [0, dy];
    const pin = prog(t, inAt, ENTER);
    const pout = outAt == null ? 0 : lin(t, outAt, EXIT);
    return [pin * (1 - pout), (1 - pin) * dy - pout * 16];
  }
  function apply(el, [o, y], extra = '') {
    el.style.opacity = o.toFixed(4);
    el.style.visibility = o <= 0.001 ? 'hidden' : 'visible';
    el.style.transform = `translate3d(0, ${y.toFixed(2)}px, 0) ${extra}`;
  }

  // ---------------------------------------------------------------- DOM helpers

  const stage = document.getElementById('stage');
  function h(tag, props = {}, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'style') Object.assign(el.style, v);
      else if (k === 'class') el.className = v;
      else if (k.startsWith('--')) el.style.setProperty(k, v);
      else el.setAttribute(k, v);
    }
    for (const k of kids.flat()) if (k != null) el.append(k.nodeType ? k : document.createTextNode(String(k)));
    return el;
  }
  function place(el, x, y, w) {
    el.classList.add('abs');
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    if (w != null) el.style.width = `${w}px`;
    return el;
  }
  const add = (el) => (stage.append(el), el);
  const catVar = (c) => `var(--cat-${c})`;

  const SVG = 'http://www.w3.org/2000/svg';
  function svg(paths, size, stroke = 2) {
    const s = document.createElementNS(SVG, 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('width', size);
    s.setAttribute('height', size);
    s.setAttribute('class', 'icon');
    s.setAttribute('stroke-width', stroke);
    for (const d of paths) {
      const p = document.createElementNS(SVG, 'path');
      p.setAttribute('d', d);
      s.append(p);
    }
    return s;
  }
  // lucide-react icons, the app's icon set.
  const ICON = {
    check: ['M20 6 9 17l-5-5'],
    arrowUpRight: ['M7 7h10v10', 'M7 17 17 7'],
  };

  /** LogoMark from src/components/Shell.tsx. */
  function logoMark(size) {
    const s = document.createElementNS(SVG, 'svg');
    s.setAttribute('viewBox', '0 0 28 28');
    s.setAttribute('width', size);
    s.setAttribute('height', size);
    s.innerHTML = '<rect x="0.75" y="0.75" width="26.5" height="26.5" rx="6.25" fill="none" stroke="currentColor" stroke-width="1.5"/><text x="14" y="18.5" text-anchor="middle" font-family="Figtree Variable" font-size="11" font-weight="600" fill="currentColor">Pa</text>';
    s.style.flex = 'none';
    return s;
  }
  function brand(mark, text) {
    return h('div', { class: 'brand', style: { fontSize: `${text}px`, gap: `${Math.round(mark * 0.32)}px` } }, logoMark(mark), 'Periodica');
  }

  /** ElementTile: tint, symbol, name, and the corner number (the signature). */
  function tile(e, size) {
    const el = h('div', { class: 'tile', '--c': catVar(e.category), style: { width: `${size}px`, height: `${size}px`, borderRadius: `${Math.round(size * 0.125)}px`, borderWidth: `${Math.max(2, Math.round(size / 140))}px` } });
    el.append(
      h('span', { class: 'tile-number', style: { left: `${Math.round(size * 0.09)}px`, top: `${Math.round(size * 0.08)}px`, fontSize: `${Math.round(size * 0.15)}px` } }, e.number),
      h('span', { class: 'tile-symbol', style: { fontSize: `${size * 0.36}px`, marginTop: `${size * 0.04}px` } }, e.symbol),
      h('span', { class: 'tile-name', style: { fontSize: `${Math.min(size * 0.13, (size * 0.94) / (e.name.length * 0.6))}px`, marginTop: `${size * 0.06}px` } }, e.name),
    );
    return el;
  }
  function chip(e, size) {
    return h(
      'span',
      { class: 'chip', '--c': catVar(e.category), style: { width: `${size}px`, height: `${size}px`, borderRadius: `${Math.round(size * 0.19)}px`, fontSize: `${Math.round(size * 0.4)}px` } },
      h('span', { class: 'tile-number', style: { left: `${Math.round(size * 0.1)}px`, top: `${Math.round(size * 0.1)}px`, fontSize: `${Math.round(size * 0.24)}px` } }, e.number),
      h('span', { style: { marginTop: `${Math.round(size * 0.12)}px` } }, e.symbol),
    );
  }
  function categoryRow(e, size) {
    return h(
      'div',
      { style: { display: 'flex', alignItems: 'center', gap: `${Math.round(size * 0.4)}px`, fontSize: `${size}px`, lineHeight: 1.25, color: 'var(--ink-2)' } },
      h('span', { class: 'dot', '--c': catVar(e.category), style: { width: `${Math.round(size * 0.5)}px`, height: `${Math.round(size * 0.5)}px` } }),
      e.categoryLabel,
    );
  }

  /** Largest font size (step 2 px), between min and max, at which `el` stays within maxHeight and its own width. */
  function fit(el, max, min, maxHeight) {
    let size = max;
    el.style.fontSize = `${size}px`;
    const over = () => el.offsetHeight > maxHeight || el.scrollWidth > el.clientWidth + 1;
    while (size > min && over()) {
      size -= 2;
      el.style.fontSize = `${size}px`;
    }
    return size;
  }

  // ---------------------------------------------------------------- shared pieces

  /** The small brand row at the top of every scene but the end card. */
  function topBrand(hideAt) {
    const el = add(place(brand(56, 44), L, 268));
    return (t) => apply(el, life(t, -1, hideAt, 0));
  }

  /** Mini periodic table with one element called out. Returns { root, update(t, at) }. */
  function miniTable(e, y) {
    const cell = 40;
    const gap = 4;
    const step = cell + gap;
    const width = 18 * step - gap;
    const x0 = L + Math.round((CW - width) / 2);
    const root = add(h('div', { class: 'abs', style: { left: '0px', top: '0px', width: '1080px', height: '1920px' } }));
    const yOf = (r) => (r <= 7 ? y + (r - 1) * step : y + 7 * step + 16 + (r - 9) * step);
    const cells = [];
    for (const c of P.cells) {
      const sq = h('div', { class: 'mini', '--c': catVar(c.cat), style: { left: `${x0 + (c.c - 1) * step}px`, top: `${yOf(c.r)}px`, width: `${cell}px`, height: `${cell}px` } });
      root.append(sq);
      cells.push({ el: sq, col: c.c, n: c.n });
    }
    const hx = x0 + (e.col - 1) * step;
    const hy = yOf(e.row);
    const big = 64;
    const hit = h('div', { class: 'mini-hit', '--c': catVar(e.category), style: { left: `${hx + cell / 2 - big / 2}px`, top: `${hy + cell / 2 - big / 2}px`, width: `${big}px`, height: `${big}px`, fontSize: '30px' } }, e.symbol);
    root.append(hit);
    const height = yOf(10) + cell - y;
    return {
      height,
      update(t, at, outAt) {
        const [o] = life(t, at, outAt, 0);
        root.style.opacity = o.toFixed(4);
        root.style.visibility = o <= 0.001 ? 'hidden' : 'visible';
        for (const c of cells) {
          const p = prog(t, at + (c.col - 1) * 0.022, 0.36);
          c.el.style.opacity = (p * (c.n === e.number ? 0 : 1)).toFixed(3);
          c.el.style.transform = `translate3d(0, ${((1 - p) * 12).toFixed(2)}px, 0)`;
        }
        const ph = prog(t, at + 0.55, 0.4);
        hit.style.opacity = ph.toFixed(3);
        hit.style.transform = `scale(${lerp(0.6, 1, ph).toFixed(4)})`;
      },
    };
  }

  /** Real screenshots of the app, framed as phones. */
  function appShots(y, height) {
    const shots = P.endShotImages;
    const gap = 32;
    const w = Math.floor((CW - gap * (shots.length - 1)) / shots.length);
    return shots.map(({ src, focus }, i) => {
      const el = add(place(h('div', { class: 'shot', style: { height: `${height}px` } }, h('img', { src, style: { objectPosition: focus } })), L + i * (w + gap), y, w));
      return el;
    });
  }

  /** End card: wordmark, the offer, the app itself, where to find it. */
  function endCard(at) {
    const parts = [];
    const b = add(place(brand(120, 100), L, TOP - 16));
    parts.push([b, 0]);
    const offer = add(place(h('div', { class: 'title', style: { fontSize: '68px' } }, 'Free, no sign-up'), L, TOP + 148, CW));
    parts.push([offer, 0.06]);
    const sub = add(place(h('div', { class: 'body ink-2', style: { fontSize: '44px', lineHeight: 1.25 } }, 'Lessons, games and a daily challenge for the periodic table'), L, TOP + 240, CW));
    parts.push([sub, 0.1]);
    const shotsY = TOP + 400;
    const shotsH = 560;
    for (const s of appShots(shotsY, shotsH)) parts.push([s, 0.16]);
    const linkY = shotsY + shotsH + 48;
    const link = add(
      place(
        h('div', { style: { display: 'flex', alignItems: 'center', gap: '16px', fontSize: '60px', fontWeight: 500, lineHeight: 1 } }, h('span', {}, 'Link in bio'), h('span', { style: { color: 'var(--accent)', display: 'flex' } }, svg(ICON.arrowUpRight, 60, 2.25))),
        L,
        linkY,
      ),
    );
    parts.push([link, 0.22]);
    const url = add(place(h('div', { class: 'ink-2', style: { fontSize: '40px', lineHeight: 1.3 } }, 'aarushagrawal267-maker.github.io', h('br'), '/Periodic-table'), L, linkY + 88, CW));
    parts.push([url, 0.26]);
    return (t) => {
      for (const [el, d] of parts) apply(el, life(t, at + d, null, 32));
    };
  }

  // ---------------------------------------------------------------- formats

  function spotlight() {
    const e = P.el;
    const T = P.times;
    const updates = [topBrand(T.end)];

    // Hook: the line is on screen from the first frame, the tile slides in under it.
    const hook = add(place(h('div', { class: 'headline' }, P.hook), L, TOP, CW));
    fit(hook, 112, 76, 372);
    const hookBottom = TOP + hook.offsetHeight;
    const bigY = hookBottom + 64;
    const bigSize = Math.min(520, BOTTOM - 120 - bigY);
    const hookSub = add(
      place(
        h('div', { style: { display: 'flex', alignItems: 'center', gap: '24px', fontSize: '44px', lineHeight: 1.25, color: 'var(--ink-2)' } }, categoryRow(P.el, 44), h('span', {}, '·'), h('span', {}, 'Element ', h('span', { class: 'mono' }, e.number))),
        L,
        bigY + bigSize + 40,
        CW,
      ),
    );
    updates.push((t) => {
      apply(hook, life(t, -1, T.basics - EXIT, 0));
      apply(hookSub, life(t, 0.3, T.basics - EXIT, 20));
    });

    // The hero tile: big under the hook, then small in the corner of every later scene.
    const SMALL = 248;
    const hero = add(tile(e, bigSize));
    updates.push((t) => {
      const pin = prog(t, 0, 0.5);
      const pmove = prog(t, T.basics, 0.55);
      const x = L;
      const y = lerp(bigY + (1 - pin) * 60, TOP, pmove);
      const s = lerp(lerp(0.9, 1, pin), SMALL / bigSize, pmove);
      const pout = lin(t, T.end - EXIT, EXIT);
      hero.style.left = '0px';
      hero.style.top = '0px';
      hero.style.opacity = (1 - pout).toFixed(4);
      hero.style.visibility = pout >= 1 ? 'hidden' : 'visible';
      hero.style.transform = `translate3d(${x}px, ${y.toFixed(2)}px, 0) scale(${s.toFixed(5)})`;
    });

    // Name block beside the small tile, from the basics scene on.
    const nameX = L + SMALL + 48;
    const nameW = R - nameX;
    const name = add(place(h('div', { class: 'title', style: { whiteSpace: 'nowrap' } }, e.name), nameX, TOP + 34, nameW));
    fit(name, 96, 56, 112);
    const cat = add(place(categoryRow(e, 44), nameX, TOP + 150, nameW));
    updates.push((t) => {
      apply(name, life(t, T.basics + 0.12, T.end - EXIT, 24));
      apply(cat, life(t, T.basics + 0.18, T.end - EXIT, 24));
    });

    // Basics: four printed figures, then where it sits on the table.
    const gy = TOP + SMALL + 56;
    const cw2 = (CW - 24) / 2;
    const cardH = 156;
    const mk = (label, value, i) => {
      const valueEl = h('div', { class: 'mono', style: { fontSize: '64px', lineHeight: 1, marginTop: '20px', color: 'var(--ink)' } }, value);
      const c = h('div', { class: 'card', style: { padding: '28px 32px', height: `${cardH}px` } }, h('div', { style: { fontSize: '36px', lineHeight: 1, color: 'var(--ink-2)' } }, label), valueEl);
      place(c, L + (i % 2) * (cw2 + 24), gy + Math.floor(i / 2) * (cardH + 20), cw2);
      add(c);
      return { c, valueEl };
    };
    const cards = [
      mk('Atomic number', '0', 0),
      mk('Atomic mass', '0', 1),
      mk('Group · Period', [h('span', {}, e.group ?? '—'), h('span', { style: { fontFamily: "'Figtree Variable'", color: 'var(--ink-2)', margin: '0 16px' } }, '·'), h('span', {}, e.period)], 2),
      mk(P.stat.label, P.stat.unit ? [P.stat.value, h('span', { style: { fontFamily: "'Figtree Variable'", fontSize: '0.62em', color: 'var(--ink-2)', marginLeft: '0.25em' } }, P.stat.unit)] : P.stat.value, 3),
    ];
    const statEl = cards[3].valueEl;
    if (!P.stat.mono) {
      statEl.classList.remove('mono');
      statEl.style.fontWeight = 500;
    }
    statEl.style.whiteSpace = 'nowrap';
    fit(statEl, 64, 40, 80);
    const ty = gy + 2 * cardH + 20 + 48;
    const table = miniTable(e, ty);
    updates.push((t) => {
      const out = T.uses - EXIT;
      cards.forEach(({ c }, i) => apply(c, life(t, T.basics + 0.15 + i * 0.06, out, 28)));
      const pn = prog(t, T.basics + 0.2, 0.9);
      cards[0].valueEl.textContent = String(Math.round(e.number * pn));
      const pm = prog(t, T.basics + 0.26, 1.0);
      cards[1].valueEl.textContent = (e.mass * pm).toFixed(e.massDecimals);
      table.update(t, T.basics + 1.2, out);
    });

    // Uses.
    if (P.uses.length) {
      const out = (P.fact ? T.fact : T.end) - EXIT;
      const lab = add(place(h('div', { class: 'label', style: { fontSize: '44px' } }, "Where you'll find it"), L, gy));
      let y = gy + 84;
      const rows = P.uses.map((u, i) => {
        const r = add(place(h('div', { class: 'card body', style: { padding: '36px 40px', fontSize: '56px', lineHeight: 1.2 } }, u), L, y, CW));
        y += r.offsetHeight + 20;
        return r;
      });
      updates.push((t) => {
        apply(lab, life(t, T.uses + 0.05, out, 24));
        rows.forEach((r, i) => apply(r, life(t, T.uses + 0.15 + i * 0.32, out, 28)));
      });
    }

    // Fact.
    if (P.fact) {
      const lab = add(place(h('div', { class: 'label', style: { fontSize: '44px' } }, 'Did you know'), L, gy));
      const card = add(place(h('div', { class: 'card body', style: { padding: '44px 48px', lineHeight: 1.28 } }, P.fact), L, gy + 84, CW));
      fit(card, 64, 44, BOTTOM - (gy + 84));
      updates.push((t) => {
        apply(lab, life(t, T.fact + 0.05, T.end - EXIT, 24));
        apply(card, life(t, T.fact + 0.12, T.end - EXIT, 28));
      });
    }

    updates.push(endCard(T.end));
    return updates;
  }

  function guess() {
    const e = P.el;
    const T = P.times;
    const n = P.clues.length;
    const updates = [topBrand(T.end)];

    // Title: on screen from the first frame; becomes the answer at the reveal.
    const title = add(place(h('div', { class: 'headline' }, P.title), L, TOP, CW));
    fit(title, 100, 72, 220);
    const answer = add(place(h('div', { class: 'headline', style: { fontSize: title.style.fontSize } }, `It's ${e.name.toLowerCase()}`), L, TOP, CW));
    fit(answer, parseInt(title.style.fontSize, 10), 64, 220);
    const titleH = Math.max(title.offsetHeight, answer.offsetHeight);

    // The mystery square, then the printed tile.
    const S = 300;
    const ty = TOP + titleH + 56;
    const slot = add(h('div', { class: 'slot', style: { left: `${L}px`, top: `${ty}px`, width: `${S}px`, height: `${S}px`, borderRadius: `${Math.round(S * 0.14)}px` } }));
    const q = h('span', { class: 'abs', style: { fontSize: '150px', fontWeight: 500, lineHeight: 1, left: '0', right: '0', top: '50%', textAlign: 'center', marginTop: '-80px' } }, '?');
    const count = h('span', { class: 'abs mono', style: { fontSize: '170px', fontWeight: 500, lineHeight: 1, left: '0', right: '0', top: '50%', textAlign: 'center', marginTop: '-88px', color: 'var(--ink)' } }, '3');
    slot.append(q, count);
    const answerTile = add(tile(e, S));
    answerTile.style.left = `${L}px`;
    answerTile.style.top = `${ty}px`;
    answerTile.style.transformOrigin = '50% 50%';

    // Status beside the square: which clue, the clue meter, then the countdown line, then the answer.
    const sx = L + S + 48;
    const sw = R - sx;
    const status = [];
    for (let i = 0; i < n; i++) status.push(add(place(h('div', { class: 'title', style: { fontSize: '56px' } }, 'Clue ', h('span', { class: 'mono' }, i + 1), ' of ', h('span', { class: 'mono' }, n)), sx, ty + 40, sw)));
    const lock = add(place(h('div', { class: 'title', style: { fontSize: '56px' } }, 'Your guess?'), sx, ty + 40, sw));
    const lockSub = add(place(h('div', { class: 'ink-2', style: { fontSize: '40px', lineHeight: 1.25 } }, 'Comment it before the reveal'), sx, ty + 124, sw));
    const segGap = 12;
    const segW = (sw - segGap * (n - 1)) / n;
    const segs = [];
    const meterRow = add(place(h('div', { style: { height: '12px' } }), sx, ty + 136, sw));
    for (let i = 0; i < n; i++) {
      const m = h('div', { class: 'meter abs', style: { left: `${i * (segW + segGap)}px`, top: '0px', width: `${segW}px`, height: '12px' } }, h('div', { class: 'meter-fill' }));
      meterRow.append(m);
      segs.push(m.firstChild);
    }
    const revCat = add(place(categoryRow(e, 44), sx, ty + 44, sw));
    const revNum = add(place(h('div', { class: 'ink-2', style: { fontSize: '44px', lineHeight: 1.25 } }, 'Element ', h('span', { class: 'mono' }, e.number)), sx, ty + 120, sw));
    const revState = add(place(h('div', { class: 'ink-2', style: { fontSize: '44px', lineHeight: 1.25 } }, `${e.state} at 20 °C`), sx, ty + 196, sw));

    // Clue cards, stacked under the square; sized together so the longest set still fits.
    const cy0 = ty + S + 56;
    const stack = add(place(h('div', { style: { display: 'flex', flexDirection: 'column', gap: '20px' } }), L, cy0, CW));
    const clueEls = P.clues.map((c, i) => {
      const row = h(
        'div',
        { class: 'card', style: { display: 'flex', alignItems: 'flex-start', gap: '28px', padding: '28px 32px' } },
        h('div', { class: 'keycap', style: { width: '64px', height: '64px', fontSize: '34px', marginTop: '2px' } }, i + 1),
        h('div', { class: 'body', style: { lineHeight: 1.22, fontSize: 'inherit' } }, c),
      );
      stack.append(row);
      return row;
    });
    fit(stack, 60, 40, BOTTOM - cy0);

    updates.push((t) => {
      const swapOut = T.reveal;
      apply(title, life(t, -1, swapOut - EXIT, 0));
      apply(answer, life(t, T.reveal + 0.1, T.end - EXIT, 28));

      // Square: question mark, then the countdown, then the printed tile.
      const slotOut = lin(t, T.reveal, 0.16);
      slot.style.opacity = ((1 - slotOut) * (1 - lin(t, T.end - EXIT, EXIT))).toFixed(4);
      const inCount = t >= T.countdown && t < T.reveal;
      q.style.opacity = inCount ? '0' : String(1 - lin(t, T.countdown - 0.12, 0.12));
      if (inCount) {
        const k = Math.floor(t - T.countdown);
        const local = t - T.countdown - k;
        count.textContent = String(3 - k);
        const p = prog(local, 0, 0.3);
        count.style.opacity = (p * (1 - lin(local, 0.85, 0.15))).toFixed(4);
        count.style.transform = `scale(${lerp(1.12, 1, p).toFixed(4)})`;
      } else count.style.opacity = '0';
      const pr = prog(t, T.reveal, 0.5);
      const pout = lin(t, T.end - EXIT, EXIT);
      answerTile.style.opacity = (pr * (1 - pout)).toFixed(4);
      answerTile.style.visibility = pr <= 0.001 || pout >= 1 ? 'hidden' : 'visible';
      answerTile.style.transform = `scale(${lerp(0.9, 1, pr).toFixed(4)})`;

      // Status.
      for (let i = 0; i < n; i++) {
        const next = i + 1 < n ? T.clues[i + 1] : T.countdown;
        const visible = (i === 0 || t >= T.clues[i]) && t < next;
        status[i].style.opacity = visible ? '1' : '0';
        status[i].style.visibility = visible ? 'visible' : 'hidden';
        status[i].style.transform = 'none';
        segs[i].style.transform = `scaleX(${prog(t, T.clues[i], 0.4).toFixed(4)})`;
      }
      apply(meterRow, life(t, -1, T.countdown - EXIT, 0));
      apply(lock, life(t, T.countdown, T.reveal - EXIT, 20));
      apply(lockSub, life(t, T.countdown + 0.08, T.reveal - EXIT, 20));
      apply(revCat, life(t, T.reveal + 0.15, T.end - EXIT, 24));
      apply(revNum, life(t, T.reveal + 0.21, T.end - EXIT, 24));
      apply(revState, life(t, T.reveal + 0.27, T.end - EXIT, 24));

      // Clues: in one by one, stay through the reveal.
      clueEls.forEach((c, i) => apply(c, life(t, i === 0 && T.clues[0] < 0.4 ? T.clues[0] : T.clues[i], T.end - EXIT, 32)));
    });

    updates.push(endCard(T.end));
    return updates;
  }

  function quiz() {
    const T = P.times;
    const updates = [topBrand(T.end)];
    const label = add(place(h('div', { class: 'label', style: { fontSize: '48px', lineHeight: '56px' } }, P.label), L, TOP));
    const clock = add(place(h('div', { class: 'mono', style: { fontSize: '56px', lineHeight: '56px', textAlign: 'right', fontWeight: 500 } }, String(T.timerLen)), R - 200, TOP, 200));
    const meter = add(place(h('div', { class: 'meter', style: { height: '12px' } }, h('div', { class: 'meter-fill' })), L, TOP + 84, CW));
    const fill = meter.firstChild;

    const qY = TOP + 140;
    const question = add(place(h('div', { class: 'headline' }, P.question), L, qY, CW));
    const list = add(place(h('div', { style: { display: 'flex', flexDirection: 'column', gap: '20px' } }), L, 0, CW));
    const letters = ['A', 'B', 'C', 'D'];
    const opts = P.options.map((o, i) => {
      const key = h('div', { class: 'keycap', style: { width: '80px', height: '80px', fontSize: '40px' } }, letters[i]);
      const mark = h('span', { style: { color: 'var(--good)', display: 'flex', marginLeft: 'auto', opacity: 0 } }, svg(ICON.check, 60, 2.5));
      const extra = i === P.answerIndex && P.answerEl ? chip(P.answerEl, 84) : null;
      if (extra) extra.style.opacity = '0';
      const row = h('div', { class: 'card', style: { display: 'flex', alignItems: 'center', gap: '32px', padding: '28px 36px', minHeight: '144px' } }, key, h('div', { class: 'body', style: { lineHeight: 1.2 } }, o), extra, mark);
      list.append(row);
      return { row, key, mark, extra };
    });
    const expl = P.explanation ? add(place(h('div', { class: 'body', style: { lineHeight: 1.3, color: 'var(--ink)' } }, P.explanation), L, 0, CW)) : null;

    // Fit question, options and explanation into the safe area together: spacing gives way first, then type.
    let k = 1;
    const layout = () => {
      const f = k ** 0.6;
      question.style.fontSize = `${Math.round(100 * f)}px`;
      list.style.fontSize = `${Math.round(60 * f)}px`;
      list.style.gap = `${Math.round(20 * k)}px`;
      for (const o of opts) {
        o.row.style.minHeight = `${Math.round(144 * k)}px`;
        o.row.style.padding = `${Math.round(28 * k)}px ${Math.round(36 * k)}px`;
        o.key.style.width = o.key.style.height = `${Math.round(80 * f)}px`;
        o.key.style.fontSize = `${Math.round(40 * f)}px`;
      }
      const ly = qY + question.offsetHeight + Math.round(56 * k);
      list.style.top = `${ly}px`;
      let bottom = ly + list.offsetHeight;
      if (expl) {
        expl.style.fontSize = `${Math.round(54 * f)}px`;
        expl.style.top = `${bottom + Math.round(40 * k)}px`;
        bottom += Math.round(40 * k) + expl.offsetHeight;
      }
      return bottom;
    };
    while (layout() > BOTTOM && k > 0.5) k -= 0.02;

    updates.push((t) => {
      const out = T.end - EXIT;
      apply(label, life(t, -1, out, 0));
      apply(question, life(t, -1, out, 0));
      apply(meter, life(t, -1, out, 0));
      const left = Math.max(0, T.timerLen - (t - T.timerStart));
      clock.textContent = String(Math.max(1, Math.min(T.timerLen, Math.ceil(left - 1e-6))));
      apply(clock, life(t, -1, T.reveal - 0.1, 0));
      fill.style.transform = `scaleX(${clamp01(left / T.timerLen).toFixed(4)})`;
      apply(list, [1 - lin(t, out, EXIT), -16 * lin(t, out, EXIT)]);
      const pr = prog(t, T.reveal, 0.36);
      opts.forEach((o, i) => {
        const [oi, yi] = life(t, 0.12 + i * 0.08, null, 28);
        const right = i === P.answerIndex;
        o.row.style.opacity = (oi * (right ? 1 : lerp(1, 0.38, pr))).toFixed(4);
        o.row.style.transform = `translate3d(0, ${yi.toFixed(2)}px, 0)`;
        if (right) {
          o.row.style.background = `color-mix(in oklab, var(--good) ${(18 * pr).toFixed(2)}%, var(--surface))`;
          o.row.style.borderColor = `color-mix(in oklab, var(--good) ${(70 * pr).toFixed(2)}%, var(--line))`;
          o.key.style.background = `color-mix(in oklab, var(--good) ${(100 * pr).toFixed(2)}%, var(--surface-2))`;
          o.key.style.color = pr > 0.5 ? 'var(--bg)' : 'var(--ink-2)';
          o.key.style.borderColor = pr > 0.5 ? 'transparent' : 'var(--line-strong)';
          o.mark.style.opacity = pr.toFixed(4);
          if (o.extra) {
            const pe = prog(t, T.reveal + 0.2, 0.4);
            o.extra.style.opacity = pe.toFixed(4);
            o.extra.style.transform = `scale(${lerp(0.85, 1, pe).toFixed(4)})`;
          }
        }
      });
      if (expl) apply(expl, life(t, T.explain, out, 24));
    });

    updates.push(endCard(T.end));
    return updates;
  }

  // ---------------------------------------------------------------- boot

  let updates = [];
  async function init() {
    await document.fonts.ready;
    await Promise.all([
      document.fonts.load('400 40px "Figtree Variable"'),
      document.fonts.load('500 40px "Figtree Variable"'),
      document.fonts.load('600 40px "Figtree Variable"'),
      document.fonts.load('400 40px "Geist Mono Variable"'),
      document.fonts.load('500 40px "Geist Mono Variable"'),
    ]);
    updates = P.format === 'element-spotlight' ? spotlight() : P.format === 'guess-element' ? guess() : quiz();
    await Promise.all([...document.images].map((img) => (img.complete ? null : new Promise((r) => (img.onload = img.onerror = r)))));
    seek(0);
    return true;
  }
  function seek(t) {
    for (const u of updates) u(t);
    // Force style and layout now, so the screenshot that follows sees this frame.
    void stage.offsetHeight;
  }
  window.__stage = { init, seek };
})();
