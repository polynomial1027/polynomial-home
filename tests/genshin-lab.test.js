const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const math = require('../lib/genshin-math');
const { createGenshinLab, trusted } = require('../lib/genshin-lab');
const panel = { atk: 2000, em: 0, multiplier: 2, bonus: .5, critRate: .5, critDamage: 1, level: 90, enemyLevel: 90, resistance: .1, defReduction: 0, defIgnore: 0, reactionBonus: 0, reaction: 'none' };
test('single hit arithmetic, resistance branches and conditional amplification', () => {
  assert.equal(math.hit(panel).expected, 4050);
  assert.equal(math.hit({ ...panel, resistance: -.2 }).factors.resistance, 1.1);
  assert.equal(math.hit({ ...panel, resistance: .75 }).factors.resistance, .25);
  assert.equal(math.hit({ ...panel, reaction: 'vaporize-pyro', reactionConfirmed: true }).expected, 6075);
  assert.throws(() => math.hit({ ...panel, reaction: 'melt-pyro' }), /实际触发/);
  assert.throws(() => math.hit({ ...panel, em: undefined }), /em/);
  assert.throws(() => math.hit({ ...panel, defReduction: .95 }), /defReduction/);
  const r = math.compare({ before: panel, after: { ...panel, atk: 2200 } });
  assert.ok(Math.abs(r.improvement - .1) < 1e-12);
  assert.equal(math.compare({ before: { ...panel, atk: 0 }, after: panel }).improvement, null);
});
test('trusted source checks reject subdomain spoofing, credentials and non-HTTPS', () => {
  assert.equal(trusted('https://library.keqingmains.com/foo'), true);
  for (const url of ['http://library.keqingmains.com', 'https://library.keqingmains.com.evil.test', 'https://evil.test/?url=library.keqingmains.com', 'https://user:pass@library.keqingmains.com/', 'https://library.keqingmains.com:8443']) assert.equal(trusted(url), false);
});
function fixture(t, overrides = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'genshin-lab-test-')); t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const state = { assistantUsage: [], settings: { assistantEnabled: true, assistantMaxOutputTokens: 1200, assistantDailyTokens: 1000000, assistantMonthlyTokens: 1000000, assistantDailyRequests: 100, assistantMonthlyRequests: 100, assistantDefaultUserDailyTokens: 1000000, assistantDefaultUserMonthlyTokens: 1000000, assistantDefaultUserDailyRequests: 100, assistantDefaultUserMonthlyRequests: 100 } };
  const options = { directory, state, save() {}, key: 'mock-key', model: 'mock-model', body: async req => req.data, json: (res, status, data) => Object.assign(res, { status, data }), requireUser(req, res, role) { if (!req.user) { res.status = 401; return null; } if (req.user.role !== role) { res.status = 403; return null; } return req.user; }, ...overrides };
  let handler = createGenshinLab(options);
  return { directory, state, restart() { handler = createGenshinLab(options); }, async call(route, data, role = 'admin', method) { const req = { method: method || (data === undefined ? 'GET' : 'POST'), data, user: role ? { id: role, role } : null }, res = { setHeader() {} }; await handler(req, res, new URL('http://localhost/api/admin/labs/genshin/' + route)); return res; } };
}
test('every lab API requires admin; local calculator never calls provider', async t => {
  let calls = 0; const f = fixture(t, { fetcher: async () => { calls++; throw new Error('unexpected'); }, complete: async () => { calls++; } });
  for (const route of ['status', 'ask', 'calculate', 'documents', 'budget']) {
    assert.equal((await f.call(route, {}, 'member')).status, 403);
    assert.equal((await f.call(route, {}, null)).status, 401);
  }
  assert.equal((await f.call('calculate', { before: panel, after: panel })).status, 200);
  assert.equal(calls, 0);
});
test('requests have no count cap; token cap survives restart and needs explicit increase', async t => {
  let calls = 0; const f = fixture(t, { fetcher: async () => { calls++; throw new Error('simulated provider failure'); } });
  for (let i = 0; i < 8; i++) assert.equal((await f.call('ask', { question: '元素附着', search: true })).status, 400);
  assert.equal(calls, 8);
  const file = path.join(f.directory, 'genshin-lab.json'), data = JSON.parse(fs.readFileSync(file));
  data.budget.usedTokens = 100000; fs.writeFileSync(file, JSON.stringify(data)); f.restart();
  const stopped = await f.call('ask', { question: '元素附着', search: true });
  assert.equal(stopped.status, 429); assert.equal(calls, 8);
  const status = (await f.call('status')).data;
  assert.equal(status.calls.filter(r => r.status === 'failed').length, 8);
  assert.equal(status.budget.usedCalls, 8); assert.equal(status.budget.maxCalls, undefined);
  assert.equal((await f.call('budget', { maxTokens: 110000 }, 'admin', 'PATCH')).status, 400);
  assert.equal((await f.call('budget', { maxTokens: 110000, confirm: '提高测试上限' }, 'admin', 'PATCH')).status, 200);
  await f.call('ask', { question: '元素附着', search: true }); assert.equal(calls, 9);
});
test('import persists; evidence validator rejects invented quotes and sources; chat records both quotas', async t => {
  const f = fixture(t, { complete: async ({ messages }) => {
    const s = JSON.parse(messages[1].content).sources.find(s => s.title === '测试角色');
    return { content: JSON.stringify({ claims: [{ text: '测试技能的附着记录。', sourceId: s.id, quote: '测试技能附着量为1U，适用版本待核验。' }, { text: '伪造数据', sourceId: s.id, quote: '这段内容不在原文中，不可展示' }, { text: '不存在的来源', sourceId: 'fake', quote: s.content }], missing: ['需要ICD时间序列'] }), tokens: 42, usage: { totalTokens: 42 } };
  } });
  assert.equal((await f.call('documents', { title: '测试角色', version: '待核验', content: '测试技能附着量为1U，适用版本待核验。' })).status, 201);
  f.restart();
  const result = await f.call('ask', { question: '测试角色附着量', search: false });
  assert.equal(result.status, 200); assert.equal(result.data.claims.length, 1); assert.equal(result.data.warnings.length, 2);
  assert.equal(f.state.assistantUsage[0].tokens, 42);
  const status = (await f.call('status')).data;
  assert.equal(status.budget.usedCalls, 1); assert.equal(status.budget.usedTokens, 42); assert.equal(status.calls[0].actualTokens, 42);
});
test('search filters sources independently, refuses snippets, and records fetch separately', async t => {
  const endpoints = [];
  const f = fixture(t, { fetcher: async (url, options) => {
    endpoints.push(url); const request = JSON.parse(options.body);
    if (url.endsWith('search')) { assert.ok([...request.query].length <= 128); return Response.json({ results: [{ url: 'https://evil.test/', content: 'malicious' }, { url: 'https://library.keqingmains.com/example', title: 'Test', content: '', summary: 'not evidence' }] }); }
    return Response.json({ content: '这是可信域名上的测试正文，版本仍需核验。' });
  }, complete: async ({ messages }) => { const sources = JSON.parse(messages[1].content).sources; assert.equal(sources.some(s => s.content === 'malicious'), false); assert.equal(sources.some(s => s.content === 'not evidence'), false); assert.ok(sources.some(s => s.content === '这是可信域名上的测试正文，版本仍需核验。')); return { content: JSON.stringify({ claims: [], missing: ['版本待核验'] }), tokens: 50 }; } });
  assert.equal((await f.call('ask', { question: '角色'.repeat(100), search: true })).status, 200);
  assert.equal(endpoints.length, 2); assert.equal((await f.call('status')).data.budget.usedCalls, 3);
});
test('exceeding token budget prevents any model request', async t => {
  let count = 0; const f = fixture(t, { complete: async () => { count++; } });
  await f.call('documents', { title: '角色', version: '测试', content: '角色'.repeat(40000) });
  // Set a nearly consumed budget on disk, then simulate restart.
  const file = path.join(f.directory, 'genshin-lab.json'), data = JSON.parse(fs.readFileSync(file)); data.budget.usedTokens = 99999; fs.writeFileSync(file, JSON.stringify(data)); f.restart();
  assert.equal((await f.call('ask', { question: '角色' })).status, 429); assert.equal(count, 0); assert.equal(f.state.assistantUsage.length, 0);
});

test('numerical questions receive server results and AI cannot choose calculation inputs', async t => {
  const f = fixture(t, { complete: async ({ messages }) => {
    const source = JSON.parse(messages[1].content).sources.find(s => s.id === 'server-calculation');
    assert.match(source.content, /提升=10.000000%/);
    return { content: JSON.stringify({ claims: [{ text: '在相同条件下攻击力提升对应10%的单次期望伤害提升。', sourceId: source.id, quote: source.content.slice(0, 80) }], missing: [] }), tokens: 80 };
  } });
  const r = await f.call('ask', { question: '换装提升是多少？', calculation: { before: panel, after: { ...panel, atk: 2200 } } });
  assert.equal(r.status, 200); assert.equal(r.data.claims.length, 1); assert.ok(Math.abs(r.data.calculation.improvement - .1) < 1e-12);
  assert.equal((await f.call('ask', { question: '计算', calculation: { before: {} } })).status, 400);
});
test('all numeric benchmark examples match independent worked answers', () => {
  const { cases, evaluate } = require('../lib/genshin-benchmark');
  for (const row of cases.filter(c => c.type === 'numeric')) {
    const calculation = math.compare(row.calculation);
    assert.equal(evaluate(row, { calculation, claims: [{ sourceId: 'server-calculation' }] }).pass, true, row.id);
    assert.equal(evaluate(row, { calculation, claims: [] }).pass, false, '正确的服务器结果不能冒充模型已引用计算');
  }
});
test('token-only migration preserves existing usage and removes legacy request cap', async t => {
  const f = fixture(t);
  const file = path.join(f.directory, 'genshin-lab.json');
  fs.writeFileSync(file, JSON.stringify({ documents: [], calls: [], budget: { maxCalls: 6, maxTokens: 30000, usedCalls: 6, usedTokens: 1000 } }));
  f.restart(); const s = (await f.call('status')).data;
  assert.equal(s.budget.maxTokens, 100000); assert.equal(s.budget.usedTokens, 1000); assert.equal(s.budget.usedCalls, 6); assert.equal(s.budget.maxCalls, undefined); assert.equal(s.exhausted, false);
  assert.match(s.calls[0].reason, /用户授权/);
});
test('server evaluation can reuse an existing admin session only against loopback and never creates access', t => {
  const { localAdminCookie } = require('../scripts/test-genshin-live');
  assert.throws(() => localAdminCookie('https://evil.test', '/missing'), /回环/);
  assert.throws(() => localAdminCookie('http://127.0.0.1.evil.test', '/missing'), /回环/);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'genshin-session-test-')); t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const { StateDatabase } = require('../lib/database'); const db = new StateDatabase(directory);
  db.write({ users: [{ id: 'admin', active: true, role: 'admin' }], sessions: [{ token: 'expired', userId: 'admin', expiresAt: '2000-01-01' }] });
  assert.throws(() => localAdminCookie('http://127.0.0.1:3000', directory), /登录/);
  const expiresAt = new Date(Date.now() + 60000).toISOString(); db.write({ users: [{ id: 'admin', active: true, role: 'admin' }], sessions: [{ token: 'valid-test', userId: 'admin', expiresAt }] });
  assert.equal(localAdminCookie('http://127.0.0.1:3000', directory), 'session=valid-test'); db.close();
});
