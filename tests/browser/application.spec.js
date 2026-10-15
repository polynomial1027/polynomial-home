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
  expect((await page.request.post('/api/account/mfa/disable',{data:{password:'fixture-admin-password',code:codes[1]}})).status()).toBe(200);
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

test('personal home syncs across devices, keeps favorite order and detects a stale save', async ({ page, browser }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await login(page, true); await page.locator('#customizeSpace').click();
  await expect(page.getByRole('button', { name: '保存首页', exact: true })).toBeInViewport();
  for (const id of ['drive', 'chat', 'learning', 'calendar']) { const input = page.locator(`[data-space-favorite="${id}"]`); if (await input.count()) await input.uncheck(); }
  await page.locator('[data-space-favorite="downloads"]').check(); await page.locator('[data-space-favorite="calendar"]').check();
  await page.locator('[data-space-widget="welcome"]').uncheck(); await page.getByRole('button', { name: '保存首页', exact: true }).click();
  await expect(page.locator('#spaceSettingsDialog')).toBeHidden(); await expect(page.locator('[data-home-widget="welcome"]')).toBeHidden();
  await expect(page.locator('#quickTools a').first()).toHaveAttribute('href', '/download.html');
  await page.reload(); await expect(page.locator('[data-home-widget="welcome"]')).toBeHidden();
  const otherContext = await browser.newContext({ baseURL: 'http://127.0.0.1:3190' });
  try {
    const other = await otherContext.newPage(); await login(other, true);
    await expect(other.locator('#quickTools a').first()).toHaveAttribute('href', '/download.html');
    await page.locator('#customizeSpace').click();
    const current = (await (await other.request.get('/api/account/workspace-preferences')).json()).preferences;
    expect((await other.request.patch('/api/account/workspace-preferences', { data: { favorites: ['calendar'], hiddenWidgets: [], ifUnmodifiedSince: current.updatedAt } })).status()).toBe(200);
    await page.getByRole('button', { name: '保存首页', exact: true }).click(); await expect(page.locator('#spaceSettingsError')).toContainText('其他设备');
    await page.locator('#reloadSpaceSettings').click(); await expect(page.locator('[data-space-widget="welcome"]')).toBeChecked();
    await page.locator('[data-close-dialog="spaceSettingsDialog"]').click();
    const latest = (await (await page.request.get('/api/account/workspace-preferences')).json()).preferences;
    expect((await page.request.patch('/api/account/workspace-preferences', { data: { favorites: ['control'], hiddenWidgets: [], ifUnmodifiedSince: latest.updatedAt } })).status()).toBe(400);
    await page.goto('/app.html#tools'); await page.locator('#toolSearch').fill('日历'); await expect(page.locator('#allTools .tool-entry')).toHaveCount(1);
    await expect(page.locator('#allTools')).not.toContainText('服务器管理');
  } finally { await otherContext.close(); }
});

test('own history is searchable and paginated without AI calls or admin content', async ({ page }) => {
  await login(page, true); await page.goto('/app.html#assistant'); await page.locator('#openChatHistory').click();
  await expect(page.locator('#historyResults .history-message')).toHaveCount(20); await page.locator('#historyNext').click(); await expect(page.locator('#historyResults .history-message')).toHaveCount(5);
  await page.locator('#historyQuery').fill('member-history-24'); await page.locator('#historySearchForm button').click();
  await expect(page.locator('#historyResults .history-message')).toHaveCount(1); await expect(page.locator('#historyResults')).toContainText('member-history-24');
  await page.locator('#historyQuery').fill('admin-private'); await page.locator('#historySearchForm button').click(); await expect(page.locator('#historyStatus')).toContainText('0 条记录');
  const response = await page.request.get('/api/account/assistant-history?userId=someone-else'); const result = await response.json();
  expect(result.total).toBe(25); expect(result.messages.every(row => !row.userId && !row.usageRecordId)).toBe(true);
  await page.setViewportSize({ width: 360, height: 800 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});


test('public home exposes installation and preserves a calendar destination through login', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 }); await page.goto('/');
  await expect(page.locator('body')).toHaveAttribute('data-connected', 'true');
  await expect(page.locator('.landing-actions a[href="/download.html"]')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await page.request.get('/api/account/assistant-history')).status()).toBe(401);
  expect((await page.request.get('/api/account/workspace-preferences')).status()).toBe(401);
  await page.locator('.landing-apps a[href="/app.html#calendar"]').click(); await page.waitForURL('**/login.html?next=*');
  expect(new URL(page.url()).searchParams.get('next')).toBe('/app.html#calendar');
  await page.locator('#username').fill('fixturemember'); await page.locator('#password').fill('fixture-member-password'); await page.locator('#loginForm button').click();
  await expect(page.locator('#appCalendar')).toBeVisible(); expect(new URL(page.url()).hash).toBe('#calendar');
});

async function enableFixtureComposer(page) {
  await page.route('**/api/workspace**', async route => {
    if (new URL(route.request().url()).pathname !== '/api/workspace') return route.continue();
    const response = await route.fetch(), data = await response.json(); if (data.assistant) { data.assistant.enabled = true; data.assistant.configured = true; } await route.fulfill({ response, json: data });
  });
}
test('AI sessions keep drafts separate and support rename, pin, archive, export and delete', async ({ page }) => {
  await enableFixtureComposer(page); await login(page, true); await page.goto('/app.html#assistant');
  await page.locator('#newAiSession').click(); await expect(page.locator('#aiSessionTitle')).toHaveText('新的对话');
  const a = await page.locator('#aiSessionList .active').getAttribute('data-ai-session'); await page.locator('#appChatMessage').fill('draft in A');
  await page.locator('#newAiSession').click(); await expect.poll(() => page.locator('#aiSessionList .active').getAttribute('data-ai-session')).not.toBe(a);
  const b = await page.locator('#aiSessionList .active').getAttribute('data-ai-session'); await expect(page.locator('#appChatMessage')).toHaveValue(''); await page.locator('#appChatMessage').fill('draft in B');
  await page.locator(`[data-ai-session="${a}"]`).click(); await expect(page.locator('#appChatMessage')).toHaveValue('draft in A');
  await page.locator('#editAiSession').click(); await page.locator('#aiRenameSession').fill('工作项目 A'); await page.locator('#aiPinSession').check(); await page.locator('#aiSessionForm button[type="submit"]').click();
  await expect(page.locator('#aiSessionTitle')).toHaveText('工作项目 A'); await expect(page.locator(`[data-ai-session="${a}"]`)).toContainText('★');
  await page.locator('#editAiSession').click(); const downloading = page.waitForEvent('download'); await page.locator('#aiExportSession').click(); const exported = await downloading; expect(exported.suggestedFilename()).toContain(a);
  await page.locator('#aiArchiveSession').click(); await expect(page.locator('#aiSessionTool')).toContainText('已归档'); await expect(page.locator('#sendChat')).toBeDisabled();
  await page.locator('#editAiSession').click(); await page.locator('#aiArchiveSession').click(); await expect(page.locator('#aiSessionTool')).not.toContainText('已归档');
  await page.locator('#editAiSession').click(); await page.locator('#aiDeleteSession').click(); await page.locator('#aiDeleteDialog button[value="delete"]').click();
  await expect(page.locator(`[data-ai-session="${a}"]`)).toHaveCount(0); await page.locator(`[data-ai-session="${b}"]`).click(); await expect(page.locator('#appChatMessage')).toHaveValue('draft in B');
});
test('AI toolbox stores private reusable prompts and reviews a text attachment before any model request', async ({ page, browser }) => {
  await enableFixtureComposer(page); let modelCalls = 0; page.on('request', req => { if (new URL(req.url()).pathname === '/api/workspace/assistant') modelCalls++; });
  await login(page, true); await page.goto('/app.html#assistant'); await page.locator('#openAiTools').click();
  await expect(page.locator('#aiToolCatalog')).toContainText('文本资料分析'); await page.locator('#aiTemplateTitle').fill('私人周报'); await page.locator('#aiTemplatePrompt').fill('private-template-sentinel：按进展、问题、下周安排输出。'); await page.locator('#aiTemplateForm button[type="submit"]').click();
  await expect(page.locator('#aiTemplateList')).toContainText('私人周报'); await page.locator('[data-use-ai-template]').last().click(); await expect(page.locator('#aiSessionTool')).toContainText('私人周报');
  const id = await page.locator('#aiSessionList .active').getAttribute('data-ai-session');
  await page.locator('#aiFileInput').setInputFiles({ name: 'notes.md', mimeType: 'text/plain', buffer: Buffer.from('周报资料：完成了接口联调。') }); await expect(page.locator('#aiAttachment')).toContainText('notes.md');
  expect(modelCalls).toBe(0); await page.locator('#removeAiAttachment').click(); await expect(page.locator('#aiAttachment')).toBeHidden();
  const otherContext = await browser.newContext({ baseURL: 'http://127.0.0.1:3190' });
  try { const api = otherContext.request; await api.post('/api/login', { data: { username: 'fixtureother', password: 'fixture-other-password' } }); expect((await api.get(`/api/account/ai/sessions/${id}`)).status()).toBe(404); expect((await api.get(`/api/workspace?sessionId=${id}`)).status()).toBe(404); expect(JSON.stringify(await (await api.get('/api/workspace')).json())).not.toContain('private-template-sentinel'); } finally { await otherContext.close(); }
  await page.setViewportSize({ width: 390, height: 844 }); await expect(page.locator('#sendChat')).toBeInViewport(); await page.locator('#toggleAiSessions').click(); await expect(page.locator('#aiSessionSearch')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('messages reach another account and recover after a lost socket without duplication', async ({ browser }) => {
  const a=await browser.newContext(),b=await browser.newContext(),sender=await a.newPage(),receiver=await b.newPage();
  try {
    await login(sender);await receiver.goto('/login.html?next=%2Fchat.html');await receiver.locator('#username').fill('fixtureother');await receiver.locator('#password').fill('fixture-other-password');await receiver.locator('#loginForm button').click();await receiver.waitForURL('**/chat.html');
    const list=await(await sender.request.get('/api/users')).json(),other=list.users.find(u=>u.username==='fixtureother');
    const created=await(await sender.request.post('/api/conversations',{data:{type:'direct',memberIds:[other.id]}})).json(),room=created.conversation.id;
    await Promise.all([sender.goto(`/chat.html#room=${room}`),receiver.goto(`/chat.html#room=${room}`)]);
    await expect(receiver.locator('#messageInput')).toBeEnabled();await sender.locator('#messageInput').fill('实时送达测试');await sender.locator('#chatForm button:last-child').click();await expect(receiver.locator('#messages')).toContainText('实时送达测试');
    await b.setOffline(true);await sender.locator('#messageInput').fill('断线后补收测试');await sender.locator('#chatForm button:last-child').click();await expect(sender.locator('#chatSendStatus')).toContainText('服务器已保存');await b.setOffline(false);
    await expect(receiver.locator('#messages')).toContainText('断线后补收测试',{timeout:15000});await expect(receiver.locator('#messages .message').filter({hasText:'断线后补收测试'})).toHaveCount(1);
    const key=require('node:crypto').randomUUID(),payload={conversationId:room,text:'重试不重复',clientId:key};const first=await(await sender.request.post('/api/messages',{data:payload})).json(),second=await(await sender.request.post('/api/messages',{data:payload})).json();expect(second.message.id).toBe(first.message.id);
    await receiver.goto('/app.html#account');if(await receiver.locator('#briefDialog').isVisible())await receiver.locator('[data-close-dialog="briefDialog"]').click();
    await sender.request.post('/api/messages',{data:{conversationId:room,text:'个人空间接收提醒'}});await expect(receiver.locator('#incomingMessage')).toContainText('个人空间接收提醒',{timeout:12000});
  } finally {await a.close();await b.close();}
});

test('profile photo and preferences persist and member cannot change role', async ({ page }) => {
  await login(page,true);await page.goto('/app.html#account');await expect(page.locator('#profileForm input[name=displayName]')).toHaveValue('测试成员');
  await page.locator('#profileForm input[name=displayName]').fill('测试成员');await page.locator('#profileForm input[name=emoji]').fill('🌿');await page.locator('#profileForm textarea[name=bio]').fill('我的自定义简介');await page.locator('#profileForm select[name=color]').selectOption('violet');
  await page.locator('#avatarFile').setInputFiles({name:'avatar.png',mimeType:'image/png',buffer:Buffer.from(await page.evaluate(()=>{const c=document.createElement('canvas');c.width=c.height=20;const g=c.getContext('2d');g.fillStyle='green';g.fillRect(0,0,20,20);return c.toDataURL('image/png').split(',')[1];}),'base64')});await expect(page.locator('#profilePreview img')).toBeVisible();await page.locator('#profileForm button[type=submit]').click();await expect(page.locator('#profileStatus')).toContainText('已保存');
  await page.reload();await expect(page.locator('#accountAvatar img')).toBeVisible();await expect(page.locator('#profileForm textarea[name=bio]')).toHaveValue('我的自定义简介');
  const me=await(await page.request.get('/api/me')).json(),p=me.user.profile;expect(p.avatar).toBeUndefined();expect(p.avatarUrl).toContain('/api/avatars/');expect((await page.request.get(p.avatarUrl)).headers()['content-type']).toBe('image/jpeg');
  const response=await page.request.patch('/api/account/profile',{data:{...p,displayName:'测试成员',role:'admin',ifUnmodifiedSince:p.updatedAt}});expect(response.status()).toBe(200);expect((await(await page.request.get('/api/me')).json()).user.role).toBe('member');
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('slow admin data does not delay the ordinary workspace', async ({page})=>{
  await login(page);await page.route('**/api/admin/assistant',async route=>{await new Promise(r=>setTimeout(r,4000));try{await route.continue();}catch{}});await page.route('**/api/admin/butler',async route=>{await new Promise(r=>setTimeout(r,4000));try{await route.continue();}catch{}});
  await page.goto('/app.html#calendar');await expect(page.locator('#appContent')).toHaveAttribute('aria-busy','false',{timeout:2500});await page.locator('[data-add-task]:visible').first().click();await expect(page.locator('#taskDialog')).toBeVisible();
});
