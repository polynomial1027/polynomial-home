const {test,expect}=require('./button-audit-fixture.cjs');
const fs=require('node:fs');
async function login(page,name='fixtureadmin',password='fixture-admin-password'){
 await page.goto('/login.html?next=%2Fapp.html');await page.locator('#username').fill(name);await page.locator('#password').fill(password);await page.locator('#loginForm button').click();await expect(page.locator('#userName')).toBeVisible();
 if(await page.locator('#briefDialog').isVisible())await page.locator('[data-close-dialog=briefDialog]').click();
}
const routes=['/','/projects.html','/announcements.html','/download.html','/privacy.html','/app.html#home','/app.html#assistant','/app.html#calendar','/app.html#tools','/app.html#account','/workspace.html','/drive.html','/chat.html','/learning.html','/learning.html?course=python-foundations-v1','/games.html','/games/match3.html','/games/go.html','/admin.html','/ai-records.html','/genshin-calculator/'];
test('release sweep checks every page, local destinations, assets, controls and mobile regions',async({page},info)=>{
 test.setTimeout(120000);await login(page);const errors=[],failedAssets=[],inventory=[],links=new Set();
 page.on('pageerror',error=>errors.push({page:page.url(),error:error.message}));
 page.on('response',r=>{if(r.status()>=400&&new URL(r.url()).pathname.startsWith('/assets/'))failedAssets.push({url:r.url(),status:r.status()});});
 for(const route of routes){
  const response=await page.goto(route);expect(response.status(),route).toBeLessThan(400);
  await expect(page.locator('main').first()).toBeVisible();
  if(route.startsWith('/app.html'))await expect(page.locator('#userName')).toHaveText('Polynomial');
  if(route==='/chat.html')await expect(page.locator('#messageInput')).toBeEnabled();
  if(route==='/learning.html?course=python-foundations-v1')await expect(page.locator('#lessonStage')).toBeVisible();
  const ready={'/admin.html':['#userList','fixtureadmin'],'/drive.html':['#driveFiles','这里还没有文件'],'/download.html':['#resourceList','测试安装包'],'/games/go.html':['#goPlayer','Polynomial'],'/workspace.html':['#workspaceName','Polynomial'],'/ai-records.html':['#recordWindow','2026']};
  if(ready[route]&&route!=='/drive.html'&&route!=='/workspace.html'&&route!=='/ai-records.html')await expect(page.locator(ready[route][0])).toContainText(ready[route][1]);
  if(route==='/games/match3.html')await expect(page.locator('#gameBoard .gem')).toHaveCount(64);
  const state=await page.evaluate(()=>{
   const visible=n=>!!(n.getClientRects().length)&&getComputedStyle(n).visibility!=='hidden';
   return {title:document.title,links:[...document.querySelectorAll('a[href]')].map(a=>a.getAttribute('href')),buttons:[...document.querySelectorAll('button,summary,input[type=submit]')].map(n=>({id:n.id,visible:visible(n),label:n.getAttribute('aria-label')||n.getAttribute('title')||n.textContent.trim(),disabled:!!n.disabled})),headings:[...document.querySelectorAll('h1,h2,h3')].filter(visible).map(n=>n.textContent.trim())};
  });
  expect(state.title,route).toBeTruthy();expect(state.links.filter(h=>h==='#'||/^javascript:/i.test(h)),route+' placeholder links').toEqual([]);
  for(const href of state.links){const url=new URL(href,page.url());if(url.origin===new URL(page.url()).origin)links.add(url.pathname+url.search);if(href.startsWith('#')&&!route.startsWith('/app.html'))expect(await page.evaluate(hash=>!!document.getElementById(decodeURIComponent(hash.slice(1))),href),route+' '+href).toBe(true);}
  for(const width of [1440,390,360]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${route} width ${width}`).toBe(true);}
  if(['/app.html#home','/app.html#assistant','/chat.html','/download.html','/privacy.html'].includes(route)){await page.screenshot({path:info.outputPath(route.replace(/[^a-z]/gi,'-')+'-mobile.png'),fullPage:true});}
  inventory.push({route,...state});
 }
 const destinations=[];for(const href of links){if(href.startsWith('/api/'))continue;const r=await page.request.get(href);destinations.push({href,status:r.status()});expect(r.status(),href).toBeLessThan(400);}
 expect(errors).toEqual([]);expect(failedAssets).toEqual([]);
 fs.writeFileSync(info.outputPath('release-inventory.json'),JSON.stringify({inventory,destinations,errors,failedAssets},null,2));
});
test('private chat has clean labels and one accessible data policy instead of repeated banners',async({page})=>{
 await login(page,'fixturemember','fixture-member-password');await page.goto('/chat.html');await page.locator('#newChatButton').click();
 const accounts=await(await page.request.get('/api/conversations')).json();const admin=accounts.users.find(u=>u.role==='admin');await page.locator(`input[name=chatMember][value="${admin.id}"]`).check();await page.locator('#newChatForm button[value=default]').click();await expect(page.locator('#conversationInfo')).toHaveText('私聊');await expect(page.locator('body')).not.toContainText('管理员可见');
 await page.locator('.chat-data-note a').click();await expect(page.locator('h1')).toHaveText('隐私与数据说明');await expect(page.locator('main')).toContainText('未提供端到端加密');await expect(page.locator('main')).toContainText('管理员');
});
test('member and guest tool regions expose only their allowed controls',async({page,browser})=>{
 await login(page);const r=await page.request.post('/api/users',{data:{username:'release-guest',displayName:'发布访客',password:'release-guest-password',role:'guest'}});expect(r.status()).toBe(201);
 for(const [name,password,guest] of [['fixturemember','fixture-member-password',false],['release-guest','release-guest-password',true]]){
  const context=await browser.newContext();try{const p=await context.newPage();await login(p,name,password);for(const view of ['home','assistant','calendar','tools','account','control']){await p.goto('/app.html#'+view);await expect(p.locator('#userName')).toHaveText(guest?'发布访客':'测试成员');await expect(p.locator('.admin-only:visible')).toHaveCount(0);if(view==='control')await expect(p.locator('[data-view=home]')).toBeVisible();if(guest)await expect(p.locator('a[href="/chat.html"]:visible')).toHaveCount(0);}
   await p.goto('/app.html#tools');await expect(p.locator('#allTools a[href="/genshin-calculator/"]')).toBeVisible();await p.goto('/app.html#account');if(guest)await expect(p.locator('#enableMessageNotifications')).toBeHidden();else await expect(p.locator('#enableMessageNotifications')).toBeVisible();
  }finally{await context.close();}
 }
});
test('signed-out login, recovery, offline and legacy routes keep working without admin links',async({page},info)=>{
 const inventory=[];for(const route of ['/index.html','/login.html','/recover-password.html','/offline.html','/python.html','/privacy.html']){
  const response=await page.goto(route);expect(response.status(),route).toBeLessThan(400);await expect(page.locator('main').first()).toBeVisible();await page.setViewportSize({width:360,height:800});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),route).toBe(true);
  await expect(page.locator('a[href="/admin.html"]:visible')).toHaveCount(0);inventory.push({route,finalPath:new URL(page.url()).pathname,title:await page.title()});
 }
 await page.goto('/login.html');await expect(page.locator('h1')).toHaveText('登录账号');await page.locator('a[href="/recover-password.html"]').click();await expect(page.locator('#recoveryForm')).toBeVisible();
 fs.writeFileSync(info.outputPath('public-inventory.json'),JSON.stringify(inventory,null,2));
});
