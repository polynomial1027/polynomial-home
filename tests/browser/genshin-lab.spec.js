const { test, expect } = require('@playwright/test');
async function login(page, member = false) {
  const response = await page.request.post('/api/login', { data: { username: member ? 'fixturemember' : 'fixtureadmin', password: member ? 'fixture-member-password' : 'fixture-admin-password' } });
  expect(response.ok()).toBe(true);
}
test('lab files and APIs reject anonymous and members, including encoded paths', async ({ page }) => {
  for (const file of ['/labs/genshin.html', '/labs/genshin.js', '/labs/lab.css', '/%6cabs/genshin.html', '/api/admin/labs/genshin/status']) expect((await page.request.get(file)).status()).toBe(401);
  await login(page, true);
  for (const file of ['/labs/', '/labs/genshin.html', '/labs/genshin.js', '/%6cabs/genshin.html', '/api/admin/labs/genshin/status']) expect((await page.request.get(file)).status()).toBe(403);
  await page.goto('/app.html#labs'); await expect(page.locator('[data-page="labs"]')).toBeHidden(); await expect(page.locator('[data-view="labs"]')).toBeHidden();
  await page.goto('/'); await expect(page.locator('#homeLabs')).toBeHidden();
});
test('admin can open independent lab, import evidence, ask with mock API and calculate without API calls', async ({ page }) => {
  await login(page);
  await page.goto('/'); await expect(page.locator('#homeLabs')).toBeVisible();
  await page.goto('/app.html#labs'); await expect(page.locator('[data-view="labs"]')).toBeVisible();
  if (await page.locator('#briefDialog').isVisible()) await page.getByRole('button', { name: '关闭每日回顾' }).click();
  // Android WebView does not support additional windows. Exercise the actual
  // launch control in the same page instead of bypassing it with goto().
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => { window.open = () => null; });
  const launch = page.getByRole('link', { name: '打开原神 AI' });
  await expect(launch).toBeVisible(); await expect(launch).not.toHaveAttribute('target', '_blank');
  const paragraphs = page.locator('.lab-launch-card p');
  const top = await paragraphs.nth(0).boundingBox(), bottom = await paragraphs.nth(1).boundingBox(), button = await launch.boundingBox();
  expect(top.y + top.height).toBeLessThanOrEqual(bottom.y); expect(bottom.y + bottom.height).toBeLessThanOrEqual(button.y);
  await page.screenshot({ path: '/tmp/polynomial-genshin-launch-mobile.png', fullPage: true });
  await launch.click(); await expect(page).toHaveURL(/\/labs\/genshin\.html$/); await expect(page.locator('#surface')).toBeVisible();
  const response = await page.request.get('/labs/genshin.html'); expect(response.headers()['cache-control']).toContain('no-store');
  await page.getByText('导入手册或数据表', { exact: true }).click();
  await page.locator('#docTitle').fill('浏览器测试手册'); await page.locator('#docVersion').fill('仅模拟测试'); await page.locator('#docContent').fill('测试资料：攻击力、增伤、暴击、防御与抗性共同影响伤害。');
  await page.locator('#importForm button').click(); await expect(page.locator('#documents')).toContainText('浏览器测试手册');
  await page.locator('#question').fill('测试资料如何解释伤害？'); await page.locator('#search').check(); await page.locator('#send').click();
  await expect(page.locator('#thread')).toContainText('根据导入资料核对机制。'); await expect(page.locator('#thread blockquote')).toContainText('测试资料');
  const before = (await (await page.request.get('/api/admin/labs/genshin/status')).json()).budget.usedCalls;
  const values = { atk: 2000, em: 0, multiplier: 200, bonus: 50, critRate: 50, critDamage: 100, level: 90, enemyLevel: 90, resistance: 10, defReduction: 0, defIgnore: 0, reactionBonus: 0 };
  for (const id of ['before', 'after']) for (const [key, value] of Object.entries(values)) await page.locator(`#${id} [name="${key}"]`).fill(String(key === 'atk' && id === 'after' ? 2200 : value));
  await page.locator('#calcForm > button').click(); await expect(page.locator('#calculation')).toContainText('提升：10.000%');
  const after = (await (await page.request.get('/api/admin/labs/genshin/status')).json()).budget.usedCalls; expect(after).toBe(before);
  await page.locator('#attachCalculation').check(); await page.locator('#search').uncheck(); await page.locator('#question').fill('请根据计算后的面板解释换装提升。'); await page.locator('#send').click();
  await expect(page.locator('#thread')).toContainText('服务器计算：4050.000 → 4455.000；提升 10.000%');
  const status = await (await page.request.get('/api/admin/labs/genshin/status')).json(); expect(status.budget.maxTokens).toBe(100000); expect(status.budget.maxCalls).toBeUndefined(); expect(status.budget.usedTokens).toBe(84);
  await page.setViewportSize({ width: 390, height: 844 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '/tmp/polynomial-genshin-lab-mobile.png', fullPage: true });
});
