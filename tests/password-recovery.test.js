'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createRecoveryRequest, consumeRecoveryRequest, requestFile } = require('../lib/password-recovery');

const temporaryDirectory = () => fs.mkdtempSync(path.join(os.tmpdir(), 'polynomial-recovery-'));

test('恢复码只保存摘要、可使用一次，并忽略分隔符和大小写', t => {
  const recoveryDir = temporaryDirectory();
  t.after(() => fs.rmSync(recoveryDir, { recursive: true, force: true }));
  const { code } = createRecoveryRequest(recoveryDir, 'Polynomial', { code: 'ABCD-EFGH-JK23', now: 1000 });
  const stored = fs.readFileSync(requestFile(recoveryDir, 'polynomial'), 'utf8');
  assert.equal(code, 'ABCD-EFGH-JK23');
  assert.doesNotMatch(stored, /ABCD-EFGH-JK23/);
  assert.deepEqual(consumeRecoveryRequest(recoveryDir, 'POLYNOMIAL', 'abcd efgh jk23', { now: 2000 }), { ok: true });
  assert.deepEqual(consumeRecoveryRequest(recoveryDir, 'polynomial', code, { now: 2000 }), { ok: false, reason: 'invalid' });
});

test('错误五次或超过有效期后恢复码失效', t => {
  const recoveryDir = temporaryDirectory();
  t.after(() => fs.rmSync(recoveryDir, { recursive: true, force: true }));
  createRecoveryRequest(recoveryDir, 'admin', { code: '2345-6789-ABCD', now: 1000, ttlMs: 1000 });
  assert.deepEqual(consumeRecoveryRequest(recoveryDir, 'admin', 'wrong', { now: 3000 }), { ok: false, reason: 'invalid' });
  assert.equal(fs.existsSync(requestFile(recoveryDir, 'admin')), false);

  createRecoveryRequest(recoveryDir, 'admin', { code: '2345-6789-ABCD', now: 1000 });
  for (let attempt = 0; attempt < 5; attempt++) assert.equal(consumeRecoveryRequest(recoveryDir, 'admin', 'wrong', { now: 2000 }).ok, false);
  assert.equal(fs.existsSync(requestFile(recoveryDir, 'admin')), false);
});
