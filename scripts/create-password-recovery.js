'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { dataDir } = require('../lib/store');
const { createRecoveryRequest } = require('../lib/password-recovery');

const args = process.argv.slice(2);
const valueAfter = flag => { const index = args.indexOf(flag); return index >= 0 ? args[index + 1] : ''; };
const username = String(valueAfter('--username') || '').trim();
if (!username) {
  console.error('用法：npm run recovery-code -- --username 管理员账号');
  process.exit(1);
}

const storeFile = path.join(dataDir, fs.existsSync(path.join(dataDir, 'store.sqlite')) ? 'store.sqlite' : 'store.json');
if (!fs.existsSync(storeFile)) {
  console.error(`找不到账号数据：${storeFile}`);
  console.error('生产服务器请先设置 POLYNOMIAL_DATA_DIR，例如 /var/lib/polynomial-server。');
  process.exit(1);
}

const { StateDatabase } = require('../lib/database');
const db = storeFile.endsWith('.sqlite') ? new StateDatabase(dataDir) : null;
const state = db ? db.read() : JSON.parse(fs.readFileSync(storeFile, 'utf8'));
db?.close();
const user = (state.users || []).find(item => item.username.toLowerCase() === username.toLowerCase());
if (!user || user.role !== 'admin' || !user.active) {
  console.error('没有找到已启用的管理员账号。');
  process.exit(1);
}

const result = createRecoveryRequest(path.join(dataDir, 'password-recovery'), user.username);
console.log(`管理员账号：${user.username}`);
console.log(`一次性恢复码：${result.code}`);
console.log(`有效期至：${new Date(result.expiresAt).toLocaleString('zh-CN')}`);
console.log('打开网站的 /recover-password.html，输入账号、4 位恢复码和新密码。');
console.log('恢复码使用一次后立即失效；重新运行本命令会使旧恢复码失效。');
