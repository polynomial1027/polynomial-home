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
  const from = now - 5 * 60_000;
  state.reminderDeliveries ||= [];
  let changed = false, sent = 0;
  const validUsers = new Set(state.users.filter(user => user.active).map(user => user.id));
  for (const item of state.plannerItems) {
    const due = Date.parse(item.dueAt);
    if (item.done || item.scheduled === false || !Number.isFinite(due) || due > now || due < from || !validUsers.has(item.userId)) continue;
    for (const sub of state.pushSubscriptions || []) {
      if (sub.userId !== item.userId || state.reminderDeliveries.some(row => row.itemId === item.id && row.endpoint === sub.endpoint)) continue;
      try {
        await send({ endpoint: sub.endpoint, keys: sub.keys }, JSON.stringify({ title: '日程提醒', body: item.title.slice(0, 120), itemId: item.id, url: '/app.html#calendar' }), { TTL: 300, urgency: 'high' });
        state.reminderDeliveries.push({ itemId: item.id, endpoint: sub.endpoint, at: new Date(now).toISOString() });
        changed = true; sent++;
      } catch (error) {
        if ([404, 410].includes(error.statusCode)) { state.pushSubscriptions = state.pushSubscriptions.filter(row => row.endpoint !== sub.endpoint); changed = true; }
        else console.error('Reminder push failed:', error.message);
      }
    }
  }
  const cutoff = now - 30 * 86400_000;
  const previousLength = state.reminderDeliveries.length;
  state.reminderDeliveries = state.reminderDeliveries.filter(item => Date.parse(item.at) >= cutoff);
  if (changed || state.reminderDeliveries.length !== previousLength) save(state);
  return sent;
}

module.exports = { validSubscription, vapidKeys, subscribe, unsubscribe, deliverDue };
