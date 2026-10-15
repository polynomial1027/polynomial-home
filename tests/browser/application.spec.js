const { test, expect } = require('@playwright/test');
const { codeAt } = require('../../lib/security');
async function login(page, member = false) {
  await page.goto('/login.html?next=%2Fapp.html');
  await page.locator('#username').fill(member ? 'fixturemember' : 'fixtureadmin');
  await page.locator('#password').fill(member ? 'fixture-member-password' : 'fixture-admin-password');
  await page.locator('#loginForm button').click();
  await expect(page.locator('#userName')).toHaveText(member ? '测试成员' : 'Polynomial');
  if (await page.locator('#briefDialog').isVisible()) await page.locator('[data-close-dialog="briefDialog"]').click();
}
test('desktop and mobile navigation keep admin controls private and show real task status', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await login(page); await page.goto('/app.html#control');
  await expect(page.locator('#jobRows')).toContainText('数据与文件备份');
  await page.locator('#appButlerMessage').fill('给 @fixturemember 关闭聊天权限'); await page.locator('#appButlerForm button').click();
  await expect(page.locator('[data-confirm-butler]').last()).toBeVisible();
  await page.locator('[data-confirm-butler]').last().click(); await expect(page.locator('#butlerConfirm')).toBeVisible();
  await page.locator('#butlerConfirm button[value="cancel"]').click();
  await page.locator('[data-cancel-butler]').last().click(); await expect(page.locator('#appButlerThread')).toContainText('已取消');
  await page.locator('#appButlerMessage').fill('给 @fixturemember 关闭聊天权限'); await page.locator('#appButlerForm button').click();
  await page.locator('[data-confirm-butler]').last().click(); await page.locator('#butlerConfirmAccept').click();
  await expect(page.locator('#appButlerThread')).toContainText('已执行');
  const users = await (await page.request.get('/api/users')).json(), member = users.users.find(user => user.username === 'fixturemember');
  expect(member.permissions.accessChat).toBe(false);
  await page.request.patch(`/api/users/${member.id}`, { data: { permissions: { accessChat: true } } });
  await page.locator('#appButlerMessage').fill('今天谁登录了？'); await page.locator('#appButlerForm button').click();
  await expect(page.locator('#appButlerThread')).toContainText('统计区间');
  await expect(page.locator('#appButlerThread')).toContainText('数据来源');
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/app.html#calendar');
  await expect(page.locator('#appCalendar')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '/tmp/polynomial-v038-calendar-mobile.png', fullPage: true });
  await page.locator('#accountButton').click(); await page.locator('#appLogout').click(); await page.waitForURL('**/login.html?next=*'); await login(page, true);
  await expect(page.locator('#operationsSurface')).toBeHidden();
  expect((await page.request.get('/api/admin/operations')).status()).toBe(403);
  expect(errors).toEqual([]);
});
test('calendar edits detect stale revisions and device opt-in provides read-only offline calendar', async ({ page }) => {
  await login(page, true); await page.goto('/app.html#calendar');
  await page.getByRole('button', { name: '添加日程', exact: true }).click();
  await page.locator('#appPlanTitle').fill('离线日程测试'); await page.locator('#appPlanDate').fill('2026-10-20T09:00'); await page.locator('#saveTask').click();
  await expect(page.locator('#agendaTasks')).toContainText('离线日程测试');
  const snapshot = await (await page.request.get('/api/workspace')).json(), item = snapshot.planner.find(row => row.title === '离线日程测试');
  expect((await page.request.patch(`/api/workspace/planner/${item.id}`, { data: { title: '另一设备更新', ifUnmodifiedSince: item.createdAt } })).status()).toBe(200);
  expect((await page.request.patch(`/api/workspace/planner/${item.id}`, { data: { title: '旧页面覆盖', ifUnmodifiedSince: item.createdAt } })).status()).toBe(409);
  await page.locator('#refreshApp').click(); await expect(page.locator('#agendaTasks')).toContainText('另一设备更新');
  await page.goto('/app.html#account'); await page.locator('#offlineCalendar').check();
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.context().setOffline(true); await page.goto('/app.html#calendar'); await page.reload();
  await expect(page.locator('#connectionStatus')).toContainText('离线副本');
  await expect(page.locator('#agendaTasks')).toContainText('另一设备更新');
  await expect(page.getByRole('button', { name: '添加日程', exact: true })).toBeDisabled();
  const cache = await page.evaluate(() => JSON.parse(localStorage.getItem('polynomial:offline-calendar')));
  expect(cache.chats).toEqual([]); expect(cache.health).toEqual([]);
  await page.context().setOffline(false); await page.locator('#refreshApp').click(); await expect(page.locator('#connectionStatus')).toContainText('已同步');
});
test('download shows progress and verifies actual installer bytes before saving', async ({ page }) => {
  await page.goto('/download.html?installed=0.3.6&platform=mac&arch=x64');
  await expect(page.locator('#resourceList')).toContainText('测试安装包');
  const waiting = page.waitForEvent('download'); await page.locator('[data-download-resource]').first().click(); const download = await waiting;
  expect(download.suggestedFilename()).toBe('Polynomial-0.3.8-mac-x64.dmg');
  await expect(page.locator('.download-progress')).toContainText('SHA-256 校验通过');
});
test('narrow forms, task status and detailed pages stay usable with shared appearance', async ({ page }) => {
  await page.route('**/api/admin/assistant', async route => { const response = await route.fetch(), data = await response.json(); for (const report of data.reports || []) report.systemLogin = { status: 'unavailable' }; await route.fulfill({ response, json: data }); });
  await page.route('**/api/admin/operations', async route => {
    const response = await route.fetch(), operations = await response.json();
    operations.jobs.forEach(job => { job.status = 'idle'; job.lastFinishedAt = null; }); operations.runs = []; operations.backups = [];
    await route.fulfill({ response, json: operations });
  });
  await page.setViewportSize({ width: 360, height: 800 }); await login(page);
  await expect(page.locator('#homeOperations')).toContainText('等待首次执行');
  await expect(page.locator('#homeOperations')).toContainText('暂无备份');
  await page.goto('/app.html#account');
  for (const selector of ['#ownPasswordForm input[name="password"]', '#ownPasswordForm input[name="newPassword"]', '#mfaSetupForm input[name="password"]']) {
    await expect(page.locator(selector)).toBeVisible(); expect((await page.locator(selector).boundingBox()).width).toBeGreaterThan(230);
  }
  await page.goto('/app.html#control'); await expect(page.locator('#healthSummary')).toContainText('无法读取 SSH 登录日志');
  expect((await page.locator('#aiRecordRetentionDays').boundingBox()).width).toBeGreaterThan(230);
  await page.goto('/app.html#assistant'); await expect(page.locator('#sendChat')).toBeInViewport();
  await page.evaluate(() => localStorage.setItem('polynomial:appearance', 'dark'));
  for (const route of ['/workspace.html', '/admin.html', '/download.html']) {
    await page.goto(route); await expect(page.locator('body')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('.connected-nav a[href="/app.html"]')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test('administrator MFA requires a factor after password and uses recovery codes once', async ({ page }) => {
  await login(page); await page.goto('/app.html#account');
  await page.locator('#mfaSetupForm input[name="password"]').fill('fixture-admin-password'); await page.locator('#mfaSetupForm button').click();
  await expect(page.locator('#mfaVerifyForm')).toBeVisible(); const secret = await page.locator('#mfaSecret').textContent();
  await page.locator('#mfaCode').fill(codeAt(secret, Math.floor(Date.now() / 30000))); await page.locator('#mfaVerifyForm button').click();
  await expect(page.locator('#mfaRecoveryPanel')).toBeVisible(); const codes = (await page.locator('#mfaRecoveryCodes').textContent()).split('\n');
  const failures = async () => (await (await page.request.get('/api/admin/activity?q=login-failed')).json()).total;
  const before = await failures();
  for (let attempt = 0; attempt < 11; attempt++) {
    const challenge = await page.request.post('/api/login', { data: { username: 'fixtureadmin', password: 'fixture-admin-password' } });
    expect(challenge.status()).toBe(401); expect((await challenge.json()).totpRequired).toBe(true);
  }
  expect(await failures()).toBe(before);
  const wrong = await page.request.post('/api/login', { data: { username: 'fixtureadmin', password: 'fixture-admin-password', code: 'not-a-valid-factor' } });
  expect(wrong.status()).toBe(401); expect(await failures()).toBe(before + 1);
  await page.locator('#appLogout').click(); await page.locator('#username').fill('fixtureadmin'); await page.locator('#password').fill('fixture-admin-password'); await page.locator('#loginForm button').click();
  await expect(page.locator('#loginOtpField')).toBeVisible(); await page.locator('#loginOtp').fill(codes[0]); await page.locator('#loginForm button').click(); await expect(page.locator('#userName')).toHaveText('Polynomial');
  const response = await page.request.post('/api/login', { data: { username: 'fixtureadmin', password: 'fixture-admin-password', code: codes[0] } }); expect(response.status()).toBe(401);
});

test('download can be tracked and cancelled after changing filters and categories', async ({ page }) => {
  await page.goto('/download.html?platform=mac'); await expect(page.locator('[data-download-resource]').first()).toBeVisible();
  let release; const pending = new Promise(resolve => { release = resolve; });
  await page.route('**/api/downloads/*/content', async route => { await pending; await route.abort().catch(() => {}); });
  try {
    await page.locator('[data-download-resource]').first().click();
    await expect(page.locator('[data-cancel-download]')).toBeVisible();
    await page.locator('#resourceRelease').selectOption('all');
    await expect(page.locator('[data-download-resource]').first()).toBeDisabled();
    await page.locator('[data-category="resource"]').click();
    await expect(page.locator('#downloadTasks')).toBeVisible(); await expect(page.locator('[data-cancel-download]')).toBeVisible();
    await page.locator('[data-cancel-download]').click(); await expect(page.locator('#downloadTaskList')).toContainText('下载已取消');
    await page.locator('[data-category="client"]').click(); await expect(page.locator('[data-download-resource]').first()).toBeEnabled();
  } finally { release(); }
});
