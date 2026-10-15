const test = require('node:test'), assert = require('node:assert/strict');
const { preferences, updatePreferences, history } = require('../lib/personal-space');
const member = () => ({ id: 'member', role: 'member', permissions: { driveEnabled: true, accessPlanner: true } });
test('personal favorites follow current permissions and reject stale or privileged updates', () => {
  const user = member();
  assert.deepEqual(preferences(user).favorites, ['drive', 'calendar']);
  const first = updatePreferences(user, { favorites: ['downloads', 'calendar', 'downloads'], hiddenWidgets: ['welcome'], ifUnmodifiedSince: null });
  assert.deepEqual(first.favorites, ['downloads', 'calendar']); assert.deepEqual(first.hiddenWidgets, ['welcome']);
  assert.throws(() => updatePreferences(user, { favorites: [], hiddenWidgets: [], ifUnmodifiedSince: null }), error => error.status === 409);
  for (const value of [{ favorites: ['control'] }, { favorites: ['https://untrusted.test'] }, { hiddenWidgets: ['homeOperations'] }, { userId: 'someone-else' }]) assert.throws(() => updatePreferences(user, { favorites: first.favorites, hiddenWidgets: first.hiddenWidgets, ifUnmodifiedSince: first.updatedAt, ...value }), error => error.status === 400);
  user.permissions.accessPlanner = false; assert.deepEqual(preferences(user).favorites, ['downloads']);
});
test('own assistant history searches retained messages, paginates and never exposes other accounts or usage details', () => {
  const state = { settings: { aiRecordRetentionDays: 90 }, assistantChats: Array.from({ length: 25 }, (_, index) => ({ userId: 'member', role: 'user', content: `plan ${index}`, at: '2026-10-14T17:00:00Z', usageRecordId: 'private-record' })) };
  state.assistantChats.push({ userId: 'admin', role: 'assistant', content: 'admin private message', at: '2026-10-14T17:00:00Z' });
  const page = history(state, member(), new URLSearchParams('date=2026-10-15&page=2'));
  assert.equal(page.total, 25); assert.equal(page.messages.length, 5); assert.equal(page.pages, 2);
  assert.deepEqual(Object.keys(page.messages[0]).sort(), ['at', 'content', 'role']);
  assert.equal(history(state, member(), new URLSearchParams('q=admin')).total, 0);
  assert.equal(history(state, member(), new URLSearchParams('date=2026-10-14')).total, 0);
  assert.throws(() => history(state, member(), new URLSearchParams('date=2026-02-30')), /有效日期/);
});
