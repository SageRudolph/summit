// Flag Summit — back end
// Plain Node.js, no dependencies. Run: HOST_KEY=yourpassword node server.js
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const HOST_KEY = process.env.HOST_KEY || 'changeme';
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data.json');
const PUBLIC_DIR = path.join(__dirname, 'public');
const W = 8, H = 5, GOAL = 9, MAX_TEAMS = 100;

if (HOST_KEY === 'changeme') console.warn('⚠  HOST_KEY not set — using "changeme". Set it before going live.');

// ---------- storage ----------
let state = { teams: [] };
try { state = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch { /* first run */ }
if (!Array.isArray(state.teams)) state.teams = [];

let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const tmp = DATA_FILE + '.tmp';
    fs.writeFile(tmp, JSON.stringify(state, null, 2), err => {
      if (err) return console.error('Save failed:', err);
      fs.rename(tmp, DATA_FILE, e => e && console.error('Save failed:', e));
    });
  }, 100);
}

// ---------- validation ----------
const okColor = c => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c);
function cleanTeam(body) {
  const name = String(body.name || '').trim().slice(0, 24);
  if (!name) return { error: 'Team name is required.' };
  if (!Array.isArray(body.grid) || body.grid.length !== W * H || !body.grid.every(okColor))
    return { error: `Flag must be ${W * H} hex colors.` };
  return { name, grid: body.grid.map(c => c.toLowerCase()) };
}
function isHost(req) {
  const given = Buffer.from(String(req.headers['x-host-key'] || ''));
  const real = Buffer.from(HOST_KEY);
  return given.length === real.length && crypto.timingSafeEqual(given, real);
}

// ---------- live updates (Server-Sent Events) ----------
const clients = new Set();
function publicState() { return { goal: GOAL, teams: state.teams }; }
function broadcast() {
  const msg = `data: ${JSON.stringify(publicState())}\n\n`;
  for (const res of clients) res.write(msg);
}
setInterval(() => { for (const res of clients) res.write(': ping\n\n'); }, 25000);

// ---------- helpers ----------
function send(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (data.length > 10_000) { reject(new Error('too large')); req.destroy(); }
    });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch { reject(new Error('bad json')); } });
  });
}
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
function serveStatic(req, res) {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  const file = path.normalize(path.join(PUBLIC_DIR, urlPath === '/' ? 'index.html' : urlPath));
  if (!file.startsWith(PUBLIC_DIR)) return send(res, 403, { error: 'Forbidden' });
  fs.readFile(file, (err, buf) => {
    if (err) return send(res, 404, { error: 'Not found' });
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(buf);
  });
}

// ---------- routes ----------
const server = http.createServer(async (req, res) => {
  const url = req.url.split('?')[0];
  const m = url.match(/^\/api\/teams\/([\w-]+)(\/wins)?$/);
  try {
    if (req.method === 'GET' && url === '/api/state') return send(res, 200, publicState());

    if (req.method === 'GET' && url === '/api/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      res.write(`data: ${JSON.stringify(publicState())}\n\n`);
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }

    if (req.method === 'POST' && url === '/api/host/check')
      return isHost(req) ? send(res, 200, { ok: true }) : send(res, 401, { error: 'Wrong host password.' });

    // Host only: send every flag back to base camp
    if (req.method === 'POST' && url === '/api/reset') {
      if (!isHost(req)) return send(res, 401, { error: 'Only the host can reset the climb.' });
      state.teams.forEach(t => { t.wins = 0; }); save(); broadcast();
      return send(res, 200, { ok: true });
    }

    // Anyone: plant a new flag
    if (req.method === 'POST' && url === '/api/teams') {
      if (state.teams.length >= MAX_TEAMS) return send(res, 400, { error: 'The mountain is full.' });
      const t = cleanTeam(await readBody(req));
      if (t.error) return send(res, 400, t);
      const team = { id: crypto.randomUUID(), ...t, wins: 0, createdAt: Date.now() };
      state.teams.push(team); save(); broadcast();
      return send(res, 201, team);
    }

    if (m) {
      const team = state.teams.find(t => t.id === m[1]);
      if (!team) return send(res, 404, { error: 'Team not found.' });

      // Anyone: repaint a flag
      if (req.method === 'PUT' && !m[2]) {
        const t = cleanTeam(await readBody(req));
        if (t.error) return send(res, 400, t);
        Object.assign(team, t); save(); broadcast();
        return send(res, 200, team);
      }

      // Host only: change wins — {delta: 1 | -1} or {wins: 0..9} to move a flag straight to a camp
      if (req.method === 'POST' && m[2]) {
        if (!isHost(req)) return send(res, 401, { error: 'Only the host can move flags.' });
        const { delta, wins } = await readBody(req);
        if (Number.isInteger(wins) && wins >= 0 && wins <= GOAL) team.wins = wins;
        else if (delta === 1 || delta === -1) team.wins = Math.max(0, Math.min(GOAL, team.wins + delta));
        else return send(res, 400, { error: 'Send delta (1 or -1) or wins (0-9).' });
        save(); broadcast();
        return send(res, 200, team);
      }

      // Host only: remove a team
      if (req.method === 'DELETE' && !m[2]) {
        if (!isHost(req)) return send(res, 401, { error: 'Only the host can remove teams.' });
        state.teams = state.teams.filter(t => t.id !== team.id); save(); broadcast();
        return send(res, 200, { ok: true });
      }
    }

    if (req.method === 'GET' && !url.startsWith('/api/')) return serveStatic(req, res);
    send(res, 404, { error: 'Not found' });
  } catch (e) {
    send(res, 400, { error: 'Bad request.' });
  }
});

server.listen(PORT, () => console.log(`Flag Summit running at http://localhost:${PORT}`));
