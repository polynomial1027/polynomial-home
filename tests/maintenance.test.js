const test = require('node:test');
const assert = require('node:assert/strict');
const { parseReview, executeSafeActions, runReview } = require('../lib/maintenance');

const settings = {
  assistantEnabled: true, assistantAutoMaintenance: true, assistantMaxOutputTokens: 256,
  assistantDailyTokens: 100000, assistantMonthlyTokens: 100000,
  assistantDailyRequests: 10, assistantMonthlyRequests: 10,
  assistantDefaultUserDailyTokens: 100000, assistantDefaultUserMonthlyTokens: 100000,
  assistantDefaultUserDailyRequests: 10, assistantDefaultUserMonthlyRequests: 10
};

test('AI review accepts only listed safe action and never interprets commands', () => {
  const result = parseReview(JSON.stringify({ summary: '<script>请检查登录</script>', risk: 'warning', actions: ['cleanup_expired_sessions', 'sudo rm -rf /'] }));
  assert.deepEqual(result.actions, ['cleanup_expired_sessions']);
  assert.equal(result.risk, 'warning');
  assert.throws(() => parseReview('{"summary":""}'));
});

test('safe cleanup removes expired sessions only', () => {
  const state = { sessions: [{ token: 'expired', expiresAt: '2020-01-01T00:00:00Z' }, { token: 'active', expiresAt: '2099-01-01T00:00:00Z' }] };
  assert.deepEqual(executeSafeActions(state, () => {}, ['cleanup_expired_sessions'], new Date('2026-10-12T00:00:00Z')), [{ id: 'cleanup_expired_sessions', removed: 1 }]);
  assert.deepEqual(state.sessions.map(item => item.token), ['active']);
});

test('manual AI maintenance shares quota and records executed action', async () => {
  const state = { settings: { ...settings }, assistantUsage: [], assistantReviews: [], sessions: [{ token: 'expired', expiresAt: '2020-01-01T00:00:00Z' }] };
  const report = { day: '2026-10-12', loginSuccess: 1, loginFailed: 0, suspicious: [], systemLogin: { status: 'unavailable', accepted: 0, failed: 0 }, memory: { totalMB: 1024, freeMB: 512 }, disk: null, loadAverage: [0, 0, 0], uptimeHours: 24, expiredSessions: 1 };
  const review = await runReview({ state, save: () => {}, user: { id: 'admin' }, key: 'test-key', model: 'deepseek-flash', report, complete: async payload => {
    assert.equal(payload.jsonMode, true);
    return { content: JSON.stringify({ summary: '有一个过期会话，建议清理。', risk: 'normal', actions: ['cleanup_expired_sessions'] }), tokens: 120 };
  } });
  assert.equal(review.status, 'completed');
  assert.equal(review.executedActions[0].removed, 1);
  assert.equal(state.sessions.length, 0);
  assert.equal(state.assistantUsage[0].tokens, 120);
});
