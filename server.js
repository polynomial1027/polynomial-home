const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const net = require('node:net');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { WebSocketServer } = require('ws');
const Busboy = require('busboy');
const httpProxy = require('http-proxy');
const { load, save, hashPassword, verifyPassword, defaultPermissions, normalizeUser } = require('./lib/store');
const { publicCourse, getAssignment, makeEvaluation, makeVisibleEvaluation } = require('./lib/python-course');

const execFileAsync = promisify(execFile);

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';
// 开发目录使用 public/；发布压缩包把网页放在根目录，方便直接找到 index.html。
const nestedPublicDir = path.join(__dirname, 'public');
const publicDir = fs.existsSync(path.join(nestedPublicDir, 'index.html')) ? nestedPublicDir : __dirname;
const state = load();
const loginAttempts = new Map();
const notebookActivity = new Map();
const notebookSockets = new Map();
const learningRunsInFlight = new Set();
const learningLastRun = new Map();
const assignmentTestPasses = new Map();
const NOTEBOOK_CTL = '/usr/local/sbin/polynomial-notebookctl';
const uploadDir = path.join(__dirname, 'data', 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });
const driveDir = path.join(__dirname, 'data', 'drive');
fs.mkdirSync(driveDir, { recursive: true });
const lexiconDir = path.join(__dirname, 'third_party', 'Sensitive-lexicon', 'Vocabulary');
function loadDefaultLexicon() {
  if (!fs.existsSync(lexiconDir)) return { root: new Map(), count: 0 };
  const words = new Set();
  for (const name of fs.readdirSync(lexiconDir)) {
    if (!name.endsWith('.txt')) continue;
    for (const line of fs.readFileSync(path.join(lexiconDir, name), 'utf8').split(/\r?\n/)) { const word = line.trim().toLowerCase(); if (word) words.add(word); }
  }
  const root = new Map();
  for (const word of words) { let node = root; for (const char of Array.from(word)) { if (!node.has(char)) node.set(char, new Map()); node = node.get(char); } node.terminal = true; }
  return { root, count: words.size };
}
const defaultLexicon = loadDefaultLexicon();

const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml' };
const json = (res, status, data) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
const cookies = req => Object.fromEntries((req.headers.cookie || '').split(';').filter(Boolean).map(v => v.trim().split('=').map(decodeURIComponent)));
const currentUser = req => {
  const token = cookies(req).session;
  const session = state.sessions.find(s => s.token === token && new Date(s.expiresAt) > new Date());
  return session ? state.users.find(u => u.id === session.userId && u.active) : null;
};
const publicUser = u => ({ id: u.id, username: u.username, displayName: u.displayName, role: u.role, active: u.active, permissions: u.permissions, driveQuotaMB: u.driveQuotaMB, createdAt: u.createdAt });
const allowed = (user, permission) => user?.role === 'admin' || user?.permissions?.[permission] === true;
const denyUnless = (res, user, permission, message = '此账号未开放该功能') => { if (allowed(user, permission)) return true; json(res, 403, { error: message }); return false; };

const notebookConfig = () => ({
  maxConcurrent: Number(state.settings.notebookMaxConcurrent) || 2,
  memoryMB: Number(state.settings.notebookMemoryMB) || 512,
  cpuMilli: Number(state.settings.notebookCpuMilli) || 1000,
  storageMB: Number(state.settings.notebookStorageMB) || 1024,
  quotaEnabled: state.settings.notebookQuotaEnabled !== false,
  idleMinutes: Number(state.settings.notebookIdleMinutes) || 30
});

async function notebookCtl(action, userId, ...args) {
  try {
    const { stdout } = await execFileAsync('/usr/bin/sudo', ['-n', NOTEBOOK_CTL, action, userId, ...args.map(String)], { timeout: 90_000, maxBuffer: 256 * 1024 });
    const line = stdout.trim().split(/\r?\n/).filter(Boolean).at(-1);
    const result = JSON.parse(line || '{}');
    if (result.ip && net.isIP(result.ip) !== 4) throw new Error('Notebook 返回了无效地址');
    return result;
  } catch (error) {
    const detail = String(error.stderr || error.message || '').trim().split(/\r?\n/).at(-1);
    throw new Error(detail?.replace(/^ERROR:\s*/, '') || 'Notebook 服务暂时不可用');
  }
}

async function startNotebook(user) {
  const config = notebookConfig();
  const result = await notebookCtl('start', user.id, config.memoryMB, config.cpuMilli, config.storageMB, config.maxConcurrent, config.quotaEnabled ? 1 : 0);
  notebookActivity.set(user.id, Date.now());
  return { running: result.running, container: result.container, config };
}

async function stopNotebook(userId) {
  const result = await notebookCtl('stop', userId);
  notebookActivity.delete(userId);
  return result;
}

async function evaluateLearningCode(user, code, evaluation = null) {
  const source = String(code || '');
  if (!source.trim()) throw new Error('请输入要运行的 Python 代码');
  if (Buffer.byteLength(source, 'utf8') > 20_000) throw new Error('代码不能超过 20 KB');
  if (learningRunsInFlight.has(user.id)) throw new Error('当前账号已有代码正在运行');
  const now = Date.now(), last = learningLastRun.get(user.id) || 0;
  if (now - last < 800) throw new Error('运行过于频繁，请稍等片刻');
  learningLastRun.set(user.id, now);
  learningRunsInFlight.add(user.id);
  try {
    await startNotebook(user);
    const payload = Buffer.from(JSON.stringify({ mode: evaluation ? 'grade' : 'run', code: source, evaluation }), 'utf8').toString('base64');
    const result = await notebookCtl('evaluate', user.id, 8, payload);
    notebookActivity.set(user.id, Date.now());
    return {
      success: Boolean(result.success), passed: Number(result.passed || 0), total: Number(result.total || 0),
      failures: Array.isArray(result.failures) ? result.failures.slice(0, 3) : [], error: result.error ? String(result.error).slice(0, 500) : null,
      caseResults: Array.isArray(result.caseResults) ? result.caseResults.slice(0, 3).map(item => ({ test: Number(item.test || 0), actualRepr: String(item.actualRepr || '').slice(0, 500) })) : [],
      output: String(result.output || '').slice(0, 6000), runtimeMs: Math.max(0, Number(result.runtimeMs || 0)), memoryKB: Math.max(0, Number(result.memoryKB || 0))
    };
  } finally {
    learningRunsInFlight.delete(user.id);
  }
}

const submissionView = (submission, viewer, includeCode = false) => {
  const owner = state.users.find(user => user.id === submission.userId);
  return {
    id: submission.id, assignmentId: submission.assignmentId, success: submission.success, passed: submission.passed, total: submission.total,
    runtimeMs: submission.runtimeMs, memoryKB: submission.memoryKB, visibility: submission.visibility, submittedAt: submission.submittedAt,
    displayName: owner?.displayName || '已删除用户', username: owner?.username || 'deleted', own: viewer.id === submission.userId,
    ...(includeCode ? { code: submission.code, error: submission.error || null } : {})
  };
};

const notebookProxy = httpProxy.createProxyServer({ ws: true, xfwd: true, changeOrigin: true, proxyTimeout: 0, timeout: 0 });
notebookProxy.on('error', error => console.error('Notebook proxy error:', error.message));

function trackNotebookSocket(user, token, socket) {
  let sockets = notebookSockets.get(user.id);
  if (!sockets) { sockets = new Map(); notebookSockets.set(user.id, sockets); }
  sockets.set(socket, token);
  notebookActivity.set(user.id, Date.now());
  socket.on('data', () => notebookActivity.set(user.id, Date.now()));
  socket.on('close', () => { sockets.delete(socket); if (!sockets.size) notebookSockets.delete(user.id); });
}

function closeNotebookSockets(userId, token = null) {
  const sockets = notebookSockets.get(userId);
  if (!sockets) return;
  for (const [socket, socketToken] of sockets) if (!token || token === socketToken) socket.destroy();
}
const body = req => new Promise((resolve, reject) => {
  let raw = ''; const maxBodyBytes = Math.max(64_000, (Number(state.settings.maxGameSaveKB) || 256) * 1024 + 2048);
  req.on('data', chunk => { raw += chunk; if (Buffer.byteLength(raw) > maxBodyBytes) reject(new Error('请求超过后台设置的存储上限')); });
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
const repairFileNameEncoding = name => {
  const value = String(name || 'file');
  if (!/[\u0080-\u00ff]/.test(value)) return value;
  const repaired = Buffer.from(value, 'latin1').toString('utf8');
  return repaired && !repaired.includes('\ufffd') ? repaired : value;
};
const safeFileName = name => path.basename(repairFileNameEncoding(name)).replace(/[\r\n"]/g, '_').slice(0, 180);
const removeStoredFile = file => { try { fs.unlinkSync(path.join(uploadDir, file.storedName)); } catch {} };
const removeDriveFile = file => { try { fs.unlinkSync(path.join(driveDir, file.storedName)); } catch {} };
const driveUsed = userId => state.driveFiles.filter(file => file.ownerId === userId && file.scope === 'private').reduce((sum, file) => sum + Number(file.size || 0), 0);
const canReadDriveFile = (user, file) => user.role === 'admin' || file.ownerId === user.id || (file.scope === 'public' && allowed(user, 'viewPublicDrive') && allowed(user, 'downloadPublicDrive')) || state.driveShares.some(share => share.fileId === file.id && share.recipientId === user.id);
const filterSensitiveText = text => {
  let value = String(text || '');
  if (state.settings.sensitiveWordSource === 'default' && defaultLexicon.count) {
    const original = Array.from(value), lower = Array.from(value.toLowerCase()), masked = new Array(original.length).fill(false); let found = false;
    for (let start = 0; start < lower.length; start++) { let node = defaultLexicon.root; for (let end = start; end < lower.length; end++) { node = node.get(lower[end]); if (!node) break; if (node.terminal) { found = true; if (state.settings.sensitiveWordMode === 'reject') return { error: '消息包含默认词库中的敏感词' }; for (let index = start; index <= end; index++) masked[index] = true; } } }
    return { text: found ? original.map((char, index) => masked[index] ? '*' : char).join('') : value };
  }
  const words = (state.settings.sensitiveWords || []).map(word => String(word).trim()).filter(Boolean);
  const found = words.find(word => value.toLowerCase().includes(word.toLowerCase()));
  if (!found) return { text: value };
  if (state.settings.sensitiveWordMode === 'reject') return { error: '消息包含管理员设置的敏感词' };
  for (const word of words) value = value.replace(new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '*'.repeat([...word].length));
  return { text: value };
};
const readUpload = (req, user, conversation) => new Promise((resolve, reject) => {
  const limit = Math.max(1, Number(state.settings.maxUploadMB) || 10) * 1024 * 1024;
  const parser = Busboy({ headers: req.headers, defParamCharset: 'utf8', limits: { files: 1, fileSize: limit, fields: 2 } });
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
const readDriveUpload = (req, user, scope) => new Promise((resolve, reject) => {
  const limit = Math.max(1, Number(state.settings.maxUploadMB) || 10) * 1024 * 1024;
  const parser = Busboy({ headers: req.headers, defParamCharset: 'utf8', limits: { files: 1, fileSize: limit } });
  let result = null, failure = null, writePromise = Promise.resolve();
  parser.on('file', (_field, stream, info) => {
    const id = crypto.randomUUID(), storedName = id, destination = path.join(driveDir, storedName), output = fs.createWriteStream(destination, { mode: 0o600 }); let size = 0;
    stream.on('data', chunk => { size += chunk.length; }); stream.on('limit', () => { failure = new Error(`文件超过 ${state.settings.maxUploadMB} MB 限制`); }); stream.pipe(output);
    writePromise = new Promise((done, fail) => { output.on('close', done); output.on('error', fail); });
    result = { id, storedName, originalName: safeFileName(info.filename), mimeType: String(info.mimeType || 'application/octet-stream').slice(0, 100), size, ownerId: user.id, scope, createdAt: new Date().toISOString() };
    stream.on('end', () => { if (result) result.size = size; });
  });
  parser.on('error', reject); parser.on('finish', async () => { try { await writePromise; if (failure) { if (result) removeDriveFile(result); return reject(failure); } if (!result) return reject(new Error('没有收到文件')); resolve(result); } catch (error) { reject(error); } }); req.pipe(parser);
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
    const session = state.sessions.find(item => item.token === token);
    state.sessions = state.sessions.filter(s => s.token !== token); save(state);
    if (session) closeNotebookSockets(session.userId, token);
    res.setHeader('Set-Cookie', 'session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
    return json(res, 200, { ok: true });
  }
  if (url.pathname === '/api/me' && req.method === 'GET') {
    const user = currentUser(req); return json(res, 200, { user: user ? publicUser(user) : null });
  }
  if (url.pathname === '/api/messages' && req.method === 'GET') {
    const user = requireUser(req, res); if (!user) return;
    if (!denyUnless(res, user, 'accessChat', '此账号不能进入聊天功能')) return;
    const conversationId = url.searchParams.get('conversationId') || 'lobby';
    if (!conversationFor(conversationId, user)) return json(res, 403, { error: '无权访问该聊天' });
    return json(res, 200, { messages: state.messages.filter(message => message.conversationId === conversationId).slice(-Math.max(20, Number(state.settings.messageHistoryLimit) || 200)) });
  }
  if (url.pathname === '/api/messages' && req.method === 'POST') {
    const user = requireUser(req, res); if (!user) return; const data = await body(req); const conversationId = String(data.conversationId || 'lobby');
    if (!denyUnless(res, user, 'accessChat', '此账号不能进入聊天功能')) return;
    if (conversationId === 'lobby' && !denyUnless(res, user, 'postLobby', '此账号只能查看大厅，不能发言')) return;
    if (!conversationFor(conversationId, user)) return json(res, 403, { error: '无权向该聊天发送消息' });
    const filteredText = filterSensitiveText(String(data.text || '').trim().slice(0, Number(state.settings.maxMessageLength) || 1000)); if (filteredText.error) return json(res, 400, { error: filteredText.error });
    const attachmentIds = Array.isArray(data.attachmentIds) ? data.attachmentIds.slice(0, Number(state.settings.maxAttachmentsPerMessage) || 5) : [];
    const attachments = attachmentIds.map(id => state.files.find(file => file.id === id && file.uploadedBy === user.id && file.conversationId === conversationId)).filter(Boolean).map(file => ({ id: file.id, originalName: file.originalName, mimeType: file.mimeType, size: file.size }));
    const driveAttachments = (Array.isArray(data.driveFileIds) ? data.driveFileIds : []).slice(0, Number(state.settings.maxAttachmentsPerMessage) || 5).map(id => state.driveFiles.find(file => file.id === id && canReadDriveFile(user, file))).filter(Boolean).map(file => ({ id: file.id, drive: true, originalName: file.originalName, mimeType: file.mimeType, size: file.size }));
    attachments.push(...driveAttachments.slice(0, Math.max(0, (Number(state.settings.maxAttachmentsPerMessage) || 5) - attachments.length)));
    if (!filteredText.text && !attachments.length) return json(res, 400, { error: '消息或附件不能为空' });
    const replyTarget = data.replyToId ? state.messages.find(message => message.id === data.replyToId && message.conversationId === conversationId) : null;
    const replyTo = replyTarget ? { id: replyTarget.id, displayName: replyTarget.displayName, text: replyTarget.text.slice(0, 160) } : null;
    const message = { id: crypto.randomUUID(), conversationId, userId: user.id, username: user.username, displayName: user.displayName, text: filteredText.text, attachments, replyTo, createdAt: new Date().toISOString() };
    state.messages.push(message); state.messages = state.messages.slice(-10000); save(state); broadcast({ type: 'message', message }, conversationId); return json(res, 201, { message });
  }
  if (url.pathname === '/api/admin/messages' && req.method === 'GET') {
    if (!requireUser(req, res, 'admin')) return;
    const page = Math.max(1, Number(url.searchParams.get('page')) || 1); const pageSize = 20; const query = String(url.searchParams.get('q') || '').trim().toLowerCase();
    const filtered = state.messages.filter(message => !query || `${message.displayName} ${message.username} ${message.text}`.toLowerCase().includes(query)).reverse();
    return json(res, 200, { messages: filtered.slice((page - 1) * pageSize, page * pageSize), page, total: filtered.length, pages: Math.max(1, Math.ceil(filtered.length / pageSize)) });
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
    const data = await body(req); const filteredText = filterSensitiveText(String(data.text || '').trim().slice(0, Number(state.settings.maxMessageLength) || 1000)); if (filteredText.error) return json(res, 400, { error: filteredText.error }); const text = filteredText.text;
    if (!text) return json(res, 400, { error: '消息不能为空' });
    target.text = text; target.editedAt = new Date().toISOString(); save(state);
    broadcast({ type: 'edit', message: target }, target.conversationId); return json(res, 200, { message: target });
  }
  if (url.pathname === '/api/conversations' && req.method === 'GET') {
    const user = requireUser(req, res); if (!user) return;
    if (!denyUnless(res, user, 'accessChat', '此账号不能进入聊天功能')) return;
    const visible = state.conversations.filter(item => user.role === 'admin' || item.memberIds.includes(user.id)).map(publicConversation);
    return json(res, 200, { conversations: [{ id: 'lobby', title: '开发者大厅', type: 'lobby', memberIds: [] }, ...visible], users: allowed(user, 'viewUsers') ? state.users.filter(item => item.active).map(publicUser) : [] });
  }
  if (url.pathname === '/api/conversations' && req.method === 'POST') {
    const user = requireUser(req, res); if (!user) return; const data = await body(req);
    if (state.conversations.filter(item => item.createdBy === user.id).length >= Number(state.settings.maxConversationsPerUser)) return json(res, 400, { error: `每位用户最多创建 ${state.settings.maxConversationsPerUser} 个聊天` });
    const memberIds = [...new Set([user.id, ...(Array.isArray(data.memberIds) ? data.memberIds : [])])].filter(id => state.users.some(item => item.id === id && item.active));
    if (memberIds.length < 2) return json(res, 400, { error: '至少选择一位聊天成员' });
    if (memberIds.length > Number(state.settings.maxGroupMembers)) return json(res, 400, { error: `聊天组最多 ${state.settings.maxGroupMembers} 人` });
    const type = data.type === 'direct' && memberIds.length === 2 ? 'direct' : 'group';
    if (type === 'direct' && !denyUnless(res, user, 'createDirect', '此账号不能创建私聊')) return;
    if (type === 'group' && !denyUnless(res, user, 'createGroups', '此账号不能创建聊天组')) return;
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
    if (!denyUnless(res, user, 'accessChat', '此账号不能使用聊天功能')) return;
    if (conversationId === 'lobby' && !denyUnless(res, user, 'postLobby', '此账号不能在大厅发言')) return;
    const file = await readUpload(req, user, conversation); state.files.push(file); save(state); return json(res, 201, { file: { id: file.id, originalName: file.originalName, mimeType: file.mimeType, size: file.size } });
  }
  const fileMatch = url.pathname.match(/^\/api\/files\/([^/]+)$/);
  if (fileMatch && req.method === 'GET') {
    const user = requireUser(req, res); if (!user) return; const file = state.files.find(item => item.id === fileMatch[1]); if (!file || !conversationFor(file.conversationId, user)) return json(res, 404, { error: '文件不存在' });
    const target = path.join(uploadDir, file.storedName); if (!fs.existsSync(target)) return json(res, 404, { error: '文件不存在' });
    const inline = /^(image\/(?:png|jpeg|gif|webp))$/.test(file.mimeType); res.writeHead(200, { 'Content-Type': inline ? file.mimeType : 'application/octet-stream', 'Content-Length': file.size, 'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(file.originalName)}`, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, max-age=3600' }); return fs.createReadStream(target).pipe(res);
  }
  if (url.pathname === '/api/drive' && req.method === 'GET') {
    const user = requireUser(req, res); if (!user) return; if (!denyUnless(res, user, 'driveEnabled', '此账号的网盘已关闭')) return;
    const privateFiles = state.driveFiles.filter(file => file.scope === 'private' && file.ownerId === user.id);
    const sharedFiles = state.driveShares.filter(share => share.recipientId === user.id).map(share => state.driveFiles.find(file => file.id === share.fileId)).filter(Boolean);
    const publicFiles = allowed(user, 'viewPublicDrive') ? state.driveFiles.filter(file => file.scope === 'public') : [];
    return json(res, 200, { privateFiles, sharedFiles, publicFiles, usedBytes: driveUsed(user.id), quotaBytes: Number(user.driveQuotaMB || 0) * 1024 * 1024, permissions: user.permissions });
  }
  if (url.pathname === '/api/drive/users' && req.method === 'GET') { const user = requireUser(req, res); if (!user) return; if (!denyUnless(res, user, 'driveEnabled')) return; return json(res, 200, { users: allowed(user, 'viewUsers') ? state.users.filter(item => item.active && item.id !== user.id).map(publicUser) : [] }); }
  if (url.pathname === '/api/drive/upload' && req.method === 'POST') {
    const user = requireUser(req, res); if (!user) return; if (!denyUnless(res, user, 'driveEnabled', '此账号的网盘已关闭')) return;
    const scope = url.searchParams.get('scope') === 'public' ? 'public' : 'private';
    if (scope === 'public' && !denyUnless(res, user, 'uploadPublicDrive', '此账号不能上传到公共共享盘')) return;
    const file = await readDriveUpload(req, user, scope);
    if (scope === 'private' && driveUsed(user.id) + file.size > Number(user.driveQuotaMB || 0) * 1024 * 1024) { removeDriveFile(file); return json(res, 400, { error: '私人网盘空间不足，请删除文件或联系管理员增加额度' }); }
    state.driveFiles.push(file); save(state); return json(res, 201, { file });
  }
  const driveContentMatch = url.pathname.match(/^\/api\/drive\/files\/([^/]+)\/content$/);
  if (driveContentMatch && req.method === 'GET') {
    const user = requireUser(req, res); if (!user) return; const file = state.driveFiles.find(item => item.id === driveContentMatch[1]);
    if (!file || !canReadDriveFile(user, file)) return json(res, 404, { error: '文件不存在或无权下载' }); const target = path.join(driveDir, file.storedName); if (!fs.existsSync(target)) return json(res, 404, { error: '文件内容不存在' });
    res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': file.size, 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(file.originalName)}`, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store' }); return fs.createReadStream(target).pipe(res);
  }
  const driveFileMatch = url.pathname.match(/^\/api\/drive\/files\/([^/]+)$/);
  if (driveFileMatch && req.method === 'DELETE') {
    const user = requireUser(req, res); if (!user) return; const index = state.driveFiles.findIndex(item => item.id === driveFileMatch[1]); if (index < 0) return json(res, 404, { error: '文件不存在' }); const file = state.driveFiles[index]; if (user.role !== 'admin' && file.ownerId !== user.id) return json(res, 403, { error: '只能删除自己的文件' }); state.driveFiles.splice(index, 1); state.driveShares = state.driveShares.filter(share => share.fileId !== file.id); removeDriveFile(file); save(state); return json(res, 200, { ok: true });
  }
  if (driveFileMatch && req.method === 'POST' && url.searchParams.get('action') === 'share') {
    const user = requireUser(req, res); if (!user) return; const file = state.driveFiles.find(item => item.id === driveFileMatch[1]); if (!file || (user.role !== 'admin' && file.ownerId !== user.id)) return json(res, 404, { error: '文件不存在' }); const data = await body(req); const recipient = state.users.find(item => item.id === data.recipientId && item.active); if (!recipient || recipient.id === file.ownerId) return json(res, 400, { error: '请选择其他有效用户' }); if (!state.driveShares.some(item => item.fileId === file.id && item.recipientId === recipient.id)) state.driveShares.push({ id: crypto.randomUUID(), fileId: file.id, recipientId: recipient.id, sharedBy: user.id, createdAt: new Date().toISOString() }); save(state); return json(res, 200, { ok: true });
  }
  if (url.pathname === '/api/admin/drive' && req.method === 'GET') { if (!requireUser(req, res, 'admin')) return; return json(res, 200, { files: state.driveFiles, shares: state.driveShares, users: state.users.map(publicUser) }); }
  if (url.pathname === '/api/learning/course' && req.method === 'GET') {
    const user = requireUser(req, res); if (!user) return;
    if (!denyUnless(res, user, 'accessLearning', '此账号不能访问网络学习')) return;
    return json(res, 200, { course: publicCourse(), canRun: allowed(user, 'accessNotebook'), config: notebookConfig() });
  }
  if (url.pathname === '/api/learning/progress' && req.method === 'GET') { const user = requireUser(req, res); if (!user) return; if (!denyUnless(res, user, 'accessLearning', '此账号不能访问网络学习')) return; const progress = state.learningProgress.find(item => item.userId === user.id && item.courseId === 'python-foundations-v1'); return json(res, 200, { progress: progress || null }); }
  if (url.pathname === '/api/learning/progress' && req.method === 'PUT') { const user = requireUser(req, res); if (!user) return; if (!denyUnless(res, user, 'accessLearning', '此账号不能访问网络学习')) return; const data = await body(req); let progress = state.learningProgress.find(item => item.userId === user.id && item.courseId === 'python-foundations-v1'); if (!progress) { progress = { id: crypto.randomUUID(), userId: user.id, courseId: 'python-foundations-v1' }; state.learningProgress.push(progress); } progress.completedLessons = Array.isArray(data.completedLessons) ? [...new Set(data.completedLessons.map(String))].slice(0, 100) : []; progress.notes = String(data.notes || '').slice(0, 20000); progress.lessonNotes = data.lessonNotes && typeof data.lessonNotes === 'object' && !Array.isArray(data.lessonNotes) ? Object.fromEntries(Object.entries(data.lessonNotes).slice(0, 100).map(([key, value]) => [String(key).slice(0, 80), String(value || '').slice(0, 5000)])) : (progress.lessonNotes || {}); progress.assignmentDrafts = data.assignmentDrafts && typeof data.assignmentDrafts === 'object' && !Array.isArray(data.assignmentDrafts) ? Object.fromEntries(Object.entries(data.assignmentDrafts).slice(0, 50).map(([key, value]) => [String(key).slice(0, 80), String(value || '').slice(0, 20000)])) : (progress.assignmentDrafts || {}); progress.updatedAt = new Date().toISOString(); save(state); return json(res, 200, { progress }); }
  if (url.pathname === '/api/learning/run' && req.method === 'POST') {
    const user = requireUser(req, res); if (!user) return;
    if (!denyUnless(res, user, 'accessLearning', '此账号不能访问网络学习') || !denyUnless(res, user, 'accessNotebook', '此账号没有课程代码运行权限')) return;
    const data = await body(req);
    return json(res, 200, { result: await evaluateLearningCode(user, data.code) });
  }
  const assignmentRecordsMatch = url.pathname.match(/^\/api\/learning\/assignments\/([a-z0-9-]+)\/records$/);
  if (assignmentRecordsMatch && req.method === 'GET') {
    const user = requireUser(req, res); if (!user) return;
    if (!denyUnless(res, user, 'accessLearning', '此账号不能访问网络学习')) return;
    const assignment = getAssignment(assignmentRecordsMatch[1]);
    if (!assignment) return json(res, 404, { error: '作业不存在' });
    const own = state.learningSubmissions.filter(item => item.assignmentId === assignment.id && item.userId === user.id).sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt)).slice(0, 10).map(item => submissionView(item, user, true));
    const shared = state.learningSubmissions.filter(item => item.assignmentId === assignment.id && item.userId !== user.id && item.visibility === 'public').sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt)).slice(0, 20).map(item => submissionView(item, user, true));
    return json(res, 200, { own, shared });
  }
  if (assignmentRecordsMatch && req.method === 'DELETE') {
    const user = requireUser(req, res); if (!user) return;
    if (!denyUnless(res, user, 'accessLearning', '此账号不能访问网络学习')) return;
    const assignment = getAssignment(assignmentRecordsMatch[1]);
    if (!assignment) return json(res, 404, { error: '作业不存在' });
    const before = state.learningSubmissions.length;
    state.learningSubmissions = state.learningSubmissions.filter(item => item.assignmentId !== assignment.id || item.userId !== user.id);
    assignmentTestPasses.delete(`${user.id}:${assignment.id}`);
    save(state);
    return json(res, 200, { removed: before - state.learningSubmissions.length });
  }
  const assignmentTestMatch = url.pathname.match(/^\/api\/learning\/assignments\/([a-z0-9-]+)\/test$/);
  if (assignmentTestMatch && req.method === 'POST') {
    const user = requireUser(req, res); if (!user) return;
    if (!denyUnless(res, user, 'accessLearning', '此账号不能访问网络学习') || !denyUnless(res, user, 'accessNotebook', '此账号没有课程作业运行权限')) return;
    const assignment = getAssignment(assignmentTestMatch[1]);
    if (!assignment) return json(res, 404, { error: '作业不存在' });
    const data = await body(req), code = String(data.code || ''), evaluation = makeVisibleEvaluation(assignment);
    const result = await evaluateLearningCode(user, code, evaluation);
    learningLastRun.delete(user.id);
    const key = `${user.id}:${assignment.id}`, hash = crypto.createHash('sha256').update(code).digest('hex');
    if (result.success) assignmentTestPasses.set(key, { hash, expiresAt: Date.now() + 15 * 60_000 }); else assignmentTestPasses.delete(key);
    return json(res, 200, { result, cases: evaluation.cases.map((item, index) => ({ number: index + 1, args: item.args, expected: item.expected })) });
  }
  const assignmentSubmitMatch = url.pathname.match(/^\/api\/learning\/assignments\/([a-z0-9-]+)\/submit$/);
  if (assignmentSubmitMatch && req.method === 'POST') {
    const user = requireUser(req, res); if (!user) return;
    if (!denyUnless(res, user, 'accessLearning', '此账号不能访问网络学习') || !denyUnless(res, user, 'accessNotebook', '此账号没有课程作业运行权限')) return;
    const assignment = getAssignment(assignmentSubmitMatch[1]);
    if (!assignment) return json(res, 404, { error: '作业不存在' });
    const data = await body(req), code = String(data.code || '');
    const testPass = assignmentTestPasses.get(`${user.id}:${assignment.id}`), codeHash = crypto.createHash('sha256').update(code).digest('hex');
    if (!testPass || testPass.hash !== codeHash || testPass.expiresAt < Date.now()) return json(res, 409, { error: '请先使用当前代码通过页面测试，再提交作业' });
    const result = await evaluateLearningCode(user, code, makeEvaluation(assignment));
    const submission = { id: crypto.randomUUID(), userId: user.id, assignmentId: assignment.id, code: code.slice(0, 20_000), success: result.success, passed: result.passed, total: result.total, runtimeMs: result.runtimeMs, memoryKB: result.memoryKB, error: result.error, visibility: data.visibility === 'public' ? 'public' : 'private', submittedAt: new Date().toISOString() };
    const previous = state.learningSubmissions.filter(item => item.userId === user.id && item.assignmentId === assignment.id).sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
    if (previous.length >= 20) { const removeIds = new Set(previous.slice(19).map(item => item.id)); state.learningSubmissions = state.learningSubmissions.filter(item => !removeIds.has(item.id)); }
    state.learningSubmissions.push(submission); save(state);
    return json(res, 200, { result, submission: submissionView(submission, user, true) });
  }
  const submissionVisibilityMatch = url.pathname.match(/^\/api\/learning\/submissions\/([0-9a-f-]+)\/visibility$/);
  if (submissionVisibilityMatch && req.method === 'PATCH') {
    const user = requireUser(req, res); if (!user) return;
    const submission = state.learningSubmissions.find(item => item.id === submissionVisibilityMatch[1] && item.userId === user.id);
    if (!submission) return json(res, 404, { error: '提交记录不存在' });
    const data = await body(req); submission.visibility = data.visibility === 'public' ? 'public' : 'private'; save(state);
    return json(res, 200, { submission: submissionView(submission, user, true) });
  }
  const publicSubmissionDeleteMatch = url.pathname.match(/^\/api\/learning\/submissions\/([0-9a-f-]+)$/);
  if (publicSubmissionDeleteMatch && req.method === 'DELETE') {
    const user = requireUser(req, res); if (!user) return;
    if (user.role !== 'admin') return json(res, 403, { error: '只有管理员可以删除其他用户的公开答案' });
    const submission = state.learningSubmissions.find(item => item.id === publicSubmissionDeleteMatch[1] && item.visibility === 'public');
    if (!submission) return json(res, 404, { error: '公开答案不存在或已经删除' });
    state.learningSubmissions = state.learningSubmissions.filter(item => item.id !== submission.id);
    save(state);
    return json(res, 200, { removed: true });
  }
  if (url.pathname === '/api/notebook/status' && req.method === 'GET') {
    const user = requireUser(req, res); if (!user) return;
    if (!denyUnless(res, user, 'accessNotebook', '此账号不能使用 Python 实验室')) return;
    const status = await notebookCtl('status', user.id);
    return json(res, 200, { running: Boolean(status.running), container: status.container || null, config: notebookConfig() });
  }
  if (url.pathname === '/api/notebook/start' && req.method === 'POST') {
    const user = requireUser(req, res); if (!user) return;
    if (!denyUnless(res, user, 'accessNotebook', '此账号不能使用 Python 实验室')) return;
    const result = await startNotebook(user);
    return json(res, 200, result);
  }
  if (url.pathname === '/api/notebook/stop' && req.method === 'POST') {
    const user = requireUser(req, res); if (!user) return;
    if (!denyUnless(res, user, 'accessNotebook', '此账号不能使用 Python 实验室')) return;
    closeNotebookSockets(user.id);
    return json(res, 200, await stopNotebook(user.id));
  }
  if (url.pathname === '/api/admin/notebooks' && req.method === 'GET') {
    if (!requireUser(req, res, 'admin')) return;
    const notebooks = await Promise.all(state.users.filter(user => user.active).map(async user => {
      try { const status = await notebookCtl('status', user.id); return { user: publicUser(user), running: Boolean(status.running), container: status.container || null }; }
      catch (error) { return { user: publicUser(user), running: false, error: error.message }; }
    }));
    return json(res, 200, { notebooks, config: notebookConfig() });
  }
  const adminNotebookMatch = url.pathname.match(/^\/api\/admin\/notebooks\/([^/]+)\/stop$/);
  if (adminNotebookMatch && req.method === 'POST') {
    if (!requireUser(req, res, 'admin')) return;
    const target = state.users.find(user => user.id === adminNotebookMatch[1]);
    if (!target) return json(res, 404, { error: '用户不存在' });
    closeNotebookSockets(target.id);
    return json(res, 200, await stopNotebook(target.id));
  }
  if (url.pathname === '/api/announcements' && req.method === 'GET') return json(res, 200, { announcements: state.announcements.slice().sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)) });
  if (url.pathname === '/api/announcements' && req.method === 'POST') { if (!requireUser(req, res, 'admin')) return; const data = await body(req); const title = String(data.title || '').trim(), content = String(data.content || '').trim(); if (!title || !content) return json(res, 400, { error: '标题和内容不能为空' }); const item = { id: crypto.randomUUID(), title: title.slice(0, 100), content: content.slice(0, 10000), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }; state.announcements.push(item); save(state); return json(res, 201, { announcement: item }); }
  const announcementMatch = url.pathname.match(/^\/api\/announcements\/([^/]+)$/);
  if (announcementMatch && req.method === 'PATCH') { if (!requireUser(req, res, 'admin')) return; const item = state.announcements.find(entry => entry.id === announcementMatch[1]); if (!item) return json(res, 404, { error: '公告不存在' }); const data = await body(req); const title = String(data.title || '').trim(), content = String(data.content || '').trim(); if (!title || !content) return json(res, 400, { error: '标题和内容不能为空' }); item.title = title.slice(0, 100); item.content = content.slice(0, 10000); item.updatedAt = new Date().toISOString(); save(state); return json(res, 200, { announcement: item }); }
  if (announcementMatch && req.method === 'DELETE') { if (!requireUser(req, res, 'admin')) return; const index = state.announcements.findIndex(entry => entry.id === announcementMatch[1]); if (index < 0) return json(res, 404, { error: '公告不存在' }); state.announcements.splice(index, 1); save(state); return json(res, 200, { ok: true }); }
  const gameSaveMatch = url.pathname.match(/^\/api\/games\/([a-zA-Z0-9_-]{1,60})\/save$/);
  if (gameSaveMatch && req.method === 'GET') { const user = requireUser(req, res); if (!user) return; if (!denyUnless(res, user, 'accessGames', '此账号不能使用小游戏')) return; const item = state.gameSaves.find(saveItem => saveItem.userId === user.id && saveItem.gameId === gameSaveMatch[1]); return json(res, 200, { save: item ? { data: item.data, updatedAt: item.updatedAt } : null }); }
  if (gameSaveMatch && req.method === 'PUT') { const user = requireUser(req, res); if (!user) return; if (!denyUnless(res, user, 'accessGames', '此账号不能使用小游戏')) return; const data = await body(req); const serialized = JSON.stringify(data.data); if (Buffer.byteLength(serialized) > Number(state.settings.maxGameSaveKB) * 1024) return json(res, 400, { error: `游戏存档超过 ${state.settings.maxGameSaveKB} KB 限制` }); let item = state.gameSaves.find(saveItem => saveItem.userId === user.id && saveItem.gameId === gameSaveMatch[1]); if (!item) { item = { id: crypto.randomUUID(), userId: user.id, gameId: gameSaveMatch[1], data: null, updatedAt: null }; state.gameSaves.push(item); } item.data = data.data; item.updatedAt = new Date().toISOString(); save(state); return json(res, 200, { save: { data: item.data, updatedAt: item.updatedAt } }); }
  if (url.pathname === '/api/settings' && req.method === 'GET') { if (!requireUser(req, res, 'admin')) return; return json(res, 200, { settings: state.settings }); }
  if (url.pathname === '/api/chat-config' && req.method === 'GET') { if (!requireUser(req, res)) return; const { maxUploadMB, maxMessageLength, maxAttachmentsPerMessage, allowFileUploads } = state.settings; return json(res, 200, { settings: { maxUploadMB, maxMessageLength, maxAttachmentsPerMessage, allowFileUploads } }); }
  if (url.pathname === '/api/settings' && req.method === 'PATCH') {
    if (!requireUser(req, res, 'admin')) return;
    const data = await body(req);
    const settings = {
      maxUploadMB: Number(data.maxUploadMB),
      editWindowMinutes: Number(data.editWindowMinutes),
      maxGroupMembers: Number(data.maxGroupMembers),
      maxMessageLength: Number(data.maxMessageLength),
      maxAttachmentsPerMessage: Number(data.maxAttachmentsPerMessage),
      messageHistoryLimit: Number(data.messageHistoryLimit),
      maxConversationsPerUser: Number(data.maxConversationsPerUser),
      maxGameSaveKB: Number(data.maxGameSaveKB),
      allowFileUploads: Boolean(data.allowFileUploads),
      sensitiveWordSource: data.sensitiveWordSource === 'default' ? 'default' : 'custom',
      sensitiveWords: String(data.sensitiveWords || '').split(/[\n,，]/).map(word => word.trim()).filter(Boolean),
      sensitiveWordMode: data.sensitiveWordMode === 'reject' ? 'reject' : 'mask',
      notebookMaxConcurrent: Number(data.notebookMaxConcurrent),
      notebookMemoryMB: Number(data.notebookMemoryMB),
      notebookCpuMilli: Number(data.notebookCpuMilli),
      notebookStorageMB: Number(data.notebookStorageMB),
      notebookQuotaEnabled: Boolean(data.notebookQuotaEnabled),
      notebookIdleMinutes: Number(data.notebookIdleMinutes)
    };
    const ranges = {
      maxUploadMB: [1, Number.MAX_SAFE_INTEGER, '上传上限'],
      editWindowMinutes: [0, Number.MAX_SAFE_INTEGER, '编辑时限'],
      maxGroupMembers: [2, Number.MAX_SAFE_INTEGER, '聊天组人数'],
      maxMessageLength: [1, Number.MAX_SAFE_INTEGER, '消息字数'],
      maxAttachmentsPerMessage: [1, Number.MAX_SAFE_INTEGER, '附件数量'],
      messageHistoryLimit: [1, Number.MAX_SAFE_INTEGER, '历史消息数量'],
      maxConversationsPerUser: [1, Number.MAX_SAFE_INTEGER, '聊天数量'],
      maxGameSaveKB: [1, Number.MAX_SAFE_INTEGER, '游戏存档大小'],
      notebookMaxConcurrent: [1, 3, 'Python 同时运行人数'],
      notebookMemoryMB: [256, 1024, 'Python 容器内存'],
      notebookCpuMilli: [250, 2000, 'Python 容器 CPU'],
      notebookStorageMB: [256, 4096, 'Python 存档额度'],
      notebookIdleMinutes: [10, 240, 'Python 闲置停止时间']
    };
    for (const [key, [min, max, label]] of Object.entries(ranges)) {
      if (!Number.isSafeInteger(settings[key]) || settings[key] < min || settings[key] > max) return json(res, 400, { error: `${label}必须是 ${min}–${max} 之间的整数` });
    }
    state.settings = settings;
    save(state);
    return json(res, 200, { settings });
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
    const user = normalizeUser({ id: crypto.randomUUID(), username, displayName: String(data.displayName || username).trim().slice(0, 30), role: data.role === 'admin' ? 'admin' : 'member', active: true, passwordHash: hashPassword(password), permissions: { ...defaultPermissions, ...(data.permissions || {}) }, driveQuotaMB: Number(data.driveQuotaMB) || 1024, createdAt: new Date().toISOString() });
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
    if (data.permissions && typeof data.permissions === 'object') target.permissions = { ...defaultPermissions, ...target.permissions, ...Object.fromEntries(Object.keys(defaultPermissions).map(key => [key, Boolean(data.permissions[key])])) };
    if (data.driveQuotaMB !== undefined) { const quota = Number(data.driveQuotaMB); if (!Number.isSafeInteger(quota) || quota < 0) return json(res, 400, { error: '网盘额度必须是不小于 0 的整数 MB' }); target.driveQuotaMB = quota; }
    if (data.password) { if (String(data.password).length < 10) return json(res, 400, { error: '密码至少 10 位' }); target.passwordHash = hashPassword(String(data.password)); state.sessions = state.sessions.filter(session => session.userId !== target.id); wss.clients.forEach(client => { if (client.user?.id === target.id) client.close(4003, 'password changed'); }); }
    if (!target.active) { state.sessions = state.sessions.filter(session => session.userId !== target.id); wss.clients.forEach(client => { if (client.user?.id === target.id) client.close(4002, 'account disabled'); }); }
    if (!target.active || !allowed(target, 'accessNotebook')) { closeNotebookSockets(target.id); stopNotebook(target.id).catch(error => console.error('Notebook stop error:', error.message)); }
    save(state); return json(res, 200, { user: publicUser(target) });
  }
  if (match && req.method === 'DELETE') {
    const admin = requireUser(req, res, 'admin'); if (!admin) return; const index = state.users.findIndex(user => user.id === match[1]); if (index < 0) return json(res, 404, { error: '用户不存在' }); const target = state.users[index];
    if (target.id === admin.id) return json(res, 400, { error: '不能删除当前登录的管理员账号' });
    if (target.role === 'admin' && target.active && state.users.filter(user => user.role === 'admin' && user.active).length <= 1) return json(res, 400, { error: '必须保留至少一个启用的管理员' });
    state.users.splice(index, 1); state.sessions = state.sessions.filter(session => session.userId !== target.id); state.conversations.forEach(item => { item.memberIds = item.memberIds.filter(id => id !== target.id); if (item.createdBy === target.id) item.createdBy = null; }); state.conversations = state.conversations.filter(item => item.memberIds.length >= 2); save(state); wss.clients.forEach(client => { if (client.user?.id === target.id) client.close(4001, 'account deleted'); }); closeNotebookSockets(target.id); stopNotebook(target.id).catch(error => console.error('Notebook stop error:', error.message)); broadcast({ type: 'conversation-created' }); return json(res, 200, { ok: true });
  }
  return json(res, 404, { error: '接口不存在' });
}

async function proxyNotebookHttp(req, res) {
  const user = currentUser(req);
  if (!user) return json(res, 401, { error: '请先登录' });
  if (!allowed(user, 'accessNotebook')) return json(res, 403, { error: '此账号不能使用 Python 实验室' });
  const status = await notebookCtl('status', user.id);
  if (!status.running || !status.ip || !status.token) return json(res, 503, { error: 'Python 环境尚未启动，请返回 Python 实验室启动' });
  notebookActivity.set(user.id, Date.now());
  const target = `http://${status.ip}:8888`;
  const headers = { authorization: `token ${status.token}` };
  if (req.headers.origin) headers.origin = target;
  notebookProxy.web(req, res, { target, headers }, error => {
    console.error('Notebook HTTP proxy error:', error.message);
    if (!res.headersSent) json(res, 502, { error: 'Python 环境连接失败，请稍后重试' });
    else res.destroy(error);
  });
}

function staticFile(req, res, url) {
  const clean = url.pathname === '/' ? '/index.html' : url.pathname;
  const isPublicPath = /^\/(?:index|announcements|projects|games|login|chat|admin|drive|learning|python)\.html$/.test(clean) || clean.startsWith('/assets/') || clean.startsWith('/games/');
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
  try { if (url.pathname.startsWith('/api/')) await api(req, res, url); else if (url.pathname.startsWith('/python/session/')) await proxyNotebookHttp(req, res); else staticFile(req, res, url); }
  catch (error) { console.error(error); if (!res.headersSent) json(res, 400, { error: error.message || '请求失败' }); }
});

const wss = new WebSocketServer({ noServer: true });
const broadcast = (data, conversationId = null) => {
  const payload = JSON.stringify(data);
  wss.clients.forEach(client => { if (client.readyState === 1 && (!conversationId || conversationFor(conversationId, client.user))) client.send(payload); });
};
server.on('upgrade', async (req, socket, head) => {
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const user = currentUser(req);
    if (pathname === '/chat-socket') {
      if (!user || !allowed(user, 'accessChat')) return socket.destroy();
      return wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
    }
    if (pathname.startsWith('/python/session/')) {
      if (!user || !allowed(user, 'accessNotebook')) return socket.destroy();
      const status = await notebookCtl('status', user.id);
      if (!status.running || !status.ip || !status.token) return socket.destroy();
      trackNotebookSocket(user, cookies(req).session, socket);
      const target = `http://${status.ip}:8888`;
      return notebookProxy.ws(req, socket, head, { target, headers: { origin: target, authorization: `token ${status.token}` } }, error => {
        console.error('Notebook WebSocket proxy error:', error.message);
        socket.destroy();
      });
    }
    socket.destroy();
  } catch (error) {
    console.error('WebSocket upgrade error:', error.message);
    socket.destroy();
  }
});
wss.on('connection', (ws, req) => {
  const user = currentUser(req); ws.user = user; ws.send(JSON.stringify({ type: 'ready', user: publicUser(user) }));
  ws.on('message', raw => {
    try {
      const data = JSON.parse(raw); const filteredText = filterSensitiveText(String(data.text || '').trim().slice(0, Number(state.settings.maxMessageLength) || 1000)); if (filteredText.error) { ws.send(JSON.stringify({ type: 'error', error: filteredText.error })); return; } const text = filteredText.text; const conversationId = String(data.conversationId || 'lobby');
      if (!conversationFor(conversationId, user)) return;
      if (conversationId === 'lobby' && !allowed(user, 'postLobby')) { ws.send(JSON.stringify({ type: 'error', error: '此账号不能在大厅发言' })); return; }
      const attachmentIds = Array.isArray(data.attachmentIds) ? data.attachmentIds.slice(0, Number(state.settings.maxAttachmentsPerMessage) || 5) : [];
      const attachments = attachmentIds.map(id => state.files.find(file => file.id === id && file.uploadedBy === user.id && file.conversationId === conversationId)).filter(Boolean).map(file => ({ id: file.id, originalName: file.originalName, mimeType: file.mimeType, size: file.size }));
      if (!text && !attachments.length) return;
      const replyTarget = data.replyToId ? state.messages.find(message => message.id === data.replyToId && message.conversationId === conversationId) : null;
      const replyTo = replyTarget ? { id: replyTarget.id, displayName: replyTarget.displayName, text: replyTarget.text.slice(0, 160) } : null;
      const message = { id: crypto.randomUUID(), conversationId, userId: user.id, username: user.username, displayName: user.displayName, text, attachments, replyTo, createdAt: new Date().toISOString() };
      state.messages.push(message); state.messages = state.messages.slice(-1000); save(state);
      broadcast({ type: 'message', message }, conversationId);
    } catch (error) { console.error('WebSocket message error:', error); try { ws.send(JSON.stringify({ type: 'error', error: '消息发送失败，请重试' })); } catch {} }
  });
});

let notebookCleanupRunning = false;
async function cleanupIdleNotebooks() {
  if (notebookCleanupRunning) return;
  notebookCleanupRunning = true;
  try {
    const now = Date.now();
    for (const [userId, lastActivity] of notebookActivity) {
      const user = state.users.find(item => item.id === userId && item.active);
      const sockets = notebookSockets.get(userId);
      if (sockets) {
        for (const [socket, token] of sockets) {
          const session = state.sessions.find(item => item.token === token && item.userId === userId && new Date(item.expiresAt) > new Date());
          if (!session || !user || !allowed(user, 'accessNotebook')) socket.destroy();
        }
      }
      const idleMs = notebookConfig().idleMinutes * 60_000;
      if (!user || !allowed(user, 'accessNotebook') || now - lastActivity >= idleMs) {
        closeNotebookSockets(userId);
        try { await stopNotebook(userId); }
        catch (error) { console.error('Idle Notebook stop error:', error.message); }
      }
    }
  } finally {
    notebookCleanupRunning = false;
  }
}
setInterval(cleanupIdleNotebooks, 60_000).unref();

server.listen(PORT, HOST, () => {
  console.log(`Polynomial Server: http://${HOST}:${PORT}`);
  if ((process.env.ADMIN_PASSWORD || 'change-me-now') === 'change-me-now') console.warn('警告：请在首次部署前设置 ADMIN_PASSWORD。');
  Promise.all(state.users.map(async user => {
    try { const status = await notebookCtl('status', user.id); if (status.running) notebookActivity.set(user.id, Date.now()); }
    catch (error) { console.error('Notebook status bootstrap error:', error.message); }
  })).catch(error => console.error(error));
});
