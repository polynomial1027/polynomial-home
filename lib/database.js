const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync, backup } = require('node:sqlite');

// Keep the service's existing state interface, but persist each record separately.
// A revision check prevents a second process silently overwriting this process.
class StateDatabase {
  constructor(directory) {
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    this.file = path.join(directory, 'store.sqlite');
    this.db = new DatabaseSync(this.file);
    fs.chmodSync(this.file, 0o600);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS records(collection TEXT NOT NULL, record_key TEXT NOT NULL, position INTEGER NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(collection,record_key));
      CREATE INDEX IF NOT EXISTS records_order ON records(collection,position);
      CREATE TABLE IF NOT EXISTS values_store(name TEXT PRIMARY KEY, payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS database_meta(name TEXT PRIMARY KEY, value TEXT NOT NULL);
      INSERT OR IGNORE INTO database_meta VALUES('schema','1'),('revision','0');`);
    for (const suffix of ['-wal', '-shm']) if (fs.existsSync(this.file + suffix)) fs.chmodSync(this.file + suffix, 0o600);
    if (this.db.prepare("SELECT value FROM database_meta WHERE name='schema'").get().value !== '1') throw new Error('不支持的数据库版本');
    this.revision = Number(this.db.prepare("SELECT value FROM database_meta WHERE name='revision'").get().value);
    this.cache = new Map();
    this.upsert = this.db.prepare('INSERT INTO records VALUES(?,?,?,?) ON CONFLICT(collection,record_key) DO UPDATE SET position=excluded.position,payload=excluded.payload');
    this.remove = this.db.prepare('DELETE FROM records WHERE collection=? AND record_key=?');
    this.valueUpsert = this.db.prepare('INSERT INTO values_store VALUES(?,?) ON CONFLICT(name) DO UPDATE SET payload=excluded.payload');
  }
  read() {
    if (!this.db.prepare("SELECT value FROM database_meta WHERE name='initialized'").get()) return null;
    const state = {};
    for (const { name, payload } of this.db.prepare('SELECT * FROM values_store').all()) state[name] = JSON.parse(payload);
    for (const row of this.db.prepare('SELECT * FROM records ORDER BY collection,position').all()) {
      state[row.collection] ||= [];
      state[row.collection].push(JSON.parse(row.payload));
      this.cache.set(`${row.collection}\0${row.record_key}`, { position: row.position, payload: row.payload });
    }
    // Empty collections are stored in values_store as [].
    return state;
  }
  write(state) {
    const nextCache = new Map(), values = new Map();
    for (const [collection, value] of Object.entries(state)) {
      if (!Array.isArray(value) || !value.length) { values.set(collection, JSON.stringify(value)); continue; }
      const keys = new Set();
      value.forEach((row, position) => {
        const candidate = row && typeof row === 'object' ? row.id || row.token || row.endpoint : null;
        let key = candidate ? String(candidate) : `index:${position}`;
        if (keys.has(key)) key = `${key}:index:${position}`;
        keys.add(key);
        nextCache.set(`${collection}\0${key}`, { position, payload: JSON.stringify(row) });
      });
    }
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const revision = Number(this.db.prepare("SELECT value FROM database_meta WHERE name='revision'").get().value);
      if (revision !== this.revision) throw new Error('数据库已被另一个进程修改；请只运行一个服务实例并重新启动');
      for (const [composite, row] of nextCache) {
        const old = this.cache.get(composite);
        if (old?.payload === row.payload && old.position === row.position) continue;
        const [collection, key] = composite.split('\0');
        this.upsert.run(collection, key, row.position, row.payload);
      }
      for (const composite of this.cache.keys()) if (!nextCache.has(composite)) this.remove.run(...composite.split('\0'));
      const oldValues = new Map(this.db.prepare('SELECT * FROM values_store').all().map(row => [row.name, row.payload]));
      for (const [name, payload] of values) if (payload !== oldValues.get(name)) this.valueUpsert.run(name, payload);
      for (const name of oldValues.keys()) if (!values.has(name)) this.db.prepare('DELETE FROM values_store WHERE name=?').run(name);
      this.db.prepare("UPDATE database_meta SET value=? WHERE name='revision'").run(String(revision + 1));
      this.db.prepare("INSERT OR REPLACE INTO database_meta VALUES('initialized','1')").run();
      this.db.exec('COMMIT');
      this.revision = revision + 1; this.cache = nextCache;
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  async snapshot(destination) { await backup(this.db, destination); fs.chmodSync(destination, 0o600); }
  check() { return this.db.prepare('PRAGMA integrity_check').get().integrity_check === 'ok'; }
  close() { this.db.close(); }
}
module.exports = { StateDatabase };
