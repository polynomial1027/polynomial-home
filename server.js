const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { WebSocketServer } = require('ws');
const { load, save, hashPassword, verifyPassword } = require('./lib/store');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';
// 开发目录使用 public/；发布压缩包把网页放在根目录，方便直接找到 index.html。
const nestedPublicDir = path.join(__dirname, 'public');
const publicDir = fs.existsSync(path.join(nestedPublicDir, 'index.html')) ? nestedPublicDir : __dirname;
const state = load();
const loginAttempts = new Map();

const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml' };
const json = (res, status, data) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
const cookies = req => Object.fromEntries((req.headers.cookie || '').split(';').filter(Boolean).map(v => v.trim().split('=').map(decodeURIComponent)));
const currentUser = req => {
  const token = cookies(req).session;
  const session = state.sessions.find(s => s.token === token && new Date(s.expiresAt) > new Date());
  return session ? state.users.find(u => u.id === session.userId && u.active) : null;
};
const publicUser = u => ({ id: u.id, username: u.username, displayName: u.displayName, role: u.role, active: u.active, createdAt: u.createdAt });
const body = req => new Promise((resolve, reject) => {
  let raw = '';
  req.on('data', chunk => { raw += chunk; if (raw.length > 20_000) reject(new Error('请求过大')); });
  req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error('JSON 格式错误')); } });
});
const requireUser = (req, res, role) => {
  const user = currentUser(req);
  if (!user) { json(res, 401, { error: '请先登录' }); return null; }
  if (role && user.role !== role) { json(res, 403, { error: '权限不足' }); return null; }
  return user;
};

async function api(req, res, url) {
  if (url.pathname === '/api/login' && req.method === 'POST') {
    const ip = req.socket.remoteAddress;
    const recent = (loginAttempts.get(ip) || []).filter(t => Date.now() - t < 10 * 60_000);
    if (recent.length >= 10) return json(res, 429, { error: '尝试次数过多，请稍后再试' });
    const data = await body(req);
    const user = state.users.find(u => u.username.toLowerCase() === String(data.username || '').trim().toLowerCase() && u.active);
    if (!user || !verifyPassword(String(data.password || ''), user.passwordHash)) {
      recent.push(Date.now()); loginAttempts.set(ip, recent);
      return json(res, 401, { error: '账号或密码错误' });
    }
    const token = crypto.randomBytes(32).toString('hex');
    state.sessions = state.sessions.filter(s => new Date(s.expiresAt) > new Date());
    state.sessions.push({ token, userId: user.id, expiresAt: new Date(Date.now() + 7 * 86400_000).toISOString() });
    save(state);
    res.setHeader('Set-Cookie', `session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800${process.env.COOKIE_SECURE === 'true' ? '; Secure' : ''}`);
    return json(res, 200, { user: publicUser(user) });
  }
  if (url.pathname === '/api/logout' && req.method === 'POST') {
    const token = cookies(req).session;
    state.sessions = state.sessions.filter(s => s.token !== token); save(state);
    res.setHeader('Set-Cookie', 'session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
    return json(res, 200, { ok: true });
  }
  if (url.pathname === '/api/me' && req.method === 'GET') {
    const user = currentUser(req); return json(res, 200, { user: user ? publicUser(user) : null });
  }
  if (url.pathname === '/api/messages' && req.method === 'GET') {
    if (!requireUser(req, res)) return; return json(res, 200, { messages: state.messages.slice(-100) });
  }
  if (url.pathname === '/api/admin/messages' && req.method === 'GET') {
    if (!requireUser(req, res, 'admin')) return;
    return json(res, 200, { messages: state.messages.slice().reverse().slice(0, 500) });
  }
  const messageMatch = url.pathname.match(/^\/api\/messages\/([^/]+)$/);
  if (messageMatch && req.method === 'DELETE') {
    const user = requireUser(req, res); if (!user) return;
    const index = state.messages.findIndex(message => message.id === messageMatch[1]);
    if (index < 0) return json(res, 404, { error: '消息不存在或已经删除' });
    const target = state.messages[index];
    if (target.userId !== user.id && user.role !== 'admin') return json(res, 403, { error: '只能删除自己发送的消息' });
    state.messages.splice(index, 1); save(state);
    broadcast({ type: 'delete', messageId: target.id });
    return json(res, 200, { ok: true, messageId: target.id });
  }
  if (url.pathname === '/api/users' && req.method === 'GET') {
    if (!requireUser(req, res, 'admin')) return; return json(res, 200, { users: state.users.map(publicUser) });
  }
  if (url.pathname === '/api/users' && req.method === 'POST') {
    if (!requireUser(req, res, 'admin')) return;
    const data = await body(req); const username = String(data.username || '').trim(); const password = String(data.password || '');
    if (!/^[a-zA-Z0-9_-]{3,24}$/.test(username)) return json(res, 400, { error: '账号需为 3–24 位字母、数字、_ 或 -' });
    if (password.length < 10) return json(res, 400, { error: '密码至少 10 位' });
    if (state.users.some(u => u.username.toLowerCase() === username.toLowerCase())) return json(res, 409, { error: '账号已存在' });
    const user = { id: crypto.randomUUID(), username, displayName: String(data.displayName || username).trim().slice(0, 30), role: data.role === 'admin' ? 'admin' : 'member', active: true, passwordHash: hashPassword(password), createdAt: new Date().toISOString() };
    state.users.push(user); save(state); return json(res, 201, { user: publicUser(user) });
  }
  const match = url.pathname.match(/^\/api\/users\/([^/]+)$/);
  if (match && req.method === 'PATCH') {
    const admin = requireUser(req, res, 'admin'); if (!admin) return;
    const target = state.users.find(u => u.id === match[1]); if (!target) return json(res, 404, { error: '用户不存在' });
    const data = await body(req);
    if (target.id === admin.id && data.active === false) return json(res, 400, { error: '不能停用当前账号' });
    if (typeof data.active === 'boolean') target.active = data.active;
    if (data.role === 'admin' || data.role === 'member') target.role = data.role;
    if (data.password) { if (String(data.password).length < 10) return json(res, 400, { error: '密码至少 10 位' }); target.passwordHash = hashPassword(String(data.password)); }
    save(state); return json(res, 200, { user: publicUser(target) });
  }
  return json(res, 404, { error: '接口不存在' });
}

function staticFile(req, res, url) {
  const clean = url.pathname === '/' ? '/index.html' : url.pathname;
  const isPublicPath = /^\/(?:index|projects|games|login|chat|admin)\.html$/.test(clean) || clean.startsWith('/assets/') || clean.startsWith('/games/');
  if (!isPublicPath) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('404 Not Found'); }
  const target = path.resolve(publicDir, `.${clean}`);
  if (!target.startsWith(publicDir)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.stat(target, (err, stat) => {
    let file = target;
    if (!err && stat.isDirectory()) file = path.join(target, 'index.html');
    fs.readFile(file, (readErr, data) => {
      if (readErr) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('404 Not Found'); }
      res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'strict-origin-when-cross-origin' }); res.end(data);
    });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try { if (url.pathname.startsWith('/api/')) await api(req, res, url); else staticFile(req, res, url); }
  catch (error) { console.error(error); if (!res.headersSent) json(res, 400, { error: error.message || '请求失败' }); }
});

const wss = new WebSocketServer({ noServer: true });
const broadcast = data => {
  const payload = JSON.stringify(data);
  wss.clients.forEach(client => { if (client.readyState === 1) client.send(payload); });
};
server.on('upgrade', (req, socket, head) => {
  if (new URL(req.url, 'http://localhost').pathname !== '/chat-socket' || !currentUser(req)) return socket.destroy();
  wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
});
wss.on('connection', (ws, req) => {
  const user = currentUser(req); ws.send(JSON.stringify({ type: 'ready', user: publicUser(user) }));
  ws.on('message', raw => {
    try {
      const data = JSON.parse(raw); const text = String(data.text || '').trim().slice(0, 1000);
      if (!text) return;
      const replyTarget = data.replyToId ? state.messages.find(message => message.id === data.replyToId) : null;
      const replyTo = replyTarget ? { id: replyTarget.id, displayName: replyTarget.displayName, text: replyTarget.text.slice(0, 160) } : null;
      const message = { id: crypto.randomUUID(), userId: user.id, username: user.username, displayName: user.displayName, text, replyTo, createdAt: new Date().toISOString() };
      state.messages.push(message); state.messages = state.messages.slice(-1000); save(state);
      broadcast({ type: 'message', message });
    } catch {}
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Polynomial Server: http://${HOST}:${PORT}`);
  if ((process.env.ADMIN_PASSWORD || 'change-me-now') === 'change-me-now') console.warn('警告：请在首次部署前设置 ADMIN_PASSWORD。');
});
