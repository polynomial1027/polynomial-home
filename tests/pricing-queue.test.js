const test = require('node:test');
const assert = require('node:assert/strict');
const { priceWindow, safeOffPeakStart } = require('../lib/pricing');
const { queueChat, processQueuedChats } = require('../lib/chat-service');

const local = value => new Date(`${value}+08:00`);
const settings = {
  assistantEnabled: true, assistantMaxOutputTokens: 128,
  assistantDailyTokens: 100000, assistantMonthlyTokens: 100000,
  assistantDailyRequests: 10, assistantMonthlyRequests: 10,
  assistantDefaultUserDailyTokens: 100000, assistantDefaultUserMonthlyTokens: 100000,
  assistantDefaultUserDailyRequests: 10, assistantDefaultUserMonthlyRequests: 10
};

test('official peak boundaries, lunch break, weekends and 2026 holidays use Shanghai time', () => {
  assert.equal(priceWindow(local('2026-10-14T08:59:00')).peak, false);
  assert.equal(priceWindow(local('2026-10-14T09:00:00')).peak, true);
  assert.equal(priceWindow(local('2026-10-14T11:59:00')).nextOffPeakAt, '2026-10-14T04:00:00.000Z');
  assert.equal(priceWindow(local('2026-10-14T12:00:00')).peak, false);
  assert.equal(priceWindow(local('2026-10-14T14:00:00')).peak, true);
  assert.equal(priceWindow(local('2026-10-14T18:00:00')).peak, false);
  assert.equal(safeOffPeakStart(local('2026-10-14T08:56:00')), false);
  assert.equal(safeOffPeakStart(local('2026-10-14T12:00:00')), true);
  assert.equal(priceWindow(local('2026-10-17T10:00:00')).peak, false);
  assert.equal(priceWindow(local('2026-10-01T10:00:00')).peak, false);
  assert.equal(priceWindow(local('2027-10-01T10:00:00')).holidayCalendarCurrent, false);
});

test('peak queued chat waits, then sends once off peak and shares quota', async () => {
  const user = { id: 'alice', active: true, assistantLimits: {} };
  const state = { users: [user], settings, assistantUsage: [], assistantChats: [], assistantQueuedChats: [] };
  const item = queueChat(state, () => {}, user, '你好', local('2026-10-14T10:00:00'));
  let calls = 0;
  const complete = async () => { calls++; return { content: '先检查待办，再安排重点任务。', tokens: 52 }; };
  const args = { state, save: () => {}, key: 'test', model: 'deepseek-flash', allowed: () => true, complete };
  assert.equal(await processQueuedChats({ ...args, clock: () => local('2026-10-14T10:00:00') }), 0);
  assert.equal(calls, 0);
  assert.equal(await processQueuedChats({ ...args, clock: () => local('2026-10-14T12:00:00') }), 1);
  assert.equal(calls, 1);
  assert.equal(item.status, 'completed');
  assert.equal(item.message, undefined);
  assert.equal(state.assistantChats.length, 2);
  assert.equal(state.assistantUsage[0].tokens, 52);
  assert.equal(await processQueuedChats({ ...args, clock: () => local('2026-10-14T12:01:00') }), 0);
  assert.equal(calls, 1);
});
