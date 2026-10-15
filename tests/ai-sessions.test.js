const test = require('node:test'), assert = require('node:assert/strict');
const sessions = require('../lib/ai-sessions'), tools = require('../lib/ai-tools'), chat = require('../lib/chat-service');
const user = { id: 'alice', role: 'member', active: true, permissions: { accessAssistant: true, accessPlanner: true }, assistantLimits: {} }, other = { ...user, id: 'bob' };
function state() { return { users: [user, other], settings: { assistantEnabled: true, assistantMaxOutputTokens: 128, assistantDailyTokens: 100000, assistantMonthlyTokens: 100000, assistantDailyRequests: 30, assistantMonthlyRequests: 30, assistantDefaultUserDailyTokens: 100000, assistantDefaultUserMonthlyTokens: 100000, assistantDefaultUserDailyRequests: 30, assistantDefaultUserMonthlyRequests: 30 }, assistantChats: [], assistantQueuedChats: [], assistantUsage: [], plannerItems: [] }; }
const save = () => {};
test('legacy conversations and queues migrate once without changing content or crossing accounts', () => {
  const s = state(); s.assistantChats.push({ userId: user.id, role: 'user', content: 'old alice', at: new Date().toISOString() }, { userId: other.id, role: 'user', content: 'old bob' }); s.assistantQueuedChats.push({ userId: user.id, message: 'queued', status: 'pending' });
  sessions.migrate(s); const ids = s.assistantSessions.map(row => row.id); sessions.migrate(s);
  assert.deepEqual(s.assistantSessions.map(row => row.id), ids); assert.equal(s.assistantChats[0].content, 'old alice'); assert.notEqual(s.assistantChats[0].sessionId, s.assistantChats[1].sessionId); assert.equal(s.assistantQueuedChats[0].sessionId, s.assistantChats[0].sessionId);
  assert.throws(() => sessions.get(s, other, s.assistantChats[0].sessionId), error => error.status === 404);
  for (const row of s.assistantSessions) row.archived = true; sessions.ensure(s, user); assert.equal(s.assistantSessions.length, 2); assert.equal(sessions.get(s, user).archived, true);
});
test('tool context is isolated, bounded and charged through the shared quota with attachment evidence', async () => {
  const s = state(), a = sessions.create(s, user), b = sessions.create(s, user, { toolId: 'summary' }), foreign = sessions.create(s, other);
  s.assistantChats.push({ userId: user.id, sessionId: a.id, role: 'user', content: 'do-not-leak-alice-other-session' }, { userId: other.id, sessionId: foreign.id, role: 'user', content: 'do-not-leak-bob' });
  for (let index = 0; index < 8; index++) s.assistantChats.push({ userId: user.id, sessionId: b.id, role: index % 2 ? 'assistant' : 'user', content: 'x'.repeat(8000) });
  await chat.sendChat({ state: s, save, user, sessionId: b.id, value: '整理明天提醒我的这段文字', attachment: { name: 'report.txt', text: 'source-evidence' }, key: 'fixture', model: 'test', complete: async args => {
    assert.equal(args.jsonMode, false); assert.ok(args.messages[0].content.includes('摘要'));
    const all = args.messages.map(row => row.content).join(' '); assert.ok(!all.includes('do-not-leak')); assert.ok(all.includes('source-evidence'));
    assert.ok(args.messages.slice(1, -1).reduce((n, row) => n + row.content.length, 0) <= 12000); return { content: 'summary reply', tokens: 42 };
  } });
  assert.equal(s.plannerItems.length, 0); assert.equal(s.assistantUsage[0].tokens, 42); assert.equal(s.assistantUsage[0].detail.sessionId, b.id); assert.equal(s.assistantUsage[0].detail.attachmentName, 'report.txt'); assert.equal(s.assistantChats.at(-1).sessionId, b.id);
});
test('concurrent requests cannot double-send in one session or bypass global limits across sessions', async () => {
  const s = state(); s.settings.assistantDailyRequests = 1;
  const a = sessions.create(s, user), b = sessions.create(s, user); let release;
  const pending = chat.sendChat({ state: s, save, user, sessionId: a.id, value: 'first', key: 'fixture', model: 'test', complete: () => new Promise(resolve => { release = resolve; }) });
  try {
    assert.equal(sessions.busy(s, a.id), true);
    await assert.rejects(chat.sendChat({ state: s, save, user, sessionId: a.id, value: 'duplicate' }), error => error.status === 409);
    await assert.rejects(chat.sendChat({ state: s, save, user, sessionId: b.id, value: 'second' }), error => error.code === 'AI_LIMIT');
    assert.throws(() => sessions.remove(s, user, a.id, a.updatedAt), error => error.status === 409); assert.equal(s.assistantUsage.length, 1);
  } finally { release({ content: 'done', tokens: 3 }); await pending; }
  assert.equal(sessions.busy(s, a.id), false); assert.equal(sessions.busy(s, b.id), false);
});
test('queued tools keep their session and attachment, block deletion, and preserve charged audit after deletion', async () => {
  const s = state(), a = sessions.create(s, user, { toolId: 'code' }), b = sessions.create(s, user);
  const queued = chat.queueChat(s, save, user, '检查代码', new Date(), { sessionId: a.id, attachment: { name: 'main.js', text: 'const x = 1;' } });
  assert.throws(() => sessions.update(s, user, a.id, { archived: true, ifUnmodifiedSince: a.updatedAt }), error => error.status === 409);
  assert.throws(() => sessions.remove(s, user, a.id, a.updatedAt), error => error.status === 409);
  await chat.sendChat({ state: s, save, user, sessionId: b.id, value: 'other session', key: 'fixture', model: 'test', complete: async () => ({ content: 'other reply', tokens: 1 }) });
  const processed = await chat.processQueuedChats({ state: s, save, key: 'fixture', model: 'test', allowed: () => true, clock: () => new Date('2026-10-17T03:00:00+08:00'), complete: async args => { assert.ok(args.messages[0].content.includes('审阅')); assert.ok(args.messages.at(-1).content.includes('const x = 1')); assert.ok(!JSON.stringify(args.messages).includes('other session')); return { content: 'review', tokens: 2 }; } });
  assert.equal(processed, 1); assert.equal(queued.status, 'completed', queued.error); assert.equal(queued.attachment, undefined); assert.equal(s.assistantChats.at(-1).sessionId, a.id);
  sessions.remove(s, user, a.id, a.updatedAt); assert.equal(s.assistantChats.some(row => row.sessionId === a.id), false); assert.equal(s.assistantUsage.some(row => row.detail.sessionId === a.id), true);
});
test('custom templates are owned snapshots; invalid files and planning permissions fail before spending', async () => {
  const s = state(); tools.saveTemplate(s, user, { title: 'custom', prompt: 'keep-original-prompt' }); const template = tools.list(s, user)[0];
  const a = sessions.create(s, user, { templateId: template.id }); tools.saveTemplate(s, user, { title: 'edited', prompt: 'new prompt', ifUnmodifiedSince: template.updatedAt }, template.id);
  assert.equal(a.promptSnapshot, 'keep-original-prompt'); assert.throws(() => sessions.create(s, other, { templateId: template.id }), error => error.status === 404);
  assert.throws(() => tools.attachment({ name: 'file.pdf', text: 'raw bytes' })); assert.throws(() => tools.attachment({ name: 'file.txt', text: 'x'.repeat(8001) }));
  await assert.rejects(chat.sendChat({ state: s, save, user, sessionId: a.id, value: 'hello', attachment: { name: 'binary.txt', text: '\0bytes' } }));
  const denied = { ...user, permissions: { accessPlanner: false } }, plan = sessions.create(s, user, { toolId: 'planner' });
  await assert.rejects(chat.sendChat({ state: s, save, user: denied, sessionId: plan.id, value: '明天提醒我读书' }), error => error.status === 403); assert.equal(s.assistantUsage.length, 0);
});
test('retention clears expired attachment and generated titles while retaining tool and token audit metadata', () => {
  const s = state(), now = Date.now(), old = new Date(now - 100 * 86400000).toISOString(), row = sessions.create(s, user);
  row.title = 'private-old-title'; row.autoTitleGeneratedAt = old;
  s.assistantChats.push({ userId: user.id, sessionId: row.id, role: 'user', content: 'expired-content', at: old });
  s.assistantUsage.push({ at: old, tokens: 50, detail: { sessionId: row.id, toolId: 'document', sessionTitle: 'private-old-title', attachmentName: 'private-file.txt', messages: [{ role: 'user', content: 'private-input' }] } });
  s.assistantQueuedChats.push({ sessionId: row.id, createdAt: old, status: 'pending', message: 'private-queued', attachment: { name: 'file.txt', text: 'private-file' } });
  s.adminButlerChats = []; s.auditLogs = [];
  require('../lib/security').pruneSensitiveRecords(s, now);
  assert.equal(s.assistantUsage[0].tokens, 50); assert.equal(s.assistantUsage[0].detail.sessionId, row.id); assert.equal(s.assistantUsage[0].detail.toolId, 'document');
  assert.equal(s.assistantUsage[0].detail.attachmentName, undefined); assert.equal(s.assistantUsage[0].detail.sessionTitle, undefined); assert.notEqual(row.title, 'private-old-title'); assert.equal(s.assistantQueuedChats[0].attachment, undefined); assert.equal(s.assistantQueuedChats[0].status, 'failed');
});
