'use strict';

const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline/promises');
const { stdin, stdout } = require('node:process');
const { dataDir } = require('../lib/store');
const { createMailer } = require('../lib/mailer');

async function hiddenPrompt(label) {
  if (!stdin.isTTY || !stdin.setRawMode) throw new Error('请在服务器本机交互式终端运行此命令');
  stdout.write(label);
  stdin.setRawMode(true);
  stdin.resume();
  let value = '';
  return new Promise((resolve, reject) => {
    const restore = () => { stdin.setRawMode(false); stdin.pause(); stdout.write('\n'); };
    const onData = chunk => {
      for (const byte of chunk) {
        if (byte === 3) { stdin.off('data', onData); restore(); reject(new Error('已取消')); return; }
        if (byte === 13 || byte === 10) { stdin.off('data', onData); restore(); resolve(value); return; }
        if (byte === 127 || byte === 8) { if (value) { value = value.slice(0, -1); stdout.write('\b \b'); } continue; }
        const character = String.fromCharCode(byte);
        if (/\s/.test(character)) continue;
        value += character; stdout.write('*');
      }
    };
    stdin.on('data', onData);
  });
}

async function main() {
  const prompt = readline.createInterface({ input: stdin, output: stdout });
  const email = String(await prompt.question('Gmail 地址：')).trim().toLowerCase();
  prompt.close();
  if (!/^[^\s@]+@gmail\.com$/i.test(email)) throw new Error('请输入完整的 @gmail.com 地址');
  const password = (await hiddenPrompt('16 位应用专用密码（输入会隐藏）：')).replace(/\s/g, '');
  if (password.length !== 16) throw new Error('应用专用密码应为 16 位');
  const configuration = {
    SMTP_HOST: 'smtp.gmail.com', SMTP_PORT: '587', SMTP_SECURE: 'false',
    SMTP_USER: email, SMTP_PASSWORD: password, MAIL_FROM: email
  };
  stdout.write('正在验证 Gmail SMTP…\n');
  const mailer = createMailer(configuration);
  await mailer.verify();
  fs.mkdirSync(dataDir, { recursive: true });
  const target = path.join(dataDir, 'smtp-config.json'), temp = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(configuration, null, 2), { mode: 0o600 });
  fs.renameSync(temp, target);
  fs.chmodSync(target, 0o600);
  stdout.write(`配置成功：${email}\n网站会自动读取新配置。\n`);
}

main().catch(error => { console.error(`配置失败：${error.message}`); process.exitCode = 1; });
