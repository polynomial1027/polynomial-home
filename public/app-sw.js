const CACHE = 'polynomial-offline-v0313';
// Cache only public application files. APIs, account responses and downloads
// always use the network; calendar data requires a separate device opt-in.
const SHELL = ['/offline.html', '/app.html', '/assets/app/app.css', '/assets/app/app.js', '/assets/app/ai-workspace.js', '/assets/messaging.js', '/assets/messaging.css', '/assets/app/profile.js', '/assets/app/personal-space.js', '/assets/app/local-cache.js', '/assets/app/operations.js', '/assets/app/reminders.js', '/assets/workspace-math.js', '/assets/vendor/katex/katex.min.js', '/assets/vendor/katex/katex.min.css', '/assets/app/icon-192.png'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('polynomial-offline-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (SHELL.includes(url.pathname)) {
    event.respondWith(fetch(event.request).then(response => { if (response.ok) { const copy = response.clone(); event.waitUntil(caches.open(CACHE).then(cache => cache.put(url.pathname, copy))); } return response; }).catch(() => caches.match(url.pathname)));
  } else if (event.request.mode === 'navigate') event.respondWith(fetch(event.request).catch(() => caches.match('/offline.html')));
});
self.addEventListener('push', event => {
  let payload = {}; try { payload = event.data?.json() || {}; } catch {}
  event.waitUntil(self.registration.showNotification(String(payload.title || '日程提醒').slice(0, 60), {
    body: String(payload.body || '有一项日程已到时间').slice(0, 120), icon: '/assets/app/icon-192.png',
    tag: payload.type==='chat'?`chat-${String(payload.messageId||'')}`:`planner-${String(payload.itemId || '')}-${String(payload.dueAt || '')}`, data: { url: payload.type==='chat'&&/^\/chat\.html#room=[a-f0-9-]+$/.test(payload.url||'')?payload.url:'/app.html#calendar' }
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async windows => {
    const target=/^\/chat\.html#room=[a-f0-9-]+$/.test(event.notification.data?.url||'')?event.notification.data.url:'/app.html#calendar';
    const existing = windows.find(window => new URL(window.url).origin === self.location.origin);
    if (existing) { await existing.focus(); return existing.navigate(target); }
    return self.clients.openWindow(target);
  }));
});
