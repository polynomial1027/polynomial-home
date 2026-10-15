const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { StateDatabase } = require('../lib/database');
const { BackupService, extractVerified } = require('../lib/backups');

test('SQLite preserves order and empty collections, applies deletes and rejects stale writers atomically', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'polynomial-db-'));
  const db = new StateDatabase(dir); let other;
  try {
    const state = { users: [{ id: 'a', displayName: 'A' }, { id: 'b', displayName: 'B' }], settings: { enabled: true }, empty: [] };
    db.write(state); assert.deepEqual(db.read(), state);
    other = new StateDatabase(dir); const stale = other.read();
    state.users.reverse(); state.users[0].displayName = 'B2'; db.write(state); assert.deepEqual(db.read(), state);
    stale.settings.enabled = false; assert.throws(() => other.write(stale), /另一个进程/);
    assert.equal(db.read().settings.enabled, true);
    state.users = []; db.write(state); assert.deepEqual(db.read().users, []); assert.equal(db.check(), true);
  } finally { other?.close(); db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('backup restores the actual database and shared files and detects corruption', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'polynomial-backup-')), db = new StateDatabase(dir);
  const service = new BackupService({ dataDir: dir, database: db });
  try {
    db.write({ users: [{ id: 'admin' }], settings: {}, chats: [] });
    fs.mkdirSync(path.join(dir, 'drive')); fs.writeFileSync(path.join(dir, 'drive', 'file'), 'real file bytes');
    const row = await service.create(); assert.ok(row.verifiedAt); assert.equal(row.fileCount, 2);
    assert.equal(service.list().length, 1);
    const destination = path.join(dir, 'restore'); fs.mkdirSync(destination);
    await extractVerified(path.join(service.directory, `${row.id}.tar.gz`), row.sha256, destination);
    const restored = new StateDatabase(destination); assert.equal(restored.read().users[0].id, 'admin'); restored.close();
    assert.equal(fs.readFileSync(path.join(destination, 'drive', 'file'), 'utf8'), 'real file bytes');
    fs.appendFileSync(path.join(service.directory, `${row.id}.tar.gz`), 'corrupt');
    await assert.rejects(service.verify(row.id), /校验失败/); assert.equal(service.busy, false);
  } finally { db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('legacy JSON migrates once and is never used to overwrite newer SQLite records', () => {
  const { spawnSync } = require('node:child_process');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'polynomial-migrate-'));
  try {
    fs.writeFileSync(path.join(dir, 'store.json'), JSON.stringify({ users: [{ id: 'u', username: 'old-user', displayName: 'Original' }], settings: {} }));
    const result = spawnSync(process.execPath, ['-e', "const s=require('./lib/store');const data=s.load();data.users[0].displayName='Updated';s.save(data);s.getDatabase().close();"], { cwd: path.join(__dirname, '..'), env: { ...process.env, POLYNOMIAL_DATA_DIR: dir } });
    assert.equal(result.status, 0, result.stderr.toString());
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'store-before-sqlite.json'))).users[0].displayName, 'Original');
    const db = new StateDatabase(dir); assert.equal(db.read().users[0].displayName, 'Updated'); db.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('installer imports ignore macOS archive metadata', () => {
  const { spawnSync } = require('node:child_process');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'polynomial-import-')), source = path.join(dir, 'packages'), data = path.join(dir, 'data');
  try {
    fs.mkdirSync(source);
    fs.writeFileSync(path.join(source, 'Polynomial-0.3.8-linux-x64.deb'), 'installer');
    fs.writeFileSync(path.join(source, '._Polynomial-0.3.8-linux-x64.deb'), 'archive metadata');
    const result = spawnSync(process.execPath, ['scripts/import-client-builds.js', source], { cwd: path.join(__dirname, '..'), env: { ...process.env, POLYNOMIAL_DATA_DIR: data, POLYNOMIAL_OFFLINE_IMPORT: '1', ADMIN_PASSWORD: 'test-admin-password', DEEPSEEK_API_KEY: '' } });
    assert.equal(result.status, 0, result.stderr.toString());
    const db = new StateDatabase(data); assert.equal(db.read().resourceDownloads.length, 1); assert.equal(db.read().driveFiles[0].originalName, 'Polynomial-0.3.8-linux-x64.deb'); db.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
