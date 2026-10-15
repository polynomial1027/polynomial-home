const crypto = require('node:crypto');
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function encode(buffer) { let bits = 0, value = 0, out = ''; for (const byte of buffer) { value = (value << 8) | byte; bits += 8; while (bits >= 5) { out += alphabet[(value >>> (bits - 5)) & 31]; bits -= 5; } } if (bits) out += alphabet[(value << (5 - bits)) & 31]; return out; }
function decode(secret) { let bits = 0, value = 0; const bytes = []; for (const char of secret) { const digit = alphabet.indexOf(char); if (digit < 0) throw new Error('验证器密钥无效'); value = (value << 5) | digit; bits += 5; if (bits >= 8) { bytes.push((value >>> (bits - 8)) & 255); bits -= 8; } } return Buffer.from(bytes); }
function codeAt(secret, counter) {
  const buffer = Buffer.alloc(8); buffer.writeBigUInt64BE(BigInt(counter));
  const hash = crypto.createHmac('sha1', decode(secret)).update(buffer).digest();
  return String((hash.readUInt32BE(hash[19] & 15) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}
function matchingCounter(secret, value, now = Date.now(), lastCounter = -1) {
  if (!/^\d{6}$/.test(String(value || ''))) return null;
  const base = Math.floor(now / 30000);
  for (const counter of [base, base - 1, base + 1]) if (counter > lastCounter && counter >= 0 && crypto.timingSafeEqual(Buffer.from(codeAt(secret, counter)), Buffer.from(String(value)))) return counter;
  return null;
}
const digest = code => crypto.createHash('sha256').update(String(code).replace(/[-\s]/g, '').toLowerCase()).digest('hex');
function verifyFactor(user, value, now = Date.now()) {
  if (!user.mfa?.enabled) return true;
  const counter = matchingCounter(user.mfa.secret, String(value || '').trim(), now, user.mfa.lastCounter ?? -1);
  if (counter !== null) { user.mfa.lastCounter = counter; return true; }
  const index = (user.mfa.recoveryHashes || []).indexOf(digest(value));
  if (index < 0) return false;
  user.mfa.recoveryHashes.splice(index, 1); return true;
}
function beginSetup(user, now = Date.now()) {
  if (user.mfa?.enabled) throw new Error('验证器已开启');
  const secret = encode(crypto.randomBytes(20));
  user.mfaPending = { secret, expiresAt: now + 10 * 60_000 };
  return { secret, uri: `otpauth://totp/${encodeURIComponent(`Polynomial:${user.username}`)}?secret=${secret}&issuer=Polynomial&algorithm=SHA1&digits=6&period=30`, expiresAt: new Date(user.mfaPending.expiresAt).toISOString() };
}
function finishSetup(user, value, now = Date.now()) {
  const pending = user.mfaPending;
  if (!pending || pending.expiresAt <= now) throw new Error('设置已过期，请重新获取验证器密钥');
  const counter = matchingCounter(pending.secret, value, now);
  if (counter === null) throw new Error('验证码不正确');
  const recoveryCodes = Array.from({ length: 8 }, () => crypto.randomBytes(8).toString('hex'));
  user.mfa = { enabled: true, secret: pending.secret, lastCounter: counter, recoveryHashes: recoveryCodes.map(digest), enabledAt: new Date(now).toISOString() };
  delete user.mfaPending;
  return recoveryCodes;
}
function passwordError(password, role = 'member') { const min = role === 'admin' ? 12 : 8; return typeof password !== 'string' || password.length < min || password.length > 256 ? `新密码需为 ${min}–256 位` : null; }
function pruneSensitiveRecords(state, now = Date.now()) {
  const detailsCutoff = now - (state.settings.aiRecordRetentionDays || 90) * 86400_000;
  const auditCutoff = now - (state.settings.auditRetentionDays || 365) * 86400_000;
  let changed = false;
  for (const row of state.assistantUsage) if (Date.parse(row.at) < detailsCutoff && row.detail && !row.detailsExpired) { delete row.detail.messages; delete row.detail.response; delete row.detail.displayedResponse; delete row.detail.processingError; delete row.detail.error; delete row.detail.sessionTitle; delete row.detail.attachmentName; row.detailsExpired = true; changed = true; }
  for (const name of ['assistantChats', 'adminButlerChats']) { const old = state[name].length; state[name] = state[name].filter(row => Date.parse(row.at || row.createdAt) >= detailsCutoff); if (old !== state[name].length) changed = true; }
  for (const row of state.assistantSessions || []) if (row.autoTitleGeneratedAt && Date.parse(row.autoTitleGeneratedAt) < detailsCutoff && !state.assistantChats.some(item => item.sessionId === row.id)) { row.title = '内容已到期的会话'; delete row.autoTitleGeneratedAt; row.updatedAt = new Date(now).toISOString(); changed = true; }
  for (const row of state.assistantQueuedChats || []) if (Date.parse(row.createdAt) < detailsCutoff && row.status !== 'running' && (row.message || row.attachment)) { delete row.message; delete row.attachment; if (row.status === 'pending') { row.status = 'failed'; row.error = '排队内容已超过保存期限，请重新发送'; } changed = true; }
  const old = state.auditLogs.length; state.auditLogs = state.auditLogs.filter(row => Date.parse(row.at) >= auditCutoff);
  return changed || old !== state.auditLogs.length;
}
function sessionView(session, currentToken) {
  return { id: crypto.createHash('sha256').update(session.token).digest('hex'), current: session.token === currentToken, address: session.address, userAgent: session.userAgent, createdAt: session.createdAt, lastSeenAt: session.lastSeenAt, expiresAt: session.expiresAt };
}
module.exports = { beginSetup, finishSetup, verifyFactor, matchingCounter, codeAt, encode, passwordError, pruneSensitiveRecords, sessionView };
