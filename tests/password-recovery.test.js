'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createRecoveryRequest, consumeRecoveryRequest, requestFile } = require('../lib/password-recovery');

const temporaryDirectory = () => fs.mkdtempSync(path.join(os.tmpdir(), 'polynomial-recovery-'));

test('四位数字恢复码只保存摘要并且只能使用一次', t => {
  const recoveryDir = temporaryDirectory();
  t.after(() => fs.rmSync(recoveryDir, { recursive: true, force: true }));
  const { code } = createRecoveryRequest(recoveryDir, 'Polynomial', { code: '0123', now: 1000 });
  const stored = fs.readFileSync(requestFile(recoveryDir, 'polynomial'), 'utf8');
  assert.equal(code, '0123');
  assert.doesNotMatch(stored, /0123/);
  assert.deepEqual(consumeRecoveryRequest(recoveryDir, 'POLYNOMIAL', '0123', { now: 2000 }), { ok: true });
  assert.deepEqual(consumeRecoveryRequest(recoveryDir, 'polynomial', code, { now: 2000 }), { ok: false, reason: 'invalid' });
});

test('错误五次或超过有效期后恢复码失效', t => {
  const recoveryDir = temporaryDirectory();
  t.after(() => fs.rmSync(recoveryDir, { recursive: true, force: true }));
  createRecoveryRequest(recoveryDir, 'admin', { code: '2345', now: 1000, ttlMs: 1000 });
  assert.deepEqual(consumeRecoveryRequest(recoveryDir, 'admin', 'wrong', { now: 3000 }), { ok: false, reason: 'invalid' });
  assert.equal(fs.existsSync(requestFile(recoveryDir, 'admin')), false);

  createRecoveryRequest(recoveryDir, 'admin', { code: '2345', now: 1000 });
  for (let attempt = 0; attempt < 5; attempt++) assert.equal(consumeRecoveryRequest(recoveryDir, 'admin', 'wrong', { now: 2000 }).ok, false);
  assert.equal(fs.existsSync(requestFile(recoveryDir, 'admin')), false);
});

test('默认恢复码为四位数字且默认有效期为两分钟', t => {
  const recoveryDir = temporaryDirectory();
  t.after(() => fs.rmSync(recoveryDir, { recursive: true, force: true }));
  const recovery = createRecoveryRequest(recoveryDir, 'admin', { now: 1000 });
  assert.match(recovery.code, /^\d{4}$/);
  assert.equal(new Date(recovery.expiresAt).getTime(), 121000);
});
