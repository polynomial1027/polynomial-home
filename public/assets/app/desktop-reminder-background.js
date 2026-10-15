(() => {
  if (!/PolynomialClient\/[\w.-]+ \((mac|windows|linux);/.test(navigator.userAgent)) return;
  const notifications = window.__TAURI__?.notification;
  if (!notifications) return;
  let checking = false;
  async function check() {
    if (checking || !navigator.onLine) return;
    checking = true;
    try {
      const response = await fetch('/api/workspace', { credentials: 'same-origin' });
      if (!response.ok) { if (response.status === 401) await window.__TAURI__?.core?.invoke('clear_reminders').catch(() => {}); return; }
      const { user, planner } = await response.json();
      if (localStorage.getItem(`reminders:${user.id}`) !== 'on') return;
      const version = navigator.userAgent.match(/PolynomialClient\/([\w.-]+)/)?.[1]?.split('.').map(Number);
      if (version && (version[0] > 0 || version[1] > 3 || version[1] === 3 && version[2] >= 8) && window.__TAURI__?.core) { await window.__TAURI__.core.invoke('sync_reminders', { userId: user.id, enabled: true, items: planner.filter(item => item.dueAt && !item.done && item.scheduled !== false).map(item => ({ id: item.id, title: item.title, dueEpochMs: Date.parse(item.dueAt) })) }); return; }
      const now = Date.now();
      for (const item of planner) {
        const due = Date.parse(item.dueAt), sentKey = `reminder-sent:${user.id}:${item.id}:${item.dueAt}`;
        if (item.done || item.scheduled === false || !Number.isFinite(due) || due > now || due < now - 24 * 3600_000 || localStorage.getItem(sentKey)) continue;
        notifications.sendNotification({ title: '日程提醒', body: item.title });
        localStorage.setItem(sentKey, String(now));
      }
    } catch (error) { console.warn('Desktop reminder:', error); }
    finally { checking = false; }
  }
  check();
  setInterval(check, 15_000);
  window.addEventListener('focus', check);
})();
