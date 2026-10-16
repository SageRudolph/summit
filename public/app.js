// Flag Summit — front end
(() => {
'use strict';

const COLORS = ['#d7263d','#f46036','#f6c90e','#2e933c','#1b998b','#2e86de','#3d2c8d','#e84393','#111418','#ffffff'];
const W = 8, H = 5;
let GOAL = 9;
// Camp positions on the 800x460 mountain, base (0) to summit (9)
const CAMPS = [[150,420],[330,395],[210,355],[400,325],[280,285],[450,250],[345,212],[500,170],[420,118],[470,48]];
const CAMP_NAMES = ['Base Camp','Camp 1','Camp 2','Camp 3','Camp 4','Camp 5','Camp 6','Camp 7','Camp 8','Summit'];

const $ = id => document.getElementById(id);
const state = { teams: [], loaded: false };
let brush = COLORS[0];
let grid = pattern('stripes', COLORS[5]);
let editingId = null;
let hostKey = '';
let isHost = false;
let prevWins = new Map();
let drag = null;

try { hostKey = localStorage.getItem('flagSummitHost') || ''; } catch (e) {}

// ---------------- helpers ----------------
async function api(method, url, body, asHost) {
  const headers = { 'Content-Type': 'application/json' };
  if (asHost) headers['x-host-key'] = hostKey;
  const r = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Something went wrong. Try again.');
  return j;
}
let toastTimer;
function toast(text) {
  const t = $('toast'); t.textContent = text; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
}
const cssVar = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
function contrast(c) { return ['#ffffff','#f6c90e'].includes(c) ? '#111418' : '#ffffff'; }

function pattern(kind, a) {
  const b = contrast(a);
  return Array.from({ length: W * H }, (_, i) => {
    const x = i % W, y = Math.floor(i / W);
    switch (kind) {
      case 'fill': return a;
      case 'stripes': return y % 2 ? b : a;
      case 'tricolor': return x < 3 ? a : x < 5 ? b : (a === '#111418' ? '#d7263d' : '#111418');
      case 'cross': return (x === 2 || y === 2) ? b : a;
      case 'diagonal': return (x - y * 1.6) < 1 && (x - y * 1.6) > -2.2 ? b : a;
      case 'check': return (x + y) % 2 ? b : a;
      default: return a;
    }
  });
}

// ---------------- host ----------------
async function checkHost() {
  if (!hostKey) { isHost = false; return; }
  try { await api('POST', '/api/host/check', null, true); isHost = true; }
  catch (e) { isHost = false; hostKey = ''; try { localStorage.removeItem('flagSummitHost'); } catch (_) {} }
}
function applyHostUI() {
  $('hostBtn').textContent = isHost ? 'Log out' : 'Host login';
  $('hostBanner').hidden = !isHost;
  $('mountainWrap').classList.toggle('host', isHost);
}
$('hostBtn').onclick = () => {
  if (isHost) {
    isHost = false; hostKey = '';
    try { localStorage.removeItem('flagSummitHost'); } catch (e) {}
    applyHostUI(); render(); toast('Logged out of host mode');
    return;
  }
  $('hostForm').hidden = false; $('hostKey').focus();
};
$('hostCancel').onclick = () => { $('hostForm').hidden = true; $('hostKey').value = ''; };
$('hostForm').onsubmit = async e => {
  e.preventDefault();
  hostKey = $('hostKey').value;
  await checkHost();
  if (isHost) {
    try { localStorage.setItem('flagSummitHost', hostKey); } catch (_) {}
    $('hostForm').hidden = true; $('hostKey').value = '';
    toast('Host mode on. Drag flags to move them.');
  } else {
    toast('That password didn\'t match. Try again.');
    $('hostKey').select();
  }
  applyHostUI(); render();
};
let resetArmed = false;
$('resetBtn').onclick = async () => {
  if (!resetArmed) {
    resetArmed = true; $('resetBtn').textContent = 'Tap again to reset everyone';
    $('resetBtn').classList.add('danger');
    setTimeout(() => { resetArmed = false; $('resetBtn').textContent = 'Reset all to base'; $('resetBtn').classList.remove('danger'); }, 4000);
    return;
  }
  resetArmed = false; $('resetBtn').textContent = 'Reset all to base'; $('resetBtn').classList.remove('danger');
  try { await api('POST', '/api/reset', null, true); toast('Every flag is back at base camp'); }
  catch (e) { toast(e.message); }
};
async function setWins(team, wins) {
  wins = Math.max(0, Math.min(GOAL, wins));
  if (wins === team.wins) return;
  team.wins = wins; render(); // optimistic
  try { await api('POST', `/api/teams/${team.id}/wins`, { wins }, true); }
  catch (e) { toast(e.message); }
}

// ---------------- painter ----------------
const canvas = $('canvas');
for (let i = 0; i < W * H; i++) { const s = document.createElement('span'); s.dataset.i = i; canvas.appendChild(s); }
function drawCanvas() { grid.forEach((c, i) => { canvas.children[i].style.background = c; }); }
let painting = false;
function paintAt(x, y) {
  const el = document.elementFromPoint(x, y);
  if (el && el.parentNode === canvas) { grid[+el.dataset.i] = brush; el.style.background = brush; }
}
canvas.addEventListener('pointerdown', e => { painting = true; canvas.setPointerCapture(e.pointerId); paintAt(e.clientX, e.clientY); });
canvas.addEventListener('pointermove', e => { if (painting) paintAt(e.clientX, e.clientY); });
window.addEventListener('pointerup', () => { painting = false; });

COLORS.forEach(c => {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'swatch'; b.style.background = c;
  b.setAttribute('aria-label', 'Paint color ' + c);
  b.setAttribute('aria-pressed', String(c === brush));
  b.onclick = () => { brush = c; [...$('palette').children].forEach(x => x.setAttribute('aria-pressed', String(x === b))); };
  $('palette').appendChild(b);
});
document.querySelectorAll('[data-preset]').forEach(b => {
  b.onclick = () => { grid = pattern(b.dataset.preset, brush); drawCanvas(); };
});

function resetEditor() {
  editingId = null; $('teamName').value = '';
  grid = pattern('stripes', COLORS[5]); drawCanvas();
  $('painterTitle').textContent = 'Plant your flag';
  $('saveBtn').textContent = 'Plant flag at base camp';
  $('cancelBtn').hidden = true;
}
function startEdit(t) {
  editingId = t.id; $('teamName').value = t.name;
  grid = [...t.grid]; drawCanvas();
  $('painterTitle').textContent = 'Repaint ' + t.name;
  $('saveBtn').textContent = 'Save new flag';
  $('cancelBtn').hidden = false; $('msg').textContent = '';
  $('teamName').scrollIntoView({ behavior: 'smooth', block: 'center' });
}
$('cancelBtn').onclick = resetEditor;
$('saveBtn').onclick = async () => {
  const name = $('teamName').value.trim();
  if (!name) { $('msg').textContent = 'Give your team a name first.'; $('teamName').focus(); return; }
  $('saveBtn').disabled = true;
  try {
    if (editingId) { await api('PUT', '/api/teams/' + editingId, { name, grid }); toast('Flag repainted'); }
    else { await api('POST', '/api/teams', { name, grid }); toast(name + ' planted a flag at base camp'); }
    $('msg').textContent = '';
    resetEditor();
  } catch (e) { $('msg').textContent = e.message; }
  finally { $('saveBtn').disabled = false; }
};

// ---------------- mountain ----------------
const NS = 'http://www.w3.org/2000/svg';
const svg = $('mtn');
function el(tag, attrs, parent) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}
function trailPath() {
  // Catmull-Rom curve that passes through every camp
  const P = CAMPS;
  let d = `M${P[0][0]},${P[0][1]}`;
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[i - 1] || P[i], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0]},${p2[1]}`;
  }
  return d;
}
let sceneLayer, flagLayer, targetLayer;
function drawScene() {
  svg.textContent = '';
  const v = cssVar;
  const defs = el('defs', {}, svg);
  const sky = el('linearGradient', { id: 'sky', x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
  el('stop', { offset: '0%', 'stop-color': v('--sky-top') }, sky);
  el('stop', { offset: '100%', 'stop-color': v('--sky-bot') }, sky);
  const rock = el('linearGradient', { id: 'rock', x1: 0, y1: 0, x2: 1, y2: 1 }, defs);
  el('stop', { offset: '0%', 'stop-color': v('--rock-2') }, rock);
  el('stop', { offset: '100%', 'stop-color': v('--rock') }, rock);

  sceneLayer = el('g', {}, svg);
  el('rect', { x: 0, y: 0, width: 800, height: 460, fill: 'url(#sky)' }, sceneLayer);
  el('circle', { cx: 680, cy: 92, r: 38, fill: v('--sun'), opacity: .9 }, sceneLayer);
  el('circle', { cx: 680, cy: 92, r: 58, fill: v('--sun'), opacity: .18 }, sceneLayer);
  // clouds
  [[60, 70, 1, ''], [300, 110, .8, 'slow'], [560, 160, .7, '']].forEach(([x, y, s, cls]) => {
    const g = el('g', { class: 'cloud ' + cls, style: `animation-delay:-${x / 15}s` }, sceneLayer);
    const c = el('g', { transform: `translate(${x - 300},${y}) scale(${s})`, fill: v('--snow'), opacity: .75 }, g);
    el('ellipse', { cx: 0, cy: 0, rx: 34, ry: 12 }, c);
    el('ellipse', { cx: 22, cy: -8, rx: 22, ry: 14 }, c);
    el('ellipse', { cx: -18, cy: -5, rx: 18, ry: 10 }, c);
  });
  // far ridges
  el('polygon', { points: '0,460 0,300 90,240 200,180 300,270 380,460', fill: v('--ridge') }, sceneLayer);
  el('polygon', { points: '540,460 640,230 700,150 770,240 800,260 800,460', fill: v('--ridge') }, sceneLayer);
  el('polygon', { points: '200,180 178,205 192,203 204,214 216,200', fill: v('--snow'), opacity: .85 }, sceneLayer);
  el('polygon', { points: '700,150 680,174 694,172 706,182 720,170', fill: v('--snow'), opacity: .85 }, sceneLayer);
  // main peak
  el('polygon', { points: '0,460 470,40 560,460', fill: 'url(#rock)' }, sceneLayer);
  el('polygon', { points: '470,40 800,460 560,460', fill: v('--rock-shade') }, sceneLayer);
  el('polygon', { points: '470,40 414,90 432,86 446,100 462,88 478,102 494,86 511,92', fill: v('--snow') }, sceneLayer);
  // rock texture lines
  [[380,160,330,230],[560,200,600,280],[260,300,220,360],[620,330,660,400]].forEach(([a,b,c,d]) =>
    el('line', { x1: a, y1: b, x2: c, y2: d, stroke: v('--rock-shade'), 'stroke-width': 2, opacity: .5, 'stroke-linecap': 'round' }, sceneLayer));
  // pines along the foot
  for (let i = 0; i < 26; i++) {
    const x = 10 + i * 31 + (i % 3) * 6, h = 22 + (i * 7) % 16, y = 462;
    el('polygon', { points: `${x},${y - h} ${x - 9},${y} ${x + 9},${y}`, fill: v('--pine') }, sceneLayer);
  }
  // trail
  el('path', { d: trailPath(), fill: 'none', stroke: v('--snow'), 'stroke-width': 7, opacity: .35, 'stroke-linecap': 'round' }, sceneLayer);
  el('path', { d: trailPath(), fill: 'none', stroke: v('--trail'), 'stroke-width': 3, 'stroke-dasharray': '2 8', 'stroke-linecap': 'round' }, sceneLayer);
  // camps
  CAMPS.forEach(([x, y], i) => {
    const summit = i === GOAL;
    el('circle', { cx: x, cy: y, r: summit ? 8 : 5.5, fill: v('--camp'), stroke: v('--trail'), 'stroke-width': 2.5 }, sceneLayer);
    const right = x >= 330 || i === 0;
    const tx = summit ? x + 16 : right ? x + 12 : x - 12;
    const label = el('text', {
      x: tx, y: y + 4, 'font-family': 'JetBrains Mono, monospace', 'font-size': 12, 'font-weight': 700,
      fill: v('--ink'), 'text-anchor': summit || right ? 'start' : 'end',
      stroke: v('--surface'), 'stroke-width': 3, 'paint-order': 'stroke'
    }, sceneLayer);
    label.textContent = summit ? 'SUMMIT · 9' : i === 0 ? 'BASE' : String(i);
  });
  targetLayer = el('g', {}, svg);
  flagLayer = el('g', {}, svg);
}

function flagPositions() {
  const byCamp = new Map();
  [...state.teams].sort((a, b) => a.createdAt - b.createdAt).forEach(t => {
    if (!byCamp.has(t.wins)) byCamp.set(t.wins, []);
    byCamp.get(t.wins).push(t);
  });
  const pos = new Map();
  byCamp.forEach((list, w) => list.forEach((t, k) => {
    const [x, y] = CAMPS[w];
    const dx = k === 0 ? 0 : (k % 2 ? -1 : 1) * Math.ceil(k / 2) * 30;
    pos.set(t.id, [x + dx, y]);
  }));
  return pos;
}

const flagEls = new Map();
function place(g, x, y) { g.dataset.x = x; g.dataset.y = y; g.style.transform = `translate(${x}px,${y}px)`; }
function drawFlags() {
  const pos = flagPositions();
  const ink = cssVar('--ink');
  // remove gone teams
  for (const [id, g] of flagEls) if (!state.teams.find(t => t.id === id)) { g.remove(); flagEls.delete(id); }
  state.teams.forEach(t => {
    let g = flagEls.get(t.id);
    const sig = t.name + t.grid.join('');
    if (!g || g.dataset.sig !== sig) {
      if (g) g.remove();
      g = el('g', {}, flagLayer);
      g.dataset.sig = sig; g.dataset.id = t.id;
      const [ix, iy] = pos.get(t.id); place(g, ix, iy);
      requestAnimationFrame(() => requestAnimationFrame(() => g.classList.add('flag-move')));
      const inner = el('g', { class: 'flag', tabindex: 0, role: 'img', 'aria-label': '' }, g);
      el('rect', { class: 'halo', x: -8, y: -42, width: 46, height: 46, fill: 'transparent', rx: 6 }, inner);
      el('ellipse', { cx: 0, cy: 0, rx: 6, ry: 2, fill: '#000', opacity: .18 }, inner);
      el('line', { x1: 0, y1: 0, x2: 0, y2: -38, stroke: ink, 'stroke-width': 2, 'stroke-linecap': 'round' }, inner);
      el('circle', { cx: 0, cy: -39, r: 2, fill: cssVar('--gold') }, inner);
      const cloth = el('g', { class: 'cloth', style: `animation-delay:-${(t.createdAt % 2600) / 1000}s` }, inner);
      t.grid.forEach((c, i) => el('rect', { x: 1 + (i % W) * 4, y: -37 + Math.floor(i / W) * 4, width: 4.3, height: 4.3, fill: c }, cloth));
      el('rect', { x: 1, y: -37, width: 32, height: 20, fill: 'none', stroke: ink, 'stroke-width': .8 }, cloth);
      const tag = el('g', { class: 'tag' }, inner);
      const label = el('text', {
        x: 0, y: 16, 'text-anchor': 'middle', 'font-family': 'Figtree, sans-serif', 'font-size': 12, 'font-weight': 700,
        fill: cssVar('--ink'), stroke: cssVar('--surface'), 'stroke-width': 4, 'paint-order': 'stroke'
      }, tag);
      label.textContent = t.name;
      inner.addEventListener('pointerdown', e => startDrag(e, t.id, g));
      inner.addEventListener('keydown', e => {
        if (!isHost) return;
        const team = state.teams.find(x => x.id === t.id);
        if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { e.preventDefault(); setWins(team, team.wins + 1); }
        if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { e.preventDefault(); setWins(team, team.wins - 1); }
      });
      flagEls.set(t.id, g);
    }
    g.querySelector('.flag').setAttribute('aria-label', `${t.name}, ${CAMP_NAMES[t.wins]}, ${t.wins} of ${GOAL} wins`);
    if (!drag || drag.id !== t.id) {
      const [x, y] = pos.get(t.id);
      place(g, x, y);
    }
  });
  // highest flags drawn last so they sit on top
  [...state.teams].sort((a, b) => b.wins - a.wins).forEach(t => { const g = flagEls.get(t.id); if (g) flagLayer.appendChild(g); });
}

// ---------------- drag to move (host) ----------------
function svgPoint(e) {
  const p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY;
  return p.matrixTransform(svg.getScreenCTM().inverse());
}
function nearestCamp(x, y) {
  let best = 0, bd = Infinity;
  CAMPS.forEach(([cx, cy], i) => { const d = (cx - x) ** 2 + (cy - y) ** 2; if (d < bd) { bd = d; best = i; } });
  return best;
}
function startDrag(e, id, g) {
  if (!isHost) return;
  e.preventDefault();
  const p = svgPoint(e);
  drag = { id, g, offX: p.x - +g.dataset.x, offY: p.y - +g.dataset.y, camp: null, moved: false };
  g.classList.remove('flag-move');
  g.querySelector('.flag').classList.add('dragging');
  flagLayer.appendChild(g);
  svg.setPointerCapture(e.pointerId);
}
svg.addEventListener('pointermove', e => {
  if (!drag) return;
  const p = svgPoint(e);
  const x = Math.max(10, Math.min(790, p.x - drag.offX)), y = Math.max(40, Math.min(455, p.y - drag.offY));
  drag.moved = true;
  place(drag.g, x, y);
  const c = nearestCamp(x, y);
  if (c !== drag.camp) {
    drag.camp = c;
    targetLayer.textContent = '';
    const [cx, cy] = CAMPS[c];
    el('circle', { class: 'camp-target', cx, cy, r: 16, fill: cssVar('--accent'), opacity: .25 }, targetLayer);
    el('circle', { cx, cy, r: 16, fill: 'none', stroke: cssVar('--accent'), 'stroke-width': 2, 'stroke-dasharray': '4 3' }, targetLayer);
    const lbl = el('text', { x: cx, y: cy - 22, 'text-anchor': 'middle', 'font-family': 'JetBrains Mono, monospace', 'font-size': 12, 'font-weight': 700, fill: cssVar('--accent'), stroke: cssVar('--surface'), 'stroke-width': 3, 'paint-order': 'stroke' }, targetLayer);
    lbl.textContent = CAMP_NAMES[c];
  }
});
function endDrag() {
  if (!drag) return;
  const d = drag; drag = null;
  targetLayer.textContent = '';
  d.g.classList.add('flag-move');
  d.g.querySelector('.flag').classList.remove('dragging');
  const team = state.teams.find(t => t.id === d.id);
  if (team && d.moved && d.camp !== null && d.camp !== team.wins) {
    toast(`${team.name} moved to ${CAMP_NAMES[d.camp]}`);
    setWins(team, d.camp);
  } else drawFlags();
}
svg.addEventListener('pointerup', endDrag);
svg.addEventListener('pointercancel', endDrag);

// ---------------- confetti ----------------
function confetti() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const cv = $('confetti'), ctx = cv.getContext('2d');
  const r = cv.getBoundingClientRect(), dpr = devicePixelRatio || 1;
  cv.width = r.width * dpr; cv.height = r.height * dpr; ctx.scale(dpr, dpr);
  const sx = r.width * (470 / 800), sy = r.height * (48 / 460);
  const bits = Array.from({ length: 140 }, () => ({
    x: sx, y: sy, vx: (Math.random() - .5) * 9, vy: -Math.random() * 8 - 2,
    s: 4 + Math.random() * 5, c: COLORS[Math.floor(Math.random() * 8)], a: Math.random() * 6, va: (Math.random() - .5) * .3
  }));
  let frame = 0;
  (function tick() {
    ctx.clearRect(0, 0, r.width, r.height);
    bits.forEach(b => {
      b.vy += .22; b.vx *= .99; b.x += b.vx; b.y += b.vy; b.a += b.va;
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.a); ctx.fillStyle = b.c;
      ctx.fillRect(-b.s / 2, -b.s / 4, b.s, b.s / 2); ctx.restore();
    });
    if (++frame < 160) requestAnimationFrame(tick); else ctx.clearRect(0, 0, r.width, r.height);
  })();
}

// ---------------- standings ----------------
function btn(label, fn, cls, aria) {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'btn small ' + (cls || ''); b.textContent = label;
  if (aria) b.setAttribute('aria-label', aria);
  b.onclick = fn; return b;
}
function renderStandings() {
  const box = $('teams'); box.textContent = '';
  $('teamCount').textContent = state.teams.length ? `${state.teams.length} team${state.teams.length === 1 ? '' : 's'}` : '';
  if (!state.teams.length) {
    const li = document.createElement('li'); li.className = 'empty';
    li.innerHTML = '<b>No flags on the mountain yet</b>Name your team, paint a flag, and plant it to start climbing.';
    box.appendChild(li); return;
  }
  const sorted = [...state.teams].sort((a, b) => b.wins - a.wins || a.createdAt - b.createdAt);
  let rank = 0, lastWins = null;
  sorted.forEach((t, idx) => {
    if (t.wins !== lastWins) { rank = idx + 1; lastWins = t.wins; }
    const li = document.createElement('li');
    li.className = 'team' + (t.wins >= GOAL ? ' summit' : '');
    const rk = document.createElement('span'); rk.className = 'rank'; rk.textContent = rank;
    const mini = document.createElement('div'); mini.className = 'mini';
    t.grid.forEach(c => { const s = document.createElement('span'); s.style.background = c; mini.appendChild(s); });
    const info = document.createElement('div'); info.className = 'tinfo';
    const nm = document.createElement('div'); nm.className = 'tname'; nm.textContent = t.name;
    const camp = document.createElement('div'); camp.className = 'tcamp'; camp.textContent = CAMP_NAMES[t.wins];
    const bar = document.createElement('div'); bar.className = 'bar';
    const fill = document.createElement('i'); fill.style.width = (t.wins / GOAL * 100) + '%'; bar.appendChild(fill);
    info.append(nm, camp, bar);
    const side = document.createElement('div'); side.className = 'tside';
    if (t.wins >= GOAL) { const c = document.createElement('span'); c.className = 'crown'; c.textContent = 'Summit'; side.appendChild(c); }
    const ws = document.createElement('span'); ws.className = 'wins';
    ws.innerHTML = `${t.wins}<small>/${GOAL}</small>`; side.appendChild(ws);
    if (isHost) {
      const minus = btn('−', () => setWins(t, t.wins - 1), '', 'Remove a win from ' + t.name); minus.disabled = t.wins <= 0;
      const plus = btn('+1 win', () => setWins(t, t.wins + 1), 'primary', 'Award a win to ' + t.name); plus.disabled = t.wins >= GOAL;
      side.append(minus, plus);
    }
    side.appendChild(btn('Repaint', () => startEdit(t), 'ghost'));
    if (isHost) {
      const del = btn('Remove', async () => {
        if (!del.dataset.armed) {
          del.dataset.armed = '1'; del.textContent = 'Confirm'; del.classList.add('danger');
          setTimeout(() => { if (del.isConnected) { delete del.dataset.armed; del.textContent = 'Remove'; del.classList.remove('danger'); } }, 4000);
          return;
        }
        try { await api('DELETE', '/api/teams/' + t.id, null, true); toast(t.name + ' removed'); } catch (e) { toast(e.message); }
      }, 'ghost');
      side.appendChild(del);
    }
    li.append(rk, mini, info, side);
    box.appendChild(li);
  });
}
function renderScoreline() {
  const box = $('scoreline'); box.textContent = '';
  const leader = [...state.teams].sort((a, b) => b.wins - a.wins || a.createdAt - b.createdAt)[0];
  const summited = state.teams.filter(t => t.wins >= GOAL).length;
  [[state.teams.length, 'teams climbing'], [leader ? leader.wins : 0, leader ? 'top: ' + leader.name : 'top camp'], [summited, 'at the summit']].forEach(([n, l]) => {
    const d = document.createElement('div'); d.className = 'stat';
    const b = document.createElement('b'); b.textContent = n;
    const s = document.createElement('span'); s.textContent = l;
    d.append(b, s); box.appendChild(d);
  });
}
function render() { drawFlags(); renderStandings(); renderScoreline(); }

// ---------------- live data ----------------
function onState(s) {
  GOAL = s.goal || 9;
  const incoming = s.teams.map(t => ({ ...t, createdAt: t.createdAt || 0 }));
  if (state.loaded) {
    incoming.forEach(t => {
      const before = prevWins.get(t.id);
      if (before !== undefined && before < GOAL && t.wins >= GOAL) { confetti(); toast(`${t.name} reached the summit!`); }
    });
  }
  prevWins = new Map(incoming.map(t => [t.id, t.wins]));
  state.teams = incoming; state.loaded = true;
  render();
}
function setLive(mode) {
  $('live').className = 'live ' + (mode === 'on' ? 'on' : 'warn');
  $('liveText').textContent = mode === 'on' ? (isHost ? 'Live · host' : 'Live') : 'Reconnecting';
}
function connect() {
  const es = new EventSource('/api/events');
  es.onopen = () => setLive('on');
  es.onmessage = e => { setLive('on'); onState(JSON.parse(e.data)); };
  es.onerror = () => setLive('warn');
}

// redraw scenery when the system theme changes
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { flagEls.clear(); drawScene(); drawFlags(); });

drawCanvas();
drawScene();
render();
checkHost().then(() => { applyHostUI(); render(); connect(); });
})();
