const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
function running(pid) { try { process.kill(pid, 0); return true; } catch (error) { return error.code !== 'ESRCH'; } }
function assertServiceStopped(directory) {
  const file = path.join(directory, '.service-lock.json');
  if (!fs.existsSync(file)) return;
  const lock = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (Number.isSafeInteger(lock.pid) && running(lock.pid)) throw new Error('服务器仍在运行，请先停止服务');
}
function claim(directory) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const file = path.join(directory, '.service-lock.json'), nonce = crypto.randomUUID();
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      fs.writeFileSync(file, JSON.stringify({ pid: process.pid, nonce, startedAt: new Date().toISOString() }), { flag: 'wx', mode: 0o600 });
      return { release() { try { if (JSON.parse(fs.readFileSync(file, 'utf8')).nonce === nonce) fs.unlinkSync(file); } catch {} } };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      assertServiceStopped(directory);
      try { fs.unlinkSync(file); } catch (unlinkError) { if (unlinkError.code !== 'ENOENT') throw unlinkError; }
    }
  }
  throw new Error('无法取得数据目录锁');
}
module.exports = { claim, assertServiceStopped };
