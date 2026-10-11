const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { defaultPermissions, normalizeUser, updatePermissions } = require('../lib/store');

test('只更新明确提交的权限，不会把未提交的围棋权限重置为 false', () => {
  const existing = { ...defaultPermissions, accessGo: true, goAi: true, goShared: false };
  const updated = updatePermissions(existing, { driveEnabled: false });
  assert.equal(updated.driveEnabled, false);
  assert.equal(updated.accessGo, true);
  assert.equal(updated.goAi, true);
  assert.equal(updated.goShared, false);
});

test('忽略未知权限和非布尔值，兼容旧用户并保留零 MB 网盘额度', () => {
  const updated = updatePermissions({ accessGo: false }, { accessGo: 'true', unknownPermission: true, goAi: false });
  assert.equal(updated.accessGo, false);
  assert.equal(updated.goAi, false);
  assert.equal(Object.hasOwn(updated, 'unknownPermission'), false);
  const user = normalizeUser({ permissions: { accessGo: false }, driveQuotaMB: 0 });
  assert.equal(user.driveQuotaMB, 0);
  assert.equal(user.permissions.accessGo, false);
  assert.equal(user.permissions.goAi, true);
});

test('管理页面覆盖全部权限字段，权限脚本负责额度与保存后状态校验', () => {
  const root = path.join(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'public/admin.html'), 'utf8');
  const script = fs.readFileSync(path.join(root, 'public/assets/admin-permissions.js'), 'utf8');
  for (const permission of Object.keys(defaultPermissions)) {
    assert.match(html, new RegExp(`data-permission=["']${permission}["']`), `管理页面缺少 ${permission}`);
  }
  assert.match(script, /refreshAndFillUser/);
  assert.match(script, /saved\.driveQuotaMB !== quota/);
});
