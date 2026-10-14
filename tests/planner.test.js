const test = require('node:test');
const assert = require('node:assert/strict');
const planner = require('../lib/planner');
const { sendChat } = require('../lib/chat-service');

const caps = {
  assistantMaxOutputTokens: 512, assistantDailyTokens: 100000, assistantMonthlyTokens: 100000,
  assistantDailyRequests: 20, assistantMonthlyRequests: 20,
  assistantDefaultUserDailyTokens: 100000, assistantDefaultUserMonthlyTokens: 100000,
  assistantDefaultUserDailyRequests: 20, assistantDefaultUserMonthlyRequests: 20
};

test('daily briefing keeps user tasks private and updates tomorrow selection', () => {
  const state = { plannerItems: [], dailyBriefViews: [], healthReports: [], assistantReviews: [] };
  const user = { id: 'alice', role: 'member' }, other = { id: 'bob', role: 'member' };
  const save = () => {};
  const item = planner.createItem(state, save, user, { title: '明日会议', dueAt: '2026-10-15T09:00:00+08:00' });
  planner.createItem(state, save, other, { title: '私有任务', dueAt: '2026-10-15T09:00:00+08:00' });
  let brief = planner.dailyBrief(state, user, new Date('2026-10-14T12:00:00+08:00'));
  assert.deepEqual(brief.tomorrowItems.map(row => row.title), ['明日会议']);
  planner.updateItem(state, save, user, item.id, { scheduled: false });
  assert.equal(planner.dailyBrief(state, user, new Date('2026-10-14T12:00:00+08:00')).tomorrowItems[0].scheduled, false);
  planner.markBriefSeen(state, save, user, new Date('2026-10-14T12:00:00+08:00'));
  brief = planner.dailyBrief(state, user, new Date('2026-10-14T12:00:00+08:00'));
  assert.equal(brief.seen, true);
});

test('AI planning chat creates only valid dated tasks and uses shared quota', async () => {
  const user = { id: 'alice', role: 'member', assistantLimits: {} };
  const state = { settings: caps, assistantUsage: [], assistantChats: [], plannerItems: [] };
  const tomorrow = new Date(Date.now() + 86400_000).toISOString();
  const reply = await sendChat({ state, save: () => {}, user, value: '明天提醒我检查报告', key: 'test', model: 'deepseek-flash', complete: async args => {
    assert.equal(args.jsonMode, true);
    assert.equal(args.disableThinking, true);
    return { content: JSON.stringify({ reply: '已经安排。', plans: [{ title: '检查报告', dueAt: tomorrow }, { title: '非法时间', dueAt: 'bad' }] }), tokens: 75 };
  } });
  assert.match(reply, /已加入计划与日历/);
  assert.equal(state.plannerItems.length, 1);
  assert.equal(state.plannerItems[0].source, 'assistant');
  assert.equal(state.assistantUsage[0].tokens, 75);
});

test('editing a plan validates before saving and reschedules only the owner reminder', () => {
  const state = { plannerItems: [], reminderDeliveries: [] }, user = { id: 'alice' };
  const item = planner.createItem(state, () => {}, user, { title: '会议', dueAt: '2026-10-16T09:00:00+08:00' });
  state.reminderDeliveries.push({ itemId: item.id }, { itemId: 'other-task' });
  assert.throws(() => planner.updateItem(state, () => {}, user, item.id, { title: '不应保存', dueAt: 'bad' }));
  assert.equal(item.title, '会议');
  assert.equal(planner.updateItem(state, () => {}, { id: 'bob' }, item.id, { title: '不应修改' }), null);
  planner.updateItem(state, () => {}, user, item.id, { title: '改期会议', dueAt: '2026-10-17T10:00:00+08:00', scheduled: false });
  assert.equal(item.dueAt, '2026-10-17T02:00:00.000Z');
  assert.equal(item.scheduled, false);
  assert.deepEqual(state.reminderDeliveries, [{ itemId: 'other-task' }]);
});

test('old completed tasks never hide pending plans from the workspace', () => {
  const state = { plannerItems: Array.from({ length: 110 }, (_, i) => ({ id: String(i), userId: 'alice', done: true, dueAt: '2020-01-01', completedAt: `2020-01-${String(i % 28 + 1).padStart(2, '0')}` })) };
  state.plannerItems.push({ id: 'future', userId: 'alice', done: false, dueAt: '2026-10-17' }, { id: 'private', userId: 'bob', done: false });
  const items = planner.listItems(state, { id: 'alice' });
  assert.equal(items.length, 101);
  assert.ok(items.some(item => item.id === 'future'));
  assert.ok(!items.some(item => item.id === 'private'));
});
