const fs = require('node:fs/promises');
const path = require('node:path');
const { extractVerified } = require('../lib/backups');
async function main() {
  const [archive, destination] = process.argv.slice(2);
  if (!archive || !destination || !path.isAbsolute(destination)) throw new Error('用法：node scripts/restore-backup.js /绝对路径/backup.tar.gz /新的空目录（先停服务，再用验证后的目录替换原数据目录）');
  const metadata = JSON.parse(await fs.readFile(archive.replace(/\.tar\.gz$/, '.json'), 'utf8'));
  await fs.mkdir(destination, { recursive: true, mode: 0o700 });
  if ((await fs.readdir(destination)).length) throw new Error('恢复目标必须为空目录，不能覆盖正在使用的数据');
  const result = await extractVerified(path.resolve(archive), metadata.sha256, destination);
  console.log(`恢复验证完成：${result.files.length} 个文件。请保留原目录，停止服务后切换 POLYNOMIAL_DATA_DIR，再启动服务。`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
