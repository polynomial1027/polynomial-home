'use strict';

const nodemailer = require('nodemailer');
const fs = require('node:fs');
const path = require('node:path');

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[character]));

function createMailer(environment = process.env) {
  const host = String(environment.SMTP_HOST || '').trim();
  const user = String(environment.SMTP_USER || '').trim();
  const rawPassword = String(environment.SMTP_PASSWORD || '');
  const password = host === 'smtp.gmail.com' ? rawPassword.replace(/\s/g, '') : rawPassword;
  const port = Number(environment.SMTP_PORT || 587);
  const secure = String(environment.SMTP_SECURE || '').toLowerCase() === 'true' || port === 465;
  const from = String(environment.MAIL_FROM || user).trim();
  const enabled = Boolean(host && user && password && from && Number.isSafeInteger(port) && port > 0 && port <= 65535);
  if (!enabled) return { enabled: false, async verify() { return false; }, async sendPasswordRecovery() { throw new Error('邮件服务尚未配置'); } };

  const transport = nodemailer.createTransport({
    host, port, secure, requireTLS: !secure,
    auth: { user, pass: password },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000
  });

  return {
    enabled: true,
    verify: () => transport.verify(),
    sendPasswordRecovery: ({ to, displayName, code, expiresAt }) => {
      const expires = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', dateStyle: 'medium', timeStyle: 'medium' }).format(new Date(expiresAt));
      return transport.sendMail({
        from: `Polynomial Server <${from}>`,
        to,
        subject: 'Polynomial Server 密码恢复码',
        text: `${displayName || '你好'}：\n\n你的密码恢复码是：${code}\n\n有效期至（北京时间）：${expires}\n恢复码只能使用一次。若不是你申请的，请忽略这封邮件。`,
        html: `<div style="font-family:system-ui,sans-serif;max-width:560px;margin:auto;padding:24px;color:#132238"><h2>Polynomial Server 密码恢复</h2><p>${escapeHtml(displayName || '你好')}：</p><p>你的密码恢复码是：</p><p style="font-size:32px;font-weight:800;letter-spacing:.25em;color:#087ea4">${escapeHtml(code)}</p><p>有效期至（北京时间）：${escapeHtml(expires)}</p><p style="color:#607080">恢复码只能使用一次。若不是你申请的，请忽略这封邮件。</p></div>`
      });
    }
  };
}

function loadMailerConfiguration(dataDir, environment = process.env) {
  const configFile = path.join(dataDir, 'smtp-config.json');
  let saved = {};
  try { saved = JSON.parse(fs.readFileSync(configFile, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  return { configuration: { ...environment, ...saved }, configFile };
}

module.exports = { createMailer, loadMailerConfiguration };
