// Photo gallery: grid, cover, full-screen viewer with gestures, view beacon for the statistics.
// Bundled and minified by Astro. Data comes from <script type="application/json" id="gallery-data">.
//
// Sections: 1 data & helpers · 2 grid · 3 cover & scrolling · 4 viewer (display, paging, open/close)
//           5 viewer gestures (zoom, swipe) · 6 block page zoom · 7 start

// ───────────────────────────── 1 Data & helpers ─────────────────────────────
const { photos, urls, prefix, rowScale } = JSON.parse(document.getElementById('gallery-data').textContent);
const N = photos.length;
// urls: small | thumb | full | hit, 'X' = photo number. Image sizes get ?v=… (cache key per photo), extra = further parameters
const U = (kind, p, extra = '') => urls[kind].replace('X', p.id) + (kind !== 'hit' && p.v ? '?v=' + p.v + (extra ? '&' + extra : '') : (extra ? '?' + extra : ''));
const $ = (s) => document.querySelector(s);
const DPR = Math.min(window.devicePixelRatio || 1, 3);
const EASE = 'cubic-bezier(.2,.7,.2,1)';
const saveData = !!(navigator.connection && navigator.connection.saveData);
const decoded = (el) => (el.decode ? el.decode().catch(() => {}) : Promise.resolve());

const grid = $('#grid'), coverBg = $('.cover-bg'), nudge = $('#nudge');
const lb = $('#lb'), stage = $('#lb-stage'), img = $('#lb-img'), ghost = $('#lb-ghost'), counter = $('#lb-counter'), dl = $('#lb-dl');

let cur = -1;                                                    // index of the open photo, -1 = viewer closed

// ───────────────────────────── 2 Grid ─────────────────────────────
// Justified layout: row height follows the width. Desktop about 4 photos per row, tablet 2 to 3, phone 2 portraits or 1 landscape.
const GAP = 10, SCALE = (rowScale || 100) / 100;
const targetFor = (W) => Math.max(180, W * (W < 700 ? 0.8 : W < 1100 ? 0.45 : 0.31) * SCALE);

const tiles = photos.map((p, i) => {
  const b = document.createElement('button'); b.title = prefix + p.id;
  const im = document.createElement('img'); im.loading = 'lazy'; im.decoding = 'async'; im.alt = '';
  im.onerror = () => { if (im.dataset.k === 'small') { im.dataset.k = 'thumb'; im.src = U('thumb', p); } };   // fallback if small/ is missing
  b.appendChild(im); b.addEventListener('click', () => open(i));
  return b;
});

// Image source by actual tile width: small size (600 px) for phone tiles, otherwise 1200 px. Never step down.
function tileSrc(im, p, w) {
  const k = w * DPR <= 600 ? 'small' : 'thumb';   // never upscale
  if (im.dataset.k === 'thumb' || im.dataset.k === k) return;
  im.dataset.k = k; im.src = U(k, p);
}

function layout() {
  const W = grid.clientWidth - 20, target = targetFor(W);
  const frag = document.createDocumentFragment();
  let row = [], sum = 0;
  const flush = (last) => {
    if (!row.length) return;
    let h = (W - GAP * (row.length - 1)) / sum;
    if (last && h > target * 1.35) h = target;                   // do not inflate the last row
    const div = document.createElement('div'); div.className = 'row';
    div.style.containIntrinsicSize = '0 ' + Math.floor(h) + 'px'; // placeholder height for content-visibility
    for (const { i, ar } of row) {
      const b = tiles[i], w = Math.floor(ar * h);
      b.style.width = w + 'px'; b.style.height = Math.floor(h) + 'px';
      tileSrc(b.firstChild, photos[i], w);
      div.appendChild(b);
    }
    frag.appendChild(div); row = []; sum = 0;
  };
  photos.forEach((p, i) => {
    const ar = p.w / p.h; row.push({ i, ar }); sum += ar;
    if (sum * target + GAP * (row.length - 1) >= W) flush(false);
  });
  flush(true);
  grid.replaceChildren(frag);
}

// Touch feedback: the touched tile grows slightly and shows the zoom icon (CSS .touched), also while scrolling.
let touched = null, touchedT, touchedAt = 0;
function touchTile(t) {
  const b = t && t.closest ? t.closest('#grid button') : null; if (!b) return;
  clearTimeout(touchedT); if (touched && touched !== b) touched.classList.remove('touched');
  touched = b; touchedAt = Date.now(); b.classList.add('touched');
}
function untouchTile() {                                         // at least 1 s from touch, 0.7 s after release
  clearTimeout(touchedT);
  touchedT = setTimeout(() => { if (touched) touched.classList.remove('touched'); touched = null; }, Math.max(700, 1000 - (Date.now() - touchedAt)));
}
grid.addEventListener('touchstart', (e) => touchTile(e.target), { passive: true });
grid.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') touchTile(e.target); });
for (const t of ['touchend', 'touchcancel']) grid.addEventListener(t, untouchTile, { passive: true });
for (const t of ['pointerup', 'pointercancel']) grid.addEventListener(t, (e) => { if (e.pointerType === 'touch') untouchTile(); });

// ───────────────────────────── 3 Cover & scrolling ─────────────────────────────
// Hide the cover once it is far out of view (otherwise its layer flashes through on fast scrolling).
// Remember the scroll position in the tab so a reload deep in the gallery does not paint the cover at all (see head script).
let cvRaf = 0, lastStored = 0;
function checkCover() {
  const y = scrollY;
  document.documentElement.classList.toggle('cover-off', y > coverBg.offsetHeight + 400);
  if (Math.abs(y - lastStored) > 150) { lastStored = y; try { sessionStorage.setItem('gallery-sy', y); } catch {} }
}
addEventListener('scroll', () => { if (!cvRaf) cvRaf = requestAnimationFrame(() => { cvRaf = 0; checkCover(); }); }, { passive: true });
addEventListener('load', () => { checkCover(); setTimeout(checkCover, 100); setTimeout(checkCover, 600); });
addEventListener('pageshow', checkCover);

// Scroll hint: show the arrow after 10 s without activity in the grid (not on the cover, not at the end, not in the viewer).
let nudgeT;
function armNudge() {
  nudge.classList.remove('show'); clearTimeout(nudgeT);
  nudgeT = setTimeout(() => {
    const pastCover = scrollY > coverBg.offsetHeight - 120;
    const atEnd = innerHeight + scrollY >= document.documentElement.scrollHeight - 240;
    if (pastCover && !atEnd && cur < 0) nudge.classList.add('show');
  }, 10000);
}
// Activity hides the arrow, unless the touch is on the arrow itself (otherwise it vanishes under the finger before the click arrives)
const armFromEvent = (e) => { if (e && e.target instanceof Node && nudge.contains(e.target)) return; armNudge(); };
for (const t of ['scroll', 'pointerdown', 'keydown', 'wheel', 'touchstart']) addEventListener(t, armFromEvent, { passive: true });
nudge.addEventListener('click', (e) => {                        // click on the arrow: one screen height further (minus some overlap)
  e.stopPropagation(); nudge.blur();
  scrollTo({ top: scrollY + innerHeight - 80, behavior: 'smooth' });
});

const toGrid = () => scrollTo({ top: grid.getBoundingClientRect().top + scrollY, behavior: 'smooth' });
$('#btn-down').onclick = toGrid;
$('header.cover').addEventListener('click', (e) => { if (!(e.target instanceof Element && e.target.closest('a'))) toGrid(); });   // click/tap anywhere on the cover scrolls to the grid (links excepted)

// Rebuild the grid only when its actual width changes (iOS toolbars only change the height).
// ResizeObserver in addition to 'resize': iOS sometimes fires resize before the new width is applied; the observer fires with the real size.
let resizeT, lastW = 0;
function onSize() {
  const w = grid.clientWidth;
  if (w && w !== lastW) { lastW = w; layout(); }
  if (cur >= 0) fit(photos[cur]);
}
const queueSize = () => { clearTimeout(resizeT); resizeT = setTimeout(onSize, 120); };
addEventListener('resize', queueSize);
if ('ResizeObserver' in window) new ResizeObserver(queueSize).observe(grid);

// ───────────────────────────── 4 Viewer ─────────────────────────────
const CTRL = 72;                                                 // height of the control area at the top
const stagePad = () => { const cs = getComputedStyle(stage); return { l: parseFloat(cs.paddingLeft), r: parseFloat(cs.paddingRight), t: parseFloat(cs.paddingTop), b: parseFloat(cs.paddingBottom) }; };

// Display size from the known dimensions so preview and large photo are exactly the same size.
function fitSize(p) {
  const pad = stagePad(), aw = stage.clientWidth - pad.l - pad.r, ah = stage.clientHeight - pad.t - pad.b;
  const s = Math.min(aw / p.w, ah / p.h, 1);
  return { w: Math.round(p.w * s), h: Math.round(p.h * s) };
}
// Top edge: if the photo does not fill the height, center it in the area below the controls.
function topFor(h) {
  const pad = stagePad(), H = stage.clientHeight, free = H - CTRL - pad.b - h;
  return free > 0 ? CTRL + free / 2 : pad.t + (H - pad.t - pad.b - h) / 2;
}
function fit(p) {
  const sz = fitSize(p), top = topFor(sz.h), pad = stagePad();
  img.style.width = sz.w + 'px'; img.style.height = sz.h + 'px';
  img.style.alignSelf = 'start'; img.style.marginTop = (top - pad.t) + 'px';
}

const ANIM = ['zoom', 'slide-l', 'slide-r'];
let loadToken = 0;
// dir: 0 = open (zoom animation), 1 = next, -1 = previous, 2 = no animation (after a swipe)
function show(i, dir = 0) {
  cur = (i + N) % N; const p = photos[cur];
  resetZoom(false); fit(p); if (dir !== 2) ghost.style.display = 'none';
  img.src = U('thumb', p);                                       // immediately: the preview (already cached)
  img.classList.remove(...ANIM); void img.offsetWidth;
  const cls = dir === 1 ? 'slide-l' : dir === -1 ? 'slide-r' : dir === 0 ? 'zoom' : null; if (cls) img.classList.add(cls);
  const token = ++loadToken, big = new Image();                  // then: load the large photo, decode, swap silently
  big.onload = () => decoded(big).then(() => { if (token === loadToken) img.src = big.src; });
  big.src = U('full', p);
  counter.textContent = (cur + 1) + '/' + N;
  dl.href = U('full', p, 'dl=1'); dl.download = prefix + p.id + '.jpg';
  if (urls.hit) try { navigator.sendBeacon(U('hit', p)); } catch {}   // count the view (stats.php); no beacon in the static demo
  if (dir === 0) hintArrows(); scheduleHint(dir === 0 ? 6000 : 5000);
  if (!saveData) new Image().src = U('full', photos[(cur + 1) % N]);   // preload the next photo
  history.replaceState(null, '', '#' + p.id);
}

// Arrows: show briefly on open, as a reminder when lingering; always on mouse movement.
let hintT1, hintT2;
function hintArrows() { lb.classList.add('hint'); clearTimeout(hintT1); hintT1 = setTimeout(() => lb.classList.remove('hint'), 1600); }
function scheduleHint(ms) { clearTimeout(hintT2); hintT2 = setTimeout(() => { if (cur >= 0) { hintArrows(); scheduleHint(10000); } }, ms); }
lb.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse' && cur >= 0) hintArrows(); });
lb.addEventListener('pointerdown', (e) => { if (e.pointerType === 'mouse' && cur >= 0) hintArrows(); });   // repeated clicks on the arrow: keep it visible

let closeT, closedAt = 0;
function open(i) {
  clearTimeout(closeT); lb.classList.remove('closing'); lb.classList.add('open');
  document.body.style.overflow = 'hidden'; show(i);
}
function close() {
  ghost.style.display = 'none'; clearTimeout(hintT1); clearTimeout(hintT2); lb.classList.remove('hint');
  cur = -1; closedAt = Date.now(); history.replaceState(null, '', location.pathname + location.search);
  lb.classList.add('closing');                                   // fade out first (catches the follow-up click), then hide
  clearTimeout(closeT);
  closeT = setTimeout(() => { lb.classList.remove('open'); lb.classList.remove('closing'); document.body.style.overflow = ''; }, 200);
}
// Safety net: a click that lands in the grid right after closing is swallowed.
document.addEventListener('click', (e) => { if (Date.now() - closedAt < 400 && !lb.classList.contains('open')) { e.stopPropagation(); e.preventDefault(); } }, true);

$('#lb-close').onclick = close;
$('#lb-prev').onclick = (e) => { e.currentTarget.blur(); show(cur - 1, -1); };
$('#lb-next').onclick = (e) => { e.currentTarget.blur(); show(cur + 1, 1); };
addEventListener('keydown', (e) => {
  if (cur < 0) return;
  if (e.key === 'ArrowRight') show(cur + 1, 1);
  else if (e.key === 'ArrowLeft') show(cur - 1, -1);
  else if (e.key === 'Escape' || e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); close(); }
});

// ───────────────────────────── 5 Viewer gestures ─────────────────────────────
// Pinch zoom + pan; tap zones (left = previous, middle = zoom, right = next); swipe with the neighbour photo following;
// swipe up/down = close; mouse: click = original size. A pinch never triggers paging.
let S = 1, TX = 0, TY = 0;                                       // zoom factor and offset
let C = { x: 0, y: 0 }, W0 = 0, H0 = 0;                          // layout center and size of the photo without transform
const pts = new Map();                                           // active pointers
let g = null, pinch = null, lastTap = 0;

function apply(animate) {
  img.style.transition = animate ? `transform .25s ${EASE}` : 'none';
  img.style.transform = (S === 1 && !TX && !TY) ? '' : `translate(${TX}px,${TY}px) scale(${S})`;
  img.classList.toggle('zoomed', S > 1);
}
function clampT() {                                              // never beyond the edge; smaller than the screen = centered
  const w = W0 * S, h = H0 * S, vw = innerWidth, vh = innerHeight;
  TX = w <= vw ? 0 : Math.min(Math.max(TX, vw - C.x - w / 2), w / 2 - C.x);
  TY = h <= vh ? 0 : Math.min(Math.max(TY, vh - C.y - h / 2), h / 2 - C.y);
}
function base() {
  const r = img.getBoundingClientRect();
  W0 = r.width / S; H0 = r.height / S; C = { x: r.left + r.width / 2 - TX, y: r.top + r.height / 2 - TY };
}
const origScale = () => (cur >= 0 && W0) ? photos[cur].w / W0 : 1;   // factor up to 1 image pixel = 1 screen pixel
const maxScale = () => Math.max(4, origScale());
function zoomTo(s, fx, fy, animate) {                            // zoom around the point (fx, fy)
  s = Math.min(Math.max(s, 1), maxScale());
  TX = fx - C.x - (fx - C.x - TX) * (s / S); TY = fy - C.y - (fy - C.y - TY) * (s / S); S = s;
  clampT(); apply(animate);
}
function resetZoom(animate) { S = 1; TX = TY = 0; apply(animate); }

stage.addEventListener('pointerdown', (e) => {
  try { stage.setPointerCapture(e.pointerId); } catch {}
  pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  img.classList.remove(...ANIM); img.style.transition = 'none';
  if (pts.size === 1) {
    base();
    g = { x: e.clientX, y: e.clientY, tx: TX, ty: TY, t: Date.now(), moved: false, pinched: false, axis: null, ghostDir: 0, dragY: false, target: e.target };
    pinch = null;
  } else if (pts.size === 2) {
    const [a, b] = [...pts.values()];
    pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, s: S, tx: TX, ty: TY };
    g.pinched = true;
  }
});
stage.addEventListener('pointermove', (e) => {
  if (!pts.has(e.pointerId)) return;
  pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pts.size >= 2 && pinch) {
    const [a, b] = [...pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const s = Math.min(Math.max(pinch.s * d / pinch.d, 1), maxScale());
    TX = mx - C.x - (pinch.mx - C.x - pinch.tx) * (s / pinch.s); TY = my - C.y - (pinch.my - C.y - pinch.ty) * (s / pinch.s); S = s;
    clampT(); apply(false);
  } else if (pts.size === 1 && g) {
    const dx = e.clientX - g.x, dy = e.clientY - g.y, touch = e.pointerType !== 'mouse';
    if (!g.axis && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) { g.moved = true; g.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'; }
    if (S > 1) { TX = g.tx + dx; TY = g.ty + dy; clampT(); apply(false); }   // zoomed: pan
    else if (touch && g.axis === 'x') dragX(dx);                              // swipe with the neighbour photo
    else if (touch && g.axis === 'y') dragY(dy);                              // swipe away = close
  }
});
function end(e) {
  if (!pts.has(e.pointerId)) return;
  pts.delete(e.pointerId);
  if (pts.size === 1) { const [p] = pts.values(); g = { x: p.x, y: p.y, tx: TX, ty: TY, moved: true, pinched: true }; pinch = null; return; }
  if (pts.size > 0 || !g) return;
  pinch = null;
  if (S < 1.05) resetZoom(true);
  if (g.pinched || e.type === 'pointercancel') return;
  const dx = e.clientX - g.x, dy = e.clientY - g.y, dt = Math.max(Date.now() - g.t, 1);
  if (g.dragY) {                                                 // enough distance or momentum -> close, otherwise snap back
    finishDragY(Math.abs(dy) > 120 || (Math.abs(dy) / dt > .9 && Math.abs(dy) > 50) ? Math.sign(dy) : 0); return;
  }
  if (g.ghostDir) {                                              // enough distance or momentum -> page, otherwise snap back
    const commit = (Math.abs(dx) > Math.min(80, innerWidth * .2) || (Math.abs(dx) / dt > .5 && Math.abs(dx) > 20)) && Math.sign(dx) === -g.ghostDir;
    finishDragX(commit ? g.ghostDir : 0, g.ghostDir, dx); return;
  }
  if (S === 1 && Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) { show(cur + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1); return; }   // mouse swipe
  if (g.moved) return;
  if (g.target !== img) { close(); return; }                     // click/tap on whitespace = close
  if (e.pointerType === 'mouse') {                               // desktop: click = original size, again = back
    if (S > 1) resetZoom(true); else if (origScale() > 1.05) zoomTo(origScale(), e.clientX, e.clientY, true);
    return;
  }
  const now = Date.now();                                        // touch tap
  if (now - lastTap < 300) return;                               // a quick second tap does not count twice
  lastTap = now;
  if (S > 1) { resetZoom(true); return; }
  const zone = e.clientX / innerWidth;                           // outer quarters page, the middle half zooms
  if (zone < .25) show(cur - 1, -1);
  else if (zone > .75) show(cur + 1, 1);
  else zoomTo(2.5, e.clientX, e.clientY, true);
}
stage.addEventListener('pointerup', end); stage.addEventListener('pointercancel', end);

// Horizontal swipe: the photo follows the finger, the neighbour comes along on the matching side.
function dragX(dx) {
  const dir = dx < 0 ? 1 : -1;
  if (g.ghostDir !== dir) {
    const n = photos[(cur + dir + N) % N], sz = fitSize(n);
    ghost.src = U('thumb', n); ghost.style.width = sz.w + 'px'; ghost.style.height = sz.h + 'px';
    ghost.style.left = (C.x - sz.w / 2) + 'px'; ghost.style.top = topFor(sz.h) + 'px';
    ghost.style.display = 'block'; g.ghostDir = dir;
  }
  img.style.transition = ghost.style.transition = 'none';
  img.style.transform = `translateX(${dx}px)`;
  ghost.style.transform = `translateX(${dir * (innerWidth + 24) + dx}px)`;
}
function finishDragX(dir, ghostDir, dx) {
  const W = innerWidth + 24, rest = dir ? W - Math.abs(dx) : Math.abs(dx);
  const dur = Math.max(.22, Math.min(.5, rest / 1100));          // 0.22 to 0.5 s depending on the remaining distance
  img.style.transition = ghost.style.transition = `transform ${dur}s ${EASE}`;
  if (dir) { img.style.transform = `translateX(${-dir * W}px)`; ghost.style.transform = 'translateX(0)'; }
  else { img.style.transform = 'translateX(0)'; ghost.style.transform = `translateX(${ghostDir * W}px)`; }
  setTimeout(() => {
    ghost.style.transition = 'none';
    if (dir) {
      show(cur + dir, 2);
      const hide = () => { ghost.style.display = 'none'; };      // remove the neighbour only once the main image is decoded
      decoded(img).then(hide); setTimeout(hide, 150);
    } else { ghost.style.display = 'none'; img.style.transition = 'none'; img.style.transform = ''; }
  }, dur * 1000 + 20);
}
// Vertical swipe: the photo follows, shrinks and fades; close or snap back.
function dragY(dy) {
  g.dragY = true; img.style.transition = 'none';
  const k = Math.min(Math.abs(dy) / 600, 1);
  img.style.transform = `translateY(${dy}px) scale(${1 - k * .12})`; img.style.opacity = String(1 - k * .6);
}
function finishDragY(dir) {
  img.style.transition = `transform .3s ${EASE}, opacity .3s ${EASE}`;
  const reset = () => { img.style.transition = 'none'; img.style.transform = ''; img.style.opacity = ''; };
  if (dir) { img.style.transform = `translateY(${dir * innerHeight * .6}px) scale(.8)`; img.style.opacity = '0'; setTimeout(() => { close(); reset(); }, 300); }
  else { img.style.transform = 'translateY(0) scale(1)'; img.style.opacity = '1'; setTimeout(reset, 320); }
}

// ───────────────────────────── 6 Block page zoom ─────────────────────────────
// Photos have their own zoom in the viewer. Chrome/Android: touch-action (CSS). iOS Safari: gesturestart.
// Deliberately no non-passive touchmove listener, it would slow down all scrolling on older devices.
document.addEventListener('gesturestart', (e) => e.preventDefault(), { passive: false });

// ───────────────────────────── 7 Start ─────────────────────────────
lastW = grid.clientWidth; layout(); checkCover(); armNudge();
if (window.__reload) { history.replaceState(null, '', location.pathname + location.search); scrollTo(0, 0); }   // reload: top, no photo open
else { const start = photos.findIndex((p) => p.id === location.hash.slice(1)); if (start >= 0) open(start); }   // shared link #NNN
