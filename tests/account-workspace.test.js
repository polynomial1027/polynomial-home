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
    const uploadData = new FormData(); uploadData.append('file', new Blob(['test-client-bytes']), 'client-test.apk');
    const uploaded = await fetch(`http://127.0.0.1:${port}/api/drive/upload?scope=public`, { method: 'POST', headers: { cookie: admin.cookie }, body: uploadData });
    assert.equal(uploaded.status, 201);
    const file = (await uploaded.json()).file;
    const published = await call('/api/downloads', 'POST', { fileId: file.id, title: 'Test client', platform: 'android', category: 'client', version: '0.3.1' }, admin.cookie);
    assert.equal(published.status, 201);
    const content = await fetch(`http://127.0.0.1:${port}${published.body.resource.downloadUrl}`);
    assert.equal(await content.text(), 'test-client-bytes');
    assert.equal((await call('/api/downloads', 'POST', {fileId:file.id,title:'unauthorized',platform:'android'})).status, 401);
    assert.equal((await call('/api/downloads')).body.resources.length, 1);
    assert.equal((await call('/api/client/releases')).body.recommendedVersion, '0.3.1');
    assert.equal((await call('/api/client/releases/0.3.1', 'PATCH', {status:'withdrawn'})).status,401);
    await call('/api/client/releases/0.3.1', 'PATCH', {status:'withdrawn',notes:'test retirement'}, admin.cookie);
    assert.equal((await fetch(`http://127.0.0.1:${port}${published.body.resource.downloadUrl}`)).status,410);
    await call('/api/client/releases/0.3.1', 'PATCH', {status:'testing',notes:'test restored'}, admin.cookie);
    await stop();
    const { StateDatabase } = require('../lib/database');
    const savedDb = new StateDatabase(directory), saved = savedDb.read();
    const recordId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', day = require('../lib/assistant').dayKey();
    saved.assistantUsage.push({ id: recordId, userId: member.body.user.id, day, month: day.slice(0,7), at: new Date().toISOString(), tokens: 123, requests: 1, status: 'completed', detail: { source: 'chat', model: 'test-model', messages: [{role:'user',content:'private member question'}], response: 'private member answer' } });
    saved.assistantChats.push({userId:member.body.user.id,role:'user',content:'old member question',at:new Date().toISOString()});
    savedDb.write(saved); savedDb.close();
    await start();
    const logged = await call('/api/login', 'POST', { username: 'test-member', password: 'new-password' });
    assert.equal(logged.status, 200);
    const workspace = await call('/api/workspace', 'GET', undefined, logged.cookie);
    assert.equal(workspace.body.assistant.pricing.rates, undefined);
    assert.equal(workspace.body.assistant.usage, undefined);
    assert.equal(workspace.body.assistant.limits, undefined);
    assert.equal((await call('/api/admin/butler', 'GET', undefined, logged.cookie)).status, 403);
    assert.equal((await call('/api/admin/assistant', 'GET', undefined, logged.cookie)).status, 403);
    for (const route of ['/api/admin/assistant/records', '/api/admin/assistant/records/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '/api/admin/assistant/legacy-chats']) {
      assert.equal((await call(route)).status, 401);
      assert.equal((await call(route, 'GET', undefined, logged.cookie)).status, 403);
    }
    const plan = await call('/api/workspace/planner', 'POST', { title: 'Member reminder', dueAt: '2026-10-17T09:00:00+08:00' }, logged.cookie);
    assert.equal(plan.status, 201);
    const planId = plan.body.item.id;
    assert.equal((await call(`/api/workspace/planner/${planId}`, 'PATCH', { title: 'Should not save', dueAt: 'bad' }, logged.cookie)).status, 400);
    assert.equal((await call('/api/workspace', 'GET', undefined, logged.cookie)).body.planner.find(item => item.id === planId).title, 'Member reminder');
    assert.equal((await call(`/api/workspace/planner/${planId}`, 'PATCH', { title: 'Moved reminder', dueAt: '2026-10-18T10:00:00+08:00' }, logged.cookie)).status, 200);
    const updatedPlan = (await call('/api/workspace', 'GET', undefined, logged.cookie)).body.planner.find(item => item.id === planId);
    assert.equal(updatedPlan.dueAt, '2026-10-18T02:00:00.000Z');
    const otherSession = await call('/api/login', 'POST', { username: 'test-admin', password: 'test-admin-password' });
    assert.equal((await call(`/api/workspace/planner/${planId}`, 'PATCH', { title: 'Other account change' }, otherSession.cookie)).status, 404);
    assert.equal((await call(`/api/workspace/planner/${planId}`, 'DELETE', undefined, logged.cookie)).status, 200);
    const freshAdmin = await call('/api/login', 'POST', { username: 'test-admin', password: 'test-admin-password' });
    assert.equal((await call('/api/admin/assistant/records', 'GET', undefined, freshAdmin.cookie)).status, 200);
    const records = await call(`/api/admin/assistant/records?userId=${member.body.user.id}`, 'GET', undefined, freshAdmin.cookie);
    assert.equal(records.body.total, 1);
    assert.equal(records.body.records[0].detail, undefined);
    assert.equal((await call(`/api/admin/assistant/records/${recordId}`, 'GET', undefined, freshAdmin.cookie)).body.record.detail.response, 'private member answer');
    assert.equal((await call(`/api/admin/assistant/legacy-chats?userId=${member.body.user.id}`, 'GET', undefined, freshAdmin.cookie)).body.chats[0].content, 'old member question');
    assert.equal((await call('/api/admin/assistant/records?date=invalid', 'GET', undefined, freshAdmin.cookie)).status, 400);
    const deniedPage = await fetch(`http://127.0.0.1:${port}/ai-records.html`, { headers: { cookie: logged.cookie }, redirect: 'manual' });
    assert.equal(deniedPage.status, 302);
    assert.equal((await fetch(`http://127.0.0.1:${port}/ai-records.html`, { headers: { cookie: freshAdmin.cookie } })).status, 200);
    assert.equal((await call('/api/downloads', 'POST', {fileId:file.id,title:'member publish',platform:'android'}, logged.cookie)).status, 403);
    for (const route of ['/app.html','/download.html','/app.webmanifest','/app-sw.js','/assets/app/icon-192.png']) { const response=await fetch(`http://127.0.0.1:${port}${route}`);assert.equal(response.status,200,route); }
    const announcements = await call('/api/announcements');
    assert.ok(announcements.body.announcements.some(item => item.id === 'ai-workspace-v027'));
  } finally { await stop(); fs.rmSync(directory, { recursive: true, force: true }); }
});
