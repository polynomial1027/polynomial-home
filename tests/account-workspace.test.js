const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { loginSummary, localAnswer } = require('../lib/admin-butler');

test('today login report has exact Beijing interval and distinguishes absent accounts', () => {
  const state = { users: [{ id: 'a', username: 'alice', displayName: 'Alice', active: true }, { id: 'b', username: 'bob', displayName: 'Bob', active: true }], auditLogs: [{ action: 'login', userId: 'a', at: '2026-10-13T16:30:00Z' }, { action: 'login', userId: 'b', at: '2026-10-13T15:30:00Z' }] };
  const reply = loginSummary(state, new Date('2026-10-14T02:00:00Z'));
  assert.match(reply, /统计区间：.*2026.*10.*14.*至.*北京时间/);
  assert.match(reply, /成功登录：1 次/);
  assert.match(reply, /已登录账号：Alice/);
  assert.match(reply, /未登录的启用账号：Bob/);
  const reset = localAnswer({ state, message: '修改 alice 密码为 secret', admin: { id: 'admin' } });
  assert.match(reset.link, /focus=password/);
  assert.doesNotMatch(reset.reply, /secret/);
});

test('password edit invalidates old login, persists across restart, and member API hides admin pricing', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'polynomial-account-test-'));
  const port = 20000 + Math.floor(Math.random() * 20000);
  let child;
  const start = async () => {
    child = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, POLYNOMIAL_DATA_DIR: directory, HOST: '127.0.0.1', PORT: String(port), ADMIN_USERNAME: 'test-admin', ADMIN_PASSWORD: 'test-admin-password', DEEPSEEK_API_KEY: '' }, stdio: 'ignore' });
    for (let i = 0; i < 100; i++) { try { await fetch(`http://127.0.0.1:${port}/api/me`); return; } catch { await new Promise(resolve => setTimeout(resolve, 30)); } }
    throw new Error('test server did not start');
  };
  const stop = async () => { if (child.exitCode === null) { const exited = new Promise(resolve => child.once('exit', resolve)); child.kill(); await exited; } };
  const call = async (route, method = 'GET', body, cookie) => {
    const response = await fetch(`http://127.0.0.1:${port}${route}`, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, body: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
  };
  try {
    await start();
    const admin = await call('/api/login', 'POST', { username: 'test-admin', password: 'test-admin-password' });
    const member = await call('/api/users', 'POST', { username: 'test-member', displayName: 'Member', password: 'old-password' }, admin.cookie);
    assert.equal(member.status, 201);
    const oldSession = await call('/api/login', 'POST', { username: 'test-member', password: 'old-password' });
    const invalid = await call(`/api/users/${member.body.user.id}`, 'PATCH', { displayName: 'should-not-save', password: 'x' }, admin.cookie);
    assert.equal(invalid.status, 400);
    const changed = await call(`/api/users/${member.body.user.id}`, 'PATCH', { password: 'new-password' }, admin.cookie);
    assert.equal(changed.body.passwordChanged, true);
    assert.equal(changed.body.user.displayName, 'Member');
    assert.equal((await call('/api/me', 'GET', undefined, oldSession.cookie)).body.user, null);
    assert.equal((await call('/api/login', 'POST', { username: 'test-member', password: 'old-password' })).status, 401);
    await stop(); await start();
    const logged = await call('/api/login', 'POST', { username: 'test-member', password: 'new-password' });
    assert.equal(logged.status, 200);
    const workspace = await call('/api/workspace', 'GET', undefined, logged.cookie);
    assert.equal(workspace.body.assistant.pricing.rates, undefined);
    assert.equal(workspace.body.assistant.usage, undefined);
    assert.equal(workspace.body.assistant.limits, undefined);
    assert.equal((await call('/api/admin/butler', 'GET', undefined, logged.cookie)).status, 403);
    assert.equal((await call('/api/admin/assistant', 'GET', undefined, logged.cookie)).status, 403);
    const announcements = await call('/api/announcements');
    assert.ok(announcements.body.announcements.some(item => item.id === 'ai-workspace-v027'));
  } finally { await stop(); fs.rmSync(directory, { recursive: true, force: true }); }
});
