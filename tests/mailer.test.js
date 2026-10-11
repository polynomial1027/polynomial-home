'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createMailer, loadMailerConfiguration } = require('../lib/mailer');

test('缺少 SMTP 密钥时邮件服务保持关闭', async () => {
  const mailer = createMailer({ SMTP_HOST: 'smtp.gmail.com', SMTP_USER: 'polynomial1027@gmail.com' });
  assert.equal(mailer.enabled, false);
  assert.equal(await mailer.verify(), false);
  await assert.rejects(() => mailer.sendPasswordRecovery({}), /尚未配置/);
});

test('私有 SMTP 配置文件覆盖环境变量但不会进入账号数据', t => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'polynomial-mailer-'));
  t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dataDir, 'smtp-config.json'), JSON.stringify({ SMTP_USER: 'saved@gmail.com', SMTP_PASSWORD: 'secret' }), { mode: 0o600 });
  const loaded = loadMailerConfiguration(dataDir, { SMTP_USER: 'environment@gmail.com', SMTP_HOST: 'smtp.gmail.com' });
  assert.equal(loaded.configuration.SMTP_USER, 'saved@gmail.com');
  assert.equal(loaded.configuration.SMTP_PASSWORD, 'secret');
  assert.equal(loaded.configuration.SMTP_HOST, 'smtp.gmail.com');
});
