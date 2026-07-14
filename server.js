const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { WebSocketServer } = require('ws');
const Busboy = require('busboy');
const { load, save, hashPassword, verifyPassword } = require('./lib/store');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';
// 开发目录使用 public/；发布压缩包把网页放在根目录，方便直接找到 index.html。
const nestedPublicDir = path.join(__dirname, 'public');
const publicDir = fs.existsSync(path.join(nestedPublicDir, 'index.html')) ? nestedPublicDir : __dirname;
const state = load();
const loginAttempts = new Map();
const uploadDir = path.join(__dirname, 'data', 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });

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
const conversationFor = (id, user) => {
  if (id === 'lobby') return { id: 'lobby', title: '开发者大厅', type: 'lobby', memberIds: state.users.filter(u => u.active).map(u => u.id) };
  const conversation = state.conversations.find(item => item.id === id);
  if (!conversation) return null;
  return user.role === 'admin' || conversation.memberIds.includes(user.id) ? conversation : null;
};
const publicConversation = item => ({ id: item.id, title: item.title, type: item.type, createdBy: item.createdBy, memberIds: item.memberIds, createdAt: item.createdAt });
const safeFileName = name => path.basename(String(name || 'file')).replace(/[\r\n"]/g, '_').slice(0, 180);
const removeStoredFile = file => { try { fs.unlinkSync(path.join(uploadDir, file.storedName)); } catch {} };
const readUpload = (req, user, conversation) => new Promise((resolve, reject) => {
  const limit = Math.max(1, Math.min(100, Number(state.settings.maxUploadMB) || 10)) * 1024 * 1024;
  const parser = Busboy({ headers: req.headers, limits: { files: 1, fileSize: limit, fields: 2 } });
  let result = null; let failure = null; let writePromise = Promise.resolve();
  parser.on('file', (_field, stream, info) => {
    const id = crypto.randomUUID(); const storedName = id;
    const destination = path.join(uploadDir, storedName); const output = fs.createWriteStream(destination, { mode: 0o600 });
    let size = 0; stream.on('data', chunk => { size += chunk.length; });
    stream.on('limit', () => { failure = new Error(`文件超过 ${state.settings.maxUploadMB} MB 限制`); });
    stream.pipe(output);
    writePromise = new Promise((done, fail) => { output.on('close', done); output.on('error', fail); });
    result = { id, storedName, originalName: safeFileName(info.filename), mimeType: String(info.mimeType || 'application/octet-stream').slice(0, 100), size, uploadedBy: user.id, conversationId: conversation.id, createdAt: new Date().toISOString() };
    stream.on('end', () => { if (result) result.size = size; });
  });
  parser.on('error', reject);
  parser.on('finish', async () => { try { await writePromise; if (failure) { if (result) removeStoredFile(result); return reject(failure); } if (!result) return reject(new Error('没有收到文件')); resolve(result); } catch (error) { reject(error); } });
  req.pipe(parser);
});

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
    const user = requireUser(req, res); if (!user) return;
    const conversationId = url.searchParams.get('conversationId') || 'lobby';
    if (!conversationFor(conversationId, user)) return json(res, 403, { error: '无权访问该聊天' });
    return json(res, 200, { messages: state.messages.filter(message => message.conversationId === conversationId).slice(-Math.max(20, Number(state.settings.messageHistoryLimit) || 200)) });
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
    broadcast({ type: 'delete', messageId: target.id }, target.conversationId);
    return json(res, 200, { ok: true, messageId: target.id });
  }
  if (messageMatch && req.method === 'PATCH') {
    const user = requireUser(req, res); if (!user) return;
    const target = state.messages.find(message => message.id === messageMatch[1]);
    if (!target) return json(res, 404, { error: '消息不存在或已经删除' });
    if (target.userId !== user.id) return json(res, 403, { error: '只能编辑自己发送的消息' });
    const minutes = Number(state.settings.editWindowMinutes) || 0;
    if (minutes > 0 && Date.now() - new Date(target.createdAt).getTime() > minutes * 60_000) return json(res, 403, { error: `消息只能在 ${minutes} 分钟内编辑` });
    const data = await body(req); const text = String(data.text || '').trim().slice(0, Number(state.settings.maxMessageLength) || 1000);
    if (!text) return json(res, 400, { error: '消息不能为空' });
    target.text = text; target.editedAt = new Date().toISOString(); save(state);
    broadcast({ type: 'edit', message: target }, target.conversationId); return json(res, 200, { message: target });
  }
  if (url.pathname === '/api/conversations' && req.method === 'GET') {
    const user = requireUser(req, res); if (!user) return;
    const visible = state.conversations.filter(item => user.role === 'admin' || item.memberIds.includes(user.id)).map(publicConversation);
    return json(res, 200, { conversations: [{ id: 'lobby', title: '开发者大厅', type: 'lobby', memberIds: [] }, ...visible], users: state.users.filter(item => item.active).map(publicUser) });
  }
  if (url.pathname === '/api/conversations' && req.method === 'POST') {
    const user = requireUser(req, res); if (!user) return; const data = await body(req);
    if (state.conversations.filter(item => item.createdBy === user.id).length >= Number(state.settings.maxConversationsPerUser)) return json(res, 400, { error: `每位用户最多创建 ${state.settings.maxConversationsPerUser} 个聊天` });
    const memberIds = [...new Set([user.id, ...(Array.isArray(data.memberIds) ? data.memberIds : [])])].filter(id => state.users.some(item => item.id === id && item.active));
    if (memberIds.length < 2) return json(res, 400, { error: '至少选择一位聊天成员' });
    if (memberIds.length > Number(state.settings.maxGroupMembers)) return json(res, 400, { error: `聊天组最多 ${state.settings.maxGroupMembers} 人` });
    const type = data.type === 'direct' && memberIds.length === 2 ? 'direct' : 'group';
    if (type === 'direct') { const existing = state.conversations.find(item => item.type === 'direct' && item.memberIds.length === 2 && memberIds.every(id => item.memberIds.includes(id))); if (existing) return json(res, 200, { conversation: publicConversation(existing) }); }
    const title = type === 'direct' ? memberIds.map(id => state.users.find(item => item.id === id)?.displayName).filter(Boolean).join(' 与 ') : String(data.title || '').trim().slice(0, 40);
    if (!title) return json(res, 400, { error: '请输入聊天组名称' });
    const conversation = { id: crypto.randomUUID(), title, type, createdBy: user.id, memberIds, createdAt: new Date().toISOString() };
    state.conversations.push(conversation); save(state); broadcast({ type: 'conversation-created' }); return json(res, 201, { conversation: publicConversation(conversation) });
  }
  const conversationMatch = url.pathname.match(/^\/api\/conversations\/([^/]+)$/);
  if (conversationMatch && req.method === 'DELETE') {
    const user = requireUser(req, res); if (!user) return;
    if (conversationMatch[1] === 'lobby') return json(res, 400, { error: '大厅不能删除' });
    const index = state.conversations.findIndex(item => item.id === conversationMatch[1]); if (index < 0) return json(res, 404, { error: '聊天组不存在' });
    const conversation = state.conversations[index]; if (user.role !== 'admin' && conversation.createdBy !== user.id) return json(res, 403, { error: '只有创建者或管理员可以删除聊天组' });
    state.conversations.splice(index, 1); const removedMessages = state.messages.filter(message => message.conversationId === conversation.id); state.messages = state.messages.filter(message => message.conversationId !== conversation.id);
    state.files.filter(file => file.conversationId === conversation.id).forEach(removeStoredFile); state.files = state.files.filter(file => file.conversationId !== conversation.id); save(state); broadcast({ type: 'conversation-deleted', conversationId: conversation.id, removedMessages: removedMessages.length }); return json(res, 200, { ok: true });
  }
  if (url.pathname === '/api/upload' && req.method === 'POST') {
    const user = requireUser(req, res); if (!user) return; if (!state.settings.allowFileUploads) return json(res, 403, { error: '管理员已关闭文件上传' }); const conversationId = url.searchParams.get('conversationId') || 'lobby'; const conversation = conversationFor(conversationId, user); if (!conversation) return json(res, 403, { error: '无权向该聊天上传文件' });
    const file = await readUpload(req, user, conversation); state.files.push(file); save(state); return json(res, 201, { file: { id: file.id, originalName: file.originalName, mimeType: file.mimeType, size: file.size } });
  }
  const fileMatch = url.pathname.match(/^\/api\/files\/([^/]+)$/);
  if (fileMatch && req.method === 'GET') {
    const user = requireUser(req, res); if (!user) return; const file = state.files.find(item => item.id === fileMatch[1]); if (!file || !conversationFor(file.conversationId, user)) return json(res, 404, { error: '文件不存在' });
    const target = path.join(uploadDir, file.storedName); if (!fs.existsSync(target)) return json(res, 404, { error: '文件不存在' });
    const inline = /^(image\/(?:png|jpeg|gif|webp))$/.test(file.mimeType); res.writeHead(200, { 'Content-Type': inline ? file.mimeType : 'application/octet-stream', 'Content-Length': file.size, 'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(file.originalName)}`, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, max-age=3600' }); return fs.createReadStream(target).pipe(res);
  }
  if (url.pathname === '/api/settings' && req.method === 'GET') { if (!requireUser(req, res, 'admin')) return; return json(res, 200, { settings: state.settings }); }
  if (url.pathname === '/api/chat-config' && req.method === 'GET') { if (!requireUser(req, res)) return; const { maxUploadMB, maxMessageLength, maxAttachmentsPerMessage, allowFileUploads } = state.settings; return json(res, 200, { settings: { maxUploadMB, maxMessageLength, maxAttachmentsPerMessage, allowFileUploads } }); }
  if (url.pathname === '/api/settings' && req.method === 'PATCH') { if (!requireUser(req, res, 'admin')) return; const data = await body(req); const settings = { maxUploadMB: Number(data.maxUploadMB), editWindowMinutes: Number(data.editWindowMinutes), maxGroupMembers: Number(data.maxGroupMembers), maxMessageLength: Number(data.maxMessageLength), maxAttachmentsPerMessage: Number(data.maxAttachmentsPerMessage), messageHistoryLimit: Number(data.messageHistoryLimit), maxConversationsPerUser: Number(data.maxConversationsPerUser), allowFileUploads: Boolean(data.allowFileUploads) }; const ranges = { maxUploadMB:[1,100,'上传上限'],editWindowMinutes:[0,10080,'编辑时限'],maxGroupMembers:[2,100,'聊天组人数'],maxMessageLength:[100,5000,'消息字数'],maxAttachmentsPerMessage:[1,10,'附件数量'],messageHistoryLimit:[20,1000,'历史消息数量'],maxConversationsPerUser:[1,200,'聊天数量'] }; for (const [key,[min,max,label]] of Object.entries(ranges)) if (!Number.isInteger(settings[key]) || settings[key] < min || settings[key] > max) return json(res, 400, { error: `${label}必须为 ${min}–${max}` }); state.settings = settings; save(state); return json(res, 200, { settings }); }
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
    const username = data.username === undefined ? target.username : String(data.username).trim(); const displayName = data.displayName === undefined ? target.displayName : String(data.displayName).trim().slice(0, 30);
    if (!/^[a-zA-Z0-9_-]{3,24}$/.test(username)) return json(res, 400, { error: '账号需为 3–24 位字母、数字、_ 或 -' });
    if (!displayName) return json(res, 400, { error: '显示名称不能为空' });
    if (state.users.some(user => user.id !== target.id && user.username.toLowerCase() === username.toLowerCase())) return json(res, 409, { error: '账号已存在' });
    const removingAdmin = target.role === 'admin' && (data.role === 'member' || data.active === false); const activeAdmins = state.users.filter(user => user.role === 'admin' && user.active);
    if (target.id === admin.id && (data.active === false || data.role === 'member')) return json(res, 400, { error: '不能停用或降级当前管理员账号' });
    if (removingAdmin && activeAdmins.length <= 1) return json(res, 400, { error: '必须保留至少一个启用的管理员' });
    target.username = username; target.displayName = displayName;
    if (typeof data.active === 'boolean') target.active = data.active;
    if (data.role === 'admin' || data.role === 'member') target.role = data.role;
    if (data.password) { if (String(data.password).length < 10) return json(res, 400, { error: '密码至少 10 位' }); target.passwordHash = hashPassword(String(data.password)); state.sessions = state.sessions.filter(session => session.userId !== target.id); wss.clients.forEach(client => { if (client.user?.id === target.id) client.close(4003, 'password changed'); }); }
    if (!target.active) { state.sessions = state.sessions.filter(session => session.userId !== target.id); wss.clients.forEach(client => { if (client.user?.id === target.id) client.close(4002, 'account disabled'); }); }
    save(state); return json(res, 200, { user: publicUser(target) });
  }
  if (match && req.method === 'DELETE') {
    const admin = requireUser(req, res, 'admin'); if (!admin) return; const index = state.users.findIndex(user => user.id === match[1]); if (index < 0) return json(res, 404, { error: '用户不存在' }); const target = state.users[index];
    if (target.id === admin.id) return json(res, 400, { error: '不能删除当前登录的管理员账号' });
    if (target.role === 'admin' && target.active && state.users.filter(user => user.role === 'admin' && user.active).length <= 1) return json(res, 400, { error: '必须保留至少一个启用的管理员' });
    state.users.splice(index, 1); state.sessions = state.sessions.filter(session => session.userId !== target.id); state.conversations.forEach(item => { item.memberIds = item.memberIds.filter(id => id !== target.id); if (item.createdBy === target.id) item.createdBy = null; }); state.conversations = state.conversations.filter(item => item.memberIds.length >= 2); save(state); wss.clients.forEach(client => { if (client.user?.id === target.id) client.close(4001, 'account deleted'); }); broadcast({ type: 'conversation-created' }); return json(res, 200, { ok: true });
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
const broadcast = (data, conversationId = null) => {
  const payload = JSON.stringify(data);
  wss.clients.forEach(client => { if (client.readyState === 1 && (!conversationId || conversationFor(conversationId, client.user))) client.send(payload); });
};
server.on('upgrade', (req, socket, head) => {
  if (new URL(req.url, 'http://localhost').pathname !== '/chat-socket' || !currentUser(req)) return socket.destroy();
  wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
});
wss.on('connection', (ws, req) => {
  const user = currentUser(req); ws.user = user; ws.send(JSON.stringify({ type: 'ready', user: publicUser(user) }));
  ws.on('message', raw => {
    try {
      const data = JSON.parse(raw); const text = String(data.text || '').trim().slice(0, Number(state.settings.maxMessageLength) || 1000); const conversationId = String(data.conversationId || 'lobby');
      if (!conversationFor(conversationId, user)) return;
      const attachmentIds = Array.isArray(data.attachmentIds) ? data.attachmentIds.slice(0, Number(state.settings.maxAttachmentsPerMessage) || 5) : [];
      const attachments = attachmentIds.map(id => state.files.find(file => file.id === id && file.uploadedBy === user.id && file.conversationId === conversationId)).filter(Boolean).map(file => ({ id: file.id, originalName: file.originalName, mimeType: file.mimeType, size: file.size }));
      if (!text && !attachments.length) return;
      const replyTarget = data.replyToId ? state.messages.find(message => message.id === data.replyToId && message.conversationId === conversationId) : null;
      const replyTo = replyTarget ? { id: replyTarget.id, displayName: replyTarget.displayName, text: replyTarget.text.slice(0, 160) } : null;
      const message = { id: crypto.randomUUID(), conversationId, userId: user.id, username: user.username, displayName: user.displayName, text, attachments, replyTo, createdAt: new Date().toISOString() };
      state.messages.push(message); state.messages = state.messages.slice(-1000); save(state);
      broadcast({ type: 'message', message }, conversationId);
    } catch {}
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Polynomial Server: http://${HOST}:${PORT}`);
  if ((process.env.ADMIN_PASSWORD || 'change-me-now') === 'change-me-now') console.warn('警告：请在首次部署前设置 ADMIN_PASSWORD。');
});
