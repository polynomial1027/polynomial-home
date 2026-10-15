const fs = require('node:fs');
const path = require('node:path');
const { dataDir } = require('../lib/store');
const { StateDatabase } = require('../lib/database');
if (process.env.POLYNOMIAL_OFFLINE_IMPORT !== '1') throw new Error('请先停止服务，再设置 POLYNOMIAL_OFFLINE_IMPORT=1 导出回退数据');
require('../lib/service-lock').assertServiceStopped(dataDir);
const db = new StateDatabase(dataDir);
try {
  const state = db.read(); if (!state) throw new Error('SQLite 数据库没有初始化');
  const file = path.join(dataDir, 'store.json');
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(state), { mode: 0o600 }); fs.renameSync(`${file}.tmp`, file);
  console.log('已把当前 SQLite 数据导出为旧版本兼容的 store.json。SQLite 和备份继续保留。');
} finally { db.close(); }
