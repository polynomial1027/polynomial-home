const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { DatabaseSync } = require('node:sqlite');
const exec = promisify(execFile);
const validId = value => /^backup-[0-9T-]+-[a-f0-9]{8}$/.test(value);
async function digest(file) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
async function inventory(directory, prefix = '') {
  const rows = [];
  for (const entry of await fsp.readdir(path.join(directory, prefix), { withFileTypes: true })) {
    const name = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink() || (!entry.isFile() && !entry.isDirectory())) throw new Error('备份不允许符号链接或特殊文件');
    if (entry.isDirectory()) rows.push(...await inventory(directory, name));
    else rows.push({ path: name, size: (await fsp.stat(path.join(directory, name))).size, sha256: await digest(path.join(directory, name)) });
  }
  return rows;
}
function safeEntry(name) { return name !== '' && !name.startsWith('/') && !name.includes('\\') && !name.split('/').includes('..'); }
async function extractVerified(archive, expectedHash, destination) {
  if (await digest(archive) !== expectedHash) throw new Error('备份归档校验失败');
  const listing = await exec('tar', ['-tzf', archive], { maxBuffer: 32 * 1024 * 1024 });
  if (!listing.stdout.split('\n').filter(Boolean).every(safeEntry)) throw new Error('备份路径不安全');
  const types = await exec('tar', ['-tvzf', archive], { maxBuffer: 32 * 1024 * 1024 });
  if (types.stdout.split('\n').filter(Boolean).some(line => !/^[d-]/.test(line))) throw new Error('备份包含不支持的文件类型');
  await exec('tar', ['-xzf', archive, '-C', destination], { maxBuffer: 1024 * 1024 });
  const manifest = JSON.parse(await fsp.readFile(path.join(destination, 'manifest.json'), 'utf8'));
  if (manifest.schema !== 1 || !Array.isArray(manifest.files)) throw new Error('不支持的备份格式');
  const actual = await inventory(destination);
  const expected = new Map(manifest.files.map(row => [row.path, row]));
  if (expected.size !== manifest.files.length || actual.length !== expected.size + 1) throw new Error('备份文件数量不匹配');
  for (const row of actual.filter(row => row.path !== 'manifest.json')) {
    const stored = expected.get(row.path);
    if (!stored || stored.sha256 !== row.sha256 || stored.size !== row.size) throw new Error('备份文件校验失败');
  }
  const db = new DatabaseSync(path.join(destination, 'store.sqlite'), { readOnly: true });
  try { if (db.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') throw new Error('备份数据库损坏'); }
  finally { db.close(); }
  return manifest;
}
class BackupService {
  constructor({ dataDir, database, beforeSnapshot = async () => {}, directory = process.env.POLYNOMIAL_BACKUP_DIR || path.join(dataDir, 'backups') }) {
    this.beforeSnapshot = beforeSnapshot; this.dataDir = dataDir; this.database = database; this.directory = path.resolve(directory); this.busy = false;
    if (this.directory === path.resolve(dataDir)) throw new Error('备份目录不能等于数据目录');
    fs.mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    fs.chmodSync(this.directory, 0o700);
  }
  list() {
    return fs.readdirSync(this.directory).filter(name => name.endsWith('.json') && validId(name.slice(0, -5))).flatMap(name => {
      try { const row = JSON.parse(fs.readFileSync(path.join(this.directory, name), 'utf8')); return fs.existsSync(path.join(this.directory, `${row.id}.tar.gz`)) ? [row] : []; } catch { return []; }
    }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  get(id) { return validId(id) ? this.list().find(row => row.id === id) : null; }
  async create({ source = 'manual', retention = 7 } = {}) {
    if (this.busy) throw new Error('备份或恢复验证正在进行');
    this.busy = true;
    const stage = await fsp.mkdtemp(path.join(this.directory, '.stage-'));
    const id = `backup-${new Date().toISOString().replace(/[:.Z]/g, '-')}-${crypto.randomBytes(4).toString('hex')}`;
    const archive = path.join(this.directory, `${id}.tar.gz`);
    try {
      await this.beforeSnapshot();
      for (const name of ['drive', 'uploads', 'push-vapid.json']) {
        const file = path.join(this.dataDir, name);
        if (fs.existsSync(file)) await fsp.cp(file, path.join(stage, name), { recursive: true, dereference: false });
      }
      await this.database.snapshot(path.join(stage, 'store.sqlite'));
      const files = await inventory(stage);
      const createdAt = new Date().toISOString();
      await fsp.writeFile(path.join(stage, 'manifest.json'), JSON.stringify({ schema: 1, createdAt, files, excludes: ['运行环境密钥文件', '数据目录之外的 Notebook 容器卷'] }), { mode: 0o600 });
      await exec('tar', ['-czf', `${archive}.tmp`, '-C', stage, '.'], { timeout: 30 * 60_000, maxBuffer: 1024 * 1024 });
      await fsp.chmod(`${archive}.tmp`, 0o600); await fsp.rename(`${archive}.tmp`, archive);
      const row = { id, source, createdAt, size: (await fsp.stat(archive)).size, sha256: await digest(archive), fileCount: files.length, verifiedAt: null };
      // Every completed backup is restored into an isolated directory and checked.
      const verified = await this.verifyArchive(row); row.verifiedAt = verified.verifiedAt;
      await fsp.writeFile(path.join(this.directory, `${id}.json.tmp`), JSON.stringify(row), { mode: 0o600 });
      await fsp.rename(path.join(this.directory, `${id}.json.tmp`), path.join(this.directory, `${id}.json`));
      const automated = this.list().filter(item => item.source === 'auto');
      for (const old of automated.slice(Math.max(1, retention))) for (const extension of ['.json', '.tar.gz']) await fsp.rm(path.join(this.directory, old.id + extension), { force: true });
      return row;
    } catch (error) { await fsp.rm(archive, { force: true }); await fsp.rm(`${archive}.tmp`, { force: true }); throw error; }
    finally { await fsp.rm(stage, { recursive: true, force: true }); this.busy = false; }
  }
  async verifyArchive(row) {
    const target = await fsp.mkdtemp(path.join(os.tmpdir(), 'polynomial-restore-check-'));
    try { const manifest = await extractVerified(path.join(this.directory, `${row.id}.tar.gz`), row.sha256, target); return { verifiedAt: new Date().toISOString(), fileCount: manifest.files.length }; }
    finally { await fsp.rm(target, { recursive: true, force: true }); }
  }
  async verify(id) {
    const row = this.get(id); if (!row) throw new Error('备份不存在');
    if (this.busy) throw new Error('备份或恢复验证正在进行'); this.busy = true;
    try { Object.assign(row, await this.verifyArchive(row)); await fsp.writeFile(path.join(this.directory, `${id}.json`), JSON.stringify(row), { mode: 0o600 }); return row; }
    finally { this.busy = false; }
  }
}
module.exports = { BackupService, digest, extractVerified, inventory };
