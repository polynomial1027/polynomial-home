const test = require('node:test');
const assert = require('node:assert/strict');
const { localAnswer, answerWithAi } = require('../lib/admin-butler');
const { autoReviewDue } = require('../lib/maintenance');

test('review frequency checks the Shanghai day or calendar week', () => {
  const state = { settings: { assistantReviewFrequency: 'weekly' }, assistantReviews: [] };
  const monday = new Date('2026-10-12T20:00:00+08:00');
  assert.equal(autoReviewDue(state, monday), true);
  state.assistantReviews.push({ source: 'auto', createdAt: monday.toISOString() });
  assert.equal(autoReviewDue(state, new Date('2026-10-18T10:00:00+08:00')), false);
  assert.equal(autoReviewDue(state, new Date('2026-10-19T10:00:00+08:00')), true);
  state.settings.assistantReviewFrequency = 'daily';
  assert.equal(autoReviewDue(state, new Date('2026-10-13T10:00:00+08:00')), true);
  state.settings.assistantReviewFrequency = 'off';
  assert.equal(autoReviewDue(state, monday), false);
});

test('butler answers live account facts and prepares only allowlisted permission change', () => {
  const admin = { id: 'admin', username: 'owner', role: 'admin' };
  const alice = { id: 'alice', username: 'alice', displayName: 'Alice', role: 'member', permissions: { accessChat: false } };
  const state = { users: [admin, alice], auditLogs: [{ action: 'login', userId: 'alice', at: '2026-10-14T01:00:00Z' }], adminButlerActions: [] };
  assert.match(localAnswer({ message: '现在有几个人在线？', state, onlineCount: 2, admin }).reply, /2 个账号/);
  assert.match(localAnswer({ message: '@alice 上次什么时候登录？', state, onlineCount: 2, admin }).reply, /2026\/10\/14|2026-10-14/);
  const result = localAnswer({ message: '给 @alice 开通聊天权限', state, onlineCount: 2, admin });
  assert.equal(result.action.permission, 'accessChat');
  assert.equal(result.action.value, true);
  assert.equal(alice.permissions.accessChat, false);
  assert.equal(state.adminButlerActions.length, 1);
  assert.equal(localAnswer({ message: '修改 @alice 的管理员权限', state, onlineCount: 2, admin }).action, undefined);
});

test('general butler question sends only summarized context and consumes shared quota', async () => {
  const admin = { id: 'admin', assistantLimits: {} };
  const state = { settings: { assistantMaxOutputTokens: 512, assistantDailyTokens: 100000, assistantMonthlyTokens: 100000, assistantDailyRequests: 20, assistantMonthlyRequests: 20, assistantDefaultUserDailyTokens: 100000, assistantDefaultUserMonthlyTokens: 100000, assistantDefaultUserDailyRequests: 20, assistantDefaultUserMonthlyRequests: 20 }, assistantUsage: [] };
  const result = await answerWithAi({ state, save: () => {}, admin, message: '服务器情况如何？', context: { severity: 'normal' }, key: 'test', model: 'deepseek-flash', complete: async args => {
    assert.equal(args.messages.length, 2);
    assert.match(args.messages[1].content, /normal/);
    return { content: '状态正常。', tokens: 65 };
  } });
  assert.equal(result.reply, '状态正常。');
  assert.equal(state.assistantUsage[0].tokens, 65);
});
