const test = require('node:test');
const assert = require('node:assert/strict');
const { subscribe, unsubscribe, deliverDue, validSubscription } = require('../lib/reminders');

const a = { endpoint: 'https://fcm.googleapis.com/fcm/send/device-a', keys: { p256dh: 'a'.repeat(48), auth: 'b'.repeat(24) } };
const b = { endpoint: 'https://web.push.apple.com/device-b', keys: { p256dh: 'c'.repeat(48), auth: 'd'.repeat(24) } };
test('push subscriptions reject arbitrary destinations and stay account scoped', () => {
  assert.throws(() => validSubscription({ ...a, endpoint: 'https://127.0.0.1/internal' }), /不支持/);
  const state = { pushSubscriptions: [] }; const save = () => {};
  subscribe(state, save, { id: 'alice' }, a);
  subscribe(state, save, { id: 'bob' }, b);
  unsubscribe(state, save, { id: 'alice' }, b.endpoint);
  assert.equal(state.pushSubscriptions.length, 2);
  unsubscribe(state, save, { id: 'alice' }, a.endpoint);
  assert.deepEqual(state.pushSubscriptions.map(row => row.userId), ['bob']);
});

test('due reminders send once per device and skip paused, completed and other users', async () => {
  const now = Date.parse('2026-10-14T08:00:00Z');
  const item = (id, userId, fields = {}) => ({ id, userId, title: id, dueAt: new Date(now - 1000).toISOString(), done: false, scheduled: true, ...fields });
  const state = { users: [{ id: 'alice', active: true }, { id: 'bob', active: true }], plannerItems: [item('one', 'alice'), item('paused', 'alice', { scheduled: false }), item('done', 'alice', { done: true }), item('other', 'bob')], pushSubscriptions: [{ ...a, userId: 'alice' }, { ...b, userId: 'bob' }], reminderDeliveries: [] };
  const delivered = []; const send = async (subscription, payload) => delivered.push({ endpoint: subscription.endpoint, payload: JSON.parse(payload) });
  const save = () => {};
  assert.equal(await deliverDue({ state, save, send, now }), 2);
  assert.equal(await deliverDue({ state, save, send, now }), 0);
  assert.deepEqual(delivered.map(row => row.payload.itemId), ['one', 'other']);
  assert.deepEqual(delivered.map(row => row.endpoint), [a.endpoint, b.endpoint]);
});

test('push failures back off and recent missed reminders catch up after restart', async () => {
  const now = Date.now(), dueAt = new Date(now - 3600000).toISOString();
  const state = { users: [{ id: 'alice', active: true }], plannerItems: [{ id: 'missed', userId: 'alice', title: 'Missed task', dueAt }], pushSubscriptions: [{ ...a, userId: 'alice' }], reminderDeliveries: [] };
  let calls = 0;
  const send = async () => { calls++; if (calls === 1) throw new Error('temporary outage'); };
  assert.equal(await deliverDue({ state, save: () => {}, send, now }), 0);
  assert.equal(state.reminderDeliveries[0].status, 'failed');
  await deliverDue({ state, save: () => {}, send, now: now + 10000 }); assert.equal(calls, 1);
  assert.equal(await deliverDue({ state, save: () => {}, send, now: now + 120000 }), 1);
  assert.equal(state.reminderDeliveries[0].status, 'sent');
  await deliverDue({ state, save: () => {}, send, now: now + 130000 }); assert.equal(calls, 2);
});

test('new subscriptions do not get old reminders and expired endpoints are removed', async () => {
  const now = Date.now(), dueAt = new Date(now - 1000).toISOString();
  const state = { users: [{ id: 'alice', active: true }], plannerItems: [{ id: 'task', userId: 'alice', title: 'Task', dueAt }], pushSubscriptions: [{ ...a, userId: 'alice', createdAt: new Date(now).toISOString() }], reminderDeliveries: [] };
  let calls = 0; const send = async () => { calls++; const error = new Error('Gone'); error.statusCode = 410; throw error; };
  await deliverDue({ state, save: () => {}, send, now }); assert.equal(calls, 0);
  state.pushSubscriptions[0].createdAt = new Date(now - 10000).toISOString();
  await deliverDue({ state, save: () => {}, send, now }); assert.equal(calls, 1); assert.equal(state.pushSubscriptions.length, 0);
});
