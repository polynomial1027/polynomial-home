const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const assistant = require('../lib/assistant');

const settings = {
  assistantDailyTokens: 100, assistantMonthlyTokens: 200,
  assistantDailyRequests: 2, assistantMonthlyRequests: 3,
  assistantDefaultUserDailyTokens: 80, assistantDefaultUserMonthlyTokens: 160,
  assistantDefaultUserDailyRequests: 1, assistantDefaultUserMonthlyRequests: 2
};

test('AI reservations enforce both user and site caps before a provider call', () => {
  const state = { settings, assistantUsage: [] }, save = () => {};
  const alice = { id: 'alice', assistantLimits: {} }, bob = { id: 'bob', assistantLimits: { dailyTokens: 30, dailyRequests: 2 } };
  assistant.reserve(state, save, alice, 70);
  assert.throws(() => assistant.reserve(state, save, alice, 1), /上限/);
  assert.throws(() => assistant.reserve(state, save, bob, 31), /上限/);
  assistant.reserve(state, save, bob, 30);
  assert.throws(() => assistant.reserve(state, save, bob, 1), /上限/);
  assert.equal(assistant.usage(state).dailyTokens, 100);
});

test('failed exchange retains reservation because upstream may bill it', () => {
  const state = { settings, assistantUsage: [] }, save = () => {};
  const record = assistant.reserve(state, save, { id: 'alice' }, 40);
  assistant.finish(state, save, record, 0, 'failed');
  assert.equal(assistant.usage(state, 'alice').dailyTokens, 40);
  assert.equal(assistant.usage(state, 'alice').dailyRequests, 1);
});

test('explicit independent lab budget retains audit but cannot consume or change ordinary assistant caps', () => {
  const state = { settings, assistantUsage: [] }, save = () => {}, user = { id: 'alice' };
  assert.throws(() => assistant.reserve(state, save, user, 1000), /上限/);
  const record = assistant.reserve(state, save, user, 1000, null, { independentBudget: true });
  assert.equal(record.independentBudget, true);
  assert.equal(assistant.usage(state).dailyTokens, 1000);
  assert.equal(assistant.usage(state, null, new Date(), true).dailyTokens, 0);
  assistant.reserve(state, save, user, 70);
  assert.throws(() => assistant.reserve(state, save, user, 1), /上限/);
});

test('administrator settings reject invalid limits', () => {
  assert.throws(() => assistant.validateSettings({ assistantMaxOutputTokens: 0 }));
  assert.throws(() => assistant.validateUserLimits({ dailyTokens: -1 }));
  assert.deepEqual(assistant.validateUserLimits({ dailyTokens: null, monthlyRequests: 5 }), { dailyTokens: null, monthlyRequests: 5 });
});

test('provider adapter sends bounded chat completion and reads reported usage', async () => {
  const server = http.createServer((req, res) => {
    assert.equal(req.headers.authorization, 'Bearer test-key');
    let raw = '';
    req.on('data', chunk => { raw += chunk; });
    req.on('end', () => {
      const payload = JSON.parse(raw);
      assert.equal(payload.model, 'deepseek-flash');
      assert.equal(payload.max_tokens, 128);
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ choices: [{ message: { content: '测试回答' } }], usage: { total_tokens: 42 } }));
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const result = await assistant.complete({ key: 'test-key', model: 'deepseek-flash', messages: [{ role: 'user', content: '你好' }], maxOutput: 128, endpoint: `http://127.0.0.1:${server.address().port}/chat/completions` });
    assert.equal(result.content, '测试回答');
    assert.equal(result.tokens, 42);
    assert.equal(result.usage.totalTokens, 42);
    assert.equal(result.usage.inputTokens, null);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
