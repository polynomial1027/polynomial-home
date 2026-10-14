(() => {
  const button = document.querySelector('#enableReminders');
  const disable = document.querySelector('#disableReminders');
  const status = document.querySelector('#reminderStatus');
  const native = window.PolynomialReminders;
  const desktop = /PolynomialClient\/[\w.-]+ \((mac|windows|linux);/.test(navigator.userAgent);
  const tauri = window.__TAURI__?.notification;
  let userId = null, items = [], timers = [];
  const api = async (method, body) => {
    const response = await fetch('/api/workspace/reminders', { method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || '提醒设置失败');
    return result;
  };
  const base64 = value => Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4)), char => char.charCodeAt(0));
  const currentTasks = () => items.filter(item => item.dueAt && !item.done && item.scheduled !== false && new Date(item.dueAt).getTime() > Date.now());
  function render(enabled, message) { status.textContent = message; button.hidden = enabled; disable.hidden = !enabled; }
  function desktopSchedule() {
    timers.forEach(clearTimeout); timers = [];
    if (localStorage.getItem(`reminders:${userId}`) !== 'on' || !tauri) return;
    for (const item of currentTasks()) {
      const delay = new Date(item.dueAt).getTime() - Date.now();
      if (delay > 2_147_000_000) continue;
      timers.push(setTimeout(() => {
        if (localStorage.getItem(`reminders:${userId}`) === 'on') Promise.resolve(tauri.sendNotification({ title: '日程提醒', body: item.title })).catch(() => {});
      }, delay));
    }
  }
  async function webRegistration() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) throw new Error('此浏览器暂不支持后台提醒。iPhone 请先通过 Safari 添加到主屏幕。');
    return navigator.serviceWorker.register('/app-sw.js');
  }
  async function sync(data) {
    userId = data.user.id; items = data.planner;
    if (native) {
      native.sync(JSON.stringify({ userId, items: currentTasks().map(({ id, title, dueAt }) => ({ id, title, dueAt })) }));
      render(native.enabled(), native.enabled() ? '已使用安卓设备通知；日程会在本机后台提醒。' : '开启后，安卓设备会在日程时间发送通知。');
      return;
    }
    if (desktop) {
      const enabled = localStorage.getItem(`reminders:${userId}`) === 'on';
      desktopSchedule();
      render(enabled, enabled ? '桌面系统通知已开启；请保持客户端运行以接收提醒。' : '开启桌面通知；客户端运行时会按日程提醒。');
      return;
    }
    try {
      const registration = await webRegistration();
      const subscription = await registration.pushManager.getSubscription();
      if (subscription && Notification.permission === 'granted') {
        await api('POST', { subscription: subscription.toJSON() });
        render(true, '后台提醒已开启；关闭页面后仍可收到日程通知。');
      } else render(false, '开启设备通知后，日程到期会自动提醒。');
    } catch (error) { render(false, error.message); }
  }
  window.addEventListener('polynomial-reminder-permission', () => { if (native) render(native.enabled(), native.enabled() ? '已使用安卓设备通知；日程会在本机后台提醒。' : '设备未授予通知权限，请在系统设置中允许。'); });
  button.onclick = async () => {
    button.disabled = true;
    try {
      if (native) { native.enable(JSON.stringify({ userId, items: currentTasks().map(({ id, title, dueAt }) => ({ id, title, dueAt })) })); render(true, '正在请求安卓通知权限…'); }
      else if (desktop) {
        if (!tauri) throw new Error('请安装最新版桌面客户端，以使用系统通知。');
        const permission = await tauri.requestPermission();
        if (permission !== 'granted') throw new Error('设备未授予通知权限，请在系统设置中允许。');
        localStorage.setItem(`reminders:${userId}`, 'on'); desktopSchedule();
        render(true, '桌面系统通知已开启；请保持客户端运行以接收提醒。');
      } else {
        const registration = await webRegistration();
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') throw new Error('设备未授予通知权限，请在浏览器设置中允许。');
        const { publicKey } = await api('GET');
        const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64(publicKey) });
        await api('POST', { subscription: subscription.toJSON() });
        render(true, '后台提醒已开启；关闭页面后仍可收到日程通知。');
      }
    } catch (error) { render(false, error.message); }
    finally { button.disabled = false; }
  };
  disable.onclick = async () => {
    disable.disabled = true;
    try {
      if (native) native.disable();
      else if (desktop) { localStorage.removeItem(`reminders:${userId}`); desktopSchedule(); }
      else {
        const registration = await webRegistration();
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) { await api('DELETE', { endpoint: subscription.endpoint }); await subscription.unsubscribe(); }
      }
      render(false, '此设备的日程提醒已关闭。');
    } catch (error) { status.textContent = error.message; }
    finally { disable.disabled = false; }
  };
  window.PolynomialReminderUI = { sync, logout: async () => { if (native) native.disable(); else if (desktop) { localStorage.removeItem(`reminders:${userId}`); desktopSchedule(); } else { const registration = await webRegistration().catch(() => null); const sub = await registration?.pushManager.getSubscription(); if (sub) { await api('DELETE', { endpoint: sub.endpoint }); await sub.unsubscribe(); } } } };
})();
