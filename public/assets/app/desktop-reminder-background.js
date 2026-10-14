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
      if (!response.ok) return;
      const { user, planner } = await response.json();
      if (localStorage.getItem(`reminders:${user.id}`) !== 'on') return;
      const now = Date.now();
      for (const item of planner) {
        const due = Date.parse(item.dueAt), sentKey = `reminder-sent:${user.id}:${item.id}`;
        if (item.done || item.scheduled === false || !Number.isFinite(due) || due > now || due < now - 5 * 60_000 || localStorage.getItem(sentKey)) continue;
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
