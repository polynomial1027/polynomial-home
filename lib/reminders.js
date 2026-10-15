const fs = require('node:fs');
const path = require('node:path');
const webpush = require('web-push');

const allowedHost = host => host === 'fcm.googleapis.com' || host === 'updates.push.services.mozilla.com' || host === 'web.push.apple.com' || /^[-a-z0-9]+\.notify\.windows\.com$/.test(host);

function validSubscription(value) {
  if (!value || typeof value !== 'object') throw new Error('无效的通知订阅');
  let url;
  try { url = new URL(value.endpoint); } catch { throw new Error('无效的推送地址'); }
  if (url.protocol !== 'https:' || url.port || url.username || url.password || !allowedHost(url.hostname) || value.endpoint.length > 2048) throw new Error('不支持的推送地址');
  if (!/^[A-Za-z0-9_-]{40,}$/.test(value.keys?.p256dh || '') || !/^[A-Za-z0-9_-]{16,}$/.test(value.keys?.auth || '')) throw new Error('无效的推送密钥');
  return { endpoint: url.href, keys: { p256dh: value.keys.p256dh, auth: value.keys.auth } };
}

function vapidKeys(dataDir) {
  const file = path.join(dataDir, 'push-vapid.json');
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  const keys = webpush.generateVAPIDKeys();
  fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, JSON.stringify(keys), { flag: 'wx', mode: 0o600 });
  return keys;
}

function subscribe(state, save, user, value) {
  const subscription = validSubscription(value);
  state.pushSubscriptions ||= [];
  const existing = state.pushSubscriptions.find(item => item.endpoint === subscription.endpoint && item.userId === user.id && JSON.stringify(item.keys) === JSON.stringify(subscription.keys));
  if (existing) return;
  state.pushSubscriptions = state.pushSubscriptions.filter(item => item.endpoint !== subscription.endpoint);
  state.pushSubscriptions.push({ ...subscription, userId: user.id, createdAt: new Date().toISOString() });
  const own = state.pushSubscriptions.filter(item => item.userId === user.id);
  if (own.length > 5) {
    const expired = new Set(own.slice(0, own.length - 5).map(item => item.endpoint));
    state.pushSubscriptions = state.pushSubscriptions.filter(item => !expired.has(item.endpoint));
  }
  save(state);
}

function unsubscribe(state, save, user, endpoint) {
  const before = (state.pushSubscriptions || []).length;
  state.pushSubscriptions = (state.pushSubscriptions || []).filter(item => item.userId !== user.id || item.endpoint !== endpoint);
  if (state.pushSubscriptions.length !== before) save(state);
}

async function deliverDue({ state, save, send = webpush.sendNotification, now = Date.now() }) {
  const from = now - 24 * 3600_000;
  state.reminderDeliveries ||= [];
  let changed = false, sent = 0;
  const validUsers = new Set(state.users.filter(user => user.active).map(user => user.id));
  for (const item of state.plannerItems) {
    const due = Date.parse(item.dueAt);
    if (item.done || item.scheduled === false || !Number.isFinite(due) || due > now || due < from || !validUsers.has(item.userId)) continue;
    for (const sub of state.pushSubscriptions || []) {
      if (sub.userId !== item.userId || Date.parse(sub.createdAt || '1970-01-01') > due) continue;
      let delivery = state.reminderDeliveries.find(row => row.itemId === item.id && row.endpoint === sub.endpoint && (!row.dueAt || row.dueAt === item.dueAt));
      if (delivery && (!delivery.status || delivery.status === 'sent' || delivery.status === 'expired' || delivery.attempts >= 5 || Date.parse(delivery.nextAttemptAt || 0) > now)) continue;
      if (!delivery) { delivery = { itemId: item.id, userId: item.userId, dueAt: item.dueAt, endpoint: sub.endpoint, at: new Date(now).toISOString(), attempts: 0 }; state.reminderDeliveries.push(delivery); }
      delivery.attempts++; delivery.status = 'sending'; save(state);
      try {
        await send({ endpoint: sub.endpoint, keys: sub.keys }, JSON.stringify({ title: now - due > 5 * 60_000 ? '补发日程提醒' : '日程提醒', body: item.title.slice(0, 120), itemId: item.id, dueAt: item.dueAt, url: '/app.html#calendar' }), { TTL: 3600, urgency: 'high', timeout: 10000 });
        Object.assign(delivery, { status: 'sent', at: new Date(now).toISOString(), error: null, nextAttemptAt: null });
        changed = true; sent++;
      } catch (error) {
        Object.assign(delivery, { status: 'failed', error: String(error.message || '推送失败').slice(0, 160), nextAttemptAt: new Date(now + Math.min(60, 2 ** delivery.attempts) * 60_000).toISOString() });
        if ([404, 410].includes(error.statusCode)) { state.pushSubscriptions = state.pushSubscriptions.filter(row => row.endpoint !== sub.endpoint); delivery.status = 'expired'; }
        changed = true;
      }
      save(state);
    }
  }
  const cutoff = now - 30 * 86400_000;
  const previousLength = state.reminderDeliveries.length;
  state.reminderDeliveries = state.reminderDeliveries.filter(item => Date.parse(item.at) >= cutoff);
  if (changed || state.reminderDeliveries.length !== previousLength) save(state);
  return sent;
}

async function testNotification({ state, user, endpoint, send = webpush.sendNotification }) {
  const sub = (state.pushSubscriptions || []).find(row => row.userId === user.id && row.endpoint === endpoint);
  if (!sub) throw new Error('此设备尚未开启提醒');
  await send({ endpoint: sub.endpoint, keys: sub.keys }, JSON.stringify({ title: '通知测试', body: '你的设备已接通 Polynomial 日程提醒。', itemId: 'test', url: '/app.html#calendar' }), { TTL: 60, urgency: 'high', timeout: 10000 });
}
module.exports = { validSubscription, vapidKeys, subscribe, unsubscribe, deliverDue, testNotification };
