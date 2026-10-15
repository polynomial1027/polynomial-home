const test = require('node:test'), assert = require('node:assert/strict');
const { JobScheduler, nextTime } = require('../lib/jobs');
const security = require('../lib/security');
test('scheduler serializes work, persists failures and does not retry uncertain AI calls automatically', async () => {
  let now = Date.parse('2026-10-15T03:00:00+08:00'), attempts = 0;
  const state = { settings: { assistantReviewFrequency: 'daily', automaticBackup: false } };
  const scheduler = new JobScheduler({ state, save: () => {}, now: () => now, handlers: { health: { ready: () => true, run: async () => { attempts++; throw new Error('disk error'); } }, review: { ready: () => true, run: async () => { attempts++; return { status: 'failed', error: 'uncertain usage' }; } } } });
  const health = state.scheduledJobs.find(job => job.kind === 'health');
  await scheduler.tick({ id: 'health', manual: true }); assert.equal(health.status, 'retrying');
  assert.equal(attempts, 1); await scheduler.control('health', 'pause'); await scheduler.tick(); assert.equal(attempts, 2); // review only
  const review = state.scheduledJobs.find(job => job.kind === 'review'); assert.equal(review.status, 'failed'); assert.equal(review.nextAttemptAt, null);
  await scheduler.tick(); assert.equal(attempts, 2);
  await scheduler.control('health', 'resume'); now += 6 * 60000; await scheduler.tick(); assert.equal(attempts, 3);
  review.status = 'running'; const interrupted = new JobScheduler({ state, save: () => {}, now: () => now, handlers: {} });
  assert.equal(interrupted.overview().jobs.find(job => job.kind === 'review').status, 'interrupted');
  assert.equal(nextTime('review', 'weekly', Date.parse('2026-10-18T20:00:00+08:00')), '2026-10-18T18:15:00.000Z');
});
test('scheduled work waits during peak but explicit manual inspection can run', async () => {
  let calls = 0; const state = { settings: { assistantReviewFrequency: 'off', automaticBackup: false } };
  const scheduler = new JobScheduler({ state, save: () => {}, now: () => Date.parse('2026-10-15T10:00:00+08:00'), handlers: { health: { ready: () => true, run: async () => { calls++; return {}; } } } });
  await scheduler.tick(); assert.equal(calls, 0); await scheduler.tick({ id: 'health', manual: true }); assert.equal(calls, 1);
});
test('TOTP follows RFC 6238, rejects replay and consumes recovery codes once', () => {
  const secret = security.encode(Buffer.from('12345678901234567890'));
  assert.equal(security.codeAt(secret, 1), '287082');
  const user = { username: 'owner' }, now = 60000;
  const setup = security.beginSetup(user, now), code = security.codeAt(setup.secret, Math.floor(now / 30000));
  const codes = security.finishSetup(user, code, now);
  assert.equal(security.verifyFactor(user, code, now), false);
  assert.equal(security.verifyFactor(user, codes[0], now), true); assert.equal(security.verifyFactor(user, codes[0], now), false);
  assert.ok(security.passwordError('short', 'admin')); assert.equal(security.passwordError('a-long-admin-password', 'admin'), null);
});
test('retention removes conversations but preserves token and cost evidence', () => {
  const old = new Date(Date.now() - 100 * 86400000).toISOString();
  const state = { settings: { aiRecordRetentionDays: 90, auditRetentionDays: 30 }, assistantUsage: [{ at: old, tokens: 20, detail: { source: 'chat', messages: ['private'], response: 'private', displayedResponse: 'private', usage: { totalTokens: 20 }, pricing: { rates: {} } } }], assistantChats: [{ at: old }], adminButlerChats: [], auditLogs: [{ at: old }] };
  assert.equal(security.pruneSensitiveRecords(state), true);
  assert.equal(state.assistantChats.length, 0); assert.equal(state.auditLogs.length, 0);
  assert.equal(state.assistantUsage[0].detail.messages, undefined); assert.equal(state.assistantUsage[0].detail.displayedResponse, undefined); assert.equal(state.assistantUsage[0].detail.usage.totalTokens, 20);
});
