// Only the public offline fallback is cached. Account pages, API data and downloads always use the network.
const CACHE='polynomial-offline-v030-1';
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.add('/offline.html')).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('polynomial-offline-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{if(event.request.mode==='navigate'&&new URL(event.request.url).origin===self.location.origin)event.respondWith(fetch(event.request).catch(()=>caches.match('/offline.html')));});
self.addEventListener('push', event => {
  let payload = {};
  try { payload = event.data?.json() || {}; } catch {}
  event.waitUntil(self.registration.showNotification('日程提醒', {
    body: String(payload.body || '有一项日程已到时间').slice(0, 120),
    icon: '/assets/app/icon-192.png',
    tag: `planner-${String(payload.itemId || '')}`,
    data: { url: '/app.html#calendar' }
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async windows => {
    const existing = windows.find(window => new URL(window.url).origin === self.location.origin);
    if (existing) { await existing.focus(); return existing.navigate('/app.html#calendar'); }
    return self.clients.openWindow('/app.html#calendar');
  }));
});
