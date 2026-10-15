const fs = require('node:fs');
const path = require('node:path');
const security = require('./security');
function createOperationsApi({ state, save, json, body, requireUser, cookies, verifyPassword, hashPassword, appendAudit, scheduler, backups, closeSession }) {
  const failures = new Map(), tests = new Map();
  function reauthenticate(user, data) {
    const recent = (failures.get(user.id) || []).filter(at => Date.now() - at < 10 * 60_000);
    if (recent.length >= 5) throw new Error('验证失败次数过多，请十分钟后重试');
    if (!verifyPassword(String(data.password || '').slice(0, 256), user.passwordHash) || !security.verifyFactor(user, data.code)) {
      recent.push(Date.now()); failures.set(user.id, recent); throw new Error('密码或验证器验证码错误');
    }
    failures.delete(user.id);
  }
  return async function operations(req, res, url) {
    const route = url.pathname;
    if (route.startsWith('/api/account/')) {
      const user = requireUser(req, res); if (!user) return true;
      const currentToken = cookies(req).session;
      if (route === '/api/account/security' && req.method === 'GET') { json(res, 200, { mfaEnabled: user.mfa?.enabled === true, recoveryCodesRemaining: user.mfa?.recoveryHashes?.length || 0, passwordMinimum: user.role === 'admin' ? 12 : 8 }); return true; }
      if (route === '/api/account/sessions' && req.method === 'GET') { json(res, 200, { sessions: state.sessions.filter(row => row.userId === user.id && Date.parse(row.expiresAt) > Date.now()).map(row => security.sessionView(row, currentToken)) }); return true; }
      const session = route.match(/^\/api\/account\/sessions\/([a-f0-9]{64}|others)$/);
      if (session && req.method === 'DELETE') {
        const removed = state.sessions.filter(row => row.userId === user.id && (session[1] === 'others' ? row.token !== currentToken : security.sessionView(row, currentToken).id === session[1]));
        state.sessions = state.sessions.filter(row => !removed.includes(row)); removed.forEach(row => closeSession(row));
        appendAudit({ user, action: 'session-revoked', req, detail: String(removed.length) }); save(state); json(res, 200, { ok: true }); return true;
      }
      if (route === '/api/account/password' && req.method === 'POST') {
        const data = await body(req), error = security.passwordError(data.newPassword, user.role);
        if (error) { json(res, 400, { error }); return true; }
        reauthenticate(user, data); user.passwordHash = hashPassword(data.newPassword);
        const removed = state.sessions.filter(row => row.userId === user.id && row.token !== currentToken);
        state.sessions = state.sessions.filter(row => !removed.includes(row)); removed.forEach(closeSession);
        appendAudit({ user, action: 'own-password-changed', req }); save(state); json(res, 200, { ok: true }); return true;
      }
      if (route.startsWith('/api/account/mfa/') && req.method === 'POST') {
        if (user.role !== 'admin') { json(res, 403, { error: '此验证器设置仅开放给管理员' }); return true; }
        const data = await body(req); let result;
        if (route === '/api/account/mfa/setup') { reauthenticate(user, data); result = security.beginSetup(user); }
        else if (route === '/api/account/mfa/enable') {
          const recent = (tests.get(user.id) || []).filter(at => Date.now() - at < 10 * 60_000);
          if (recent.length >= 5) throw new Error('验证码尝试过多，请十分钟后重试');
          recent.push(Date.now()); tests.set(user.id, recent);
          result = { recoveryCodes: security.finishSetup(user, data.code) };
          const removed = state.sessions.filter(row => row.userId === user.id && row.token !== currentToken);
          state.sessions = state.sessions.filter(row => !removed.includes(row)); removed.forEach(closeSession);
        }
        else if (route === '/api/account/mfa/disable') { reauthenticate(user, data); delete user.mfa; delete user.mfaPending; result = { ok: true }; }
        else return false;
        appendAudit({ user, action: `mfa-${route.split('/').at(-1)}`, req }); save(state); json(res, 200, result); return true;
      }
      return false;
    }
    if (!route.startsWith('/api/admin/operations')) return false;
    const admin = requireUser(req, res, 'admin'); if (!admin) return true;
    if (route === '/api/admin/operations' && req.method === 'GET') {
      json(res, 200, { ...scheduler.overview(), backups: backups.list(), backupBusy: backups.busy, storage: 'SQLite · 事务与 WAL', settings: { automaticBackup: state.settings.automaticBackup, backupRetention: state.settings.backupRetention, aiRecordRetentionDays: state.settings.aiRecordRetentionDays, auditRetentionDays: state.settings.auditRetentionDays } }); return true;
    }
    if (route === '/api/admin/operations/settings' && req.method === 'PATCH') {
      const data = await body(req), updated = {};
      for (const [key, min, max] of [['backupRetention', 1, 30], ['aiRecordRetentionDays', 7, 400], ['auditRetentionDays', 7, 730]]) if (Object.hasOwn(data, key)) { if (!Number.isSafeInteger(data[key]) || data[key] < min || data[key] > max) throw new Error(`${key} 必须为 ${min}–${max} 之间的整数`); updated[key] = data[key]; }
      if (Object.hasOwn(data, 'automaticBackup')) { if (typeof data.automaticBackup !== 'boolean') throw new Error('无效的备份设置'); updated.automaticBackup = data.automaticBackup; }
      Object.assign(state.settings, updated); scheduler.configure(); appendAudit({ user: admin, action: 'operations-settings', req, detail: JSON.stringify(updated) }); save(state); json(res, 200, { ok: true }); return true;
    }
    const job = route.match(/^\/api\/admin\/operations\/jobs\/(health|backup|review)$/);
    if (job && req.method === 'POST') {
      const { action } = await body(req);
      appendAudit({ user: admin, action: 'job-control', req, detail: `${job[1]}:${action}` }); save(state);
      const result = await scheduler.control(job[1], action); json(res, 200, { result }); return true;
    }
    if (route === '/api/admin/operations/backups' && req.method === 'POST') {
      appendAudit({ user: admin, action: 'backup-create', req }); save(state);
      const result = await backups.create(); json(res, 201, { backup: result }); return true;
    }
    const match = route.match(/^\/api\/admin\/operations\/backups\/(backup-[0-9T-]+-[a-f0-9]{8})\/(verify|content|metadata)$/);
    if (match) {
      const row = backups.get(match[1]);
      if (!row) { json(res, 404, { error: '备份不存在' }); return true; }
      if (match[2] === 'verify' && req.method === 'POST') { const result = await backups.verify(row.id); appendAudit({ user: admin, action: 'backup-verify', req, detail: row.id }); save(state); json(res, 200, { backup: result }); return true; }
      if (match[2] === 'metadata' && req.method === 'GET') { res.setHeader('Content-Disposition', `attachment; filename="${row.id}.json"`); json(res, 200, row); return true; }
      if (match[2] === 'content' && req.method === 'GET') {
        appendAudit({ user: admin, action: 'backup-download', req, detail: row.id }); save(state);
        const bundle = path.join(backups.directory, `${row.id}.tar.gz`);
        res.writeHead(200, { 'Content-Type': 'application/gzip', 'Content-Length': row.size, 'Content-Disposition': `attachment; filename="${row.id}.tar.gz"`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Backup-SHA256': row.sha256 });
        const stream = fs.createReadStream(bundle); stream.on('error', () => res.destroy()); res.on('close', () => stream.destroy()); stream.pipe(res); return true;
      }
    }
    return false;
  };
}
module.exports = { createOperationsApi };
