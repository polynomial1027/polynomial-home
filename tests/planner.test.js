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
