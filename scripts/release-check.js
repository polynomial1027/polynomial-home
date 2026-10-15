const { StateDatabase } = require('../lib/database');
const fs = require('node:fs');
async function main() {
  const base = process.argv[2] || 'http://127.0.0.1:3000';
  const [health, clients, downloads, announcements] = await Promise.all(['/api/health', '/api/client/releases', '/api/downloads', '/api/announcements'].map(async route => {
    const response = await fetch(new URL(route, base), { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`${route}: HTTP ${response.status}`); return response.json();
  }));
  if (!health.ok || health.version !== require('../package.json').version || clients.uiVersion !== health.version) throw new Error('发布版本检查失败');
  if (!announcements.announcements.some(row => row.id === 'interface-v039')) throw new Error('缺少更新公告');
  for (const file of downloads.resources.filter(row => row.category === 'client' && row.version === clients.recommendedVersion && row.downloadUrl)) {
    if (!file.sha256) continue;
    const response = await fetch(new URL(file.downloadUrl, base), { signal: AbortSignal.timeout(60000) });
    if (!response.ok) throw new Error('安装包下载失败');
    const hash = require('node:crypto').createHash('sha256'); for await (const chunk of response.body) hash.update(chunk);
    if (hash.digest('hex') !== file.sha256) throw new Error('安装包校验失败');
  }
  if (process.env.POLYNOMIAL_DATA_DIR && fs.existsSync(require('node:path').join(process.env.POLYNOMIAL_DATA_DIR, 'store.sqlite'))) {
    const db = new StateDatabase(process.env.POLYNOMIAL_DATA_DIR);
    try { if (!db.check()) throw new Error('生产数据库校验失败'); } finally { db.close(); }
  }
  console.log(`发布检查通过：界面 ${health.version}，公告、客户端下载及 SHA-256 校验通过。`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
