(() => {
  const button = document.querySelector('#enableReminders');
  const disable = document.querySelector('#disableReminders');
  const status = document.querySelector('#reminderStatus');
  const native = window.PolynomialReminders;
  const desktop = /PolynomialClient\/[\w.-]+ \((mac|windows|linux);/.test(navigator.userAgent);
  const tauri = window.__TAURI__?.notification;
  const version = navigator.userAgent.match(/PolynomialClient\/([\w.-]+)/)?.[1]?.split('.').map(Number);
  const nativeDesktop = desktop && version && (version[1] > 3 || version[1] === 3 && version[2] >= 8) && window.__TAURI__?.core?.invoke;
  async function desktopSync(enabled) { if (nativeDesktop) await window.__TAURI__.core.invoke('sync_reminders', { userId, enabled, items: currentTasks().map(item => ({ id: item.id, title: item.title, dueEpochMs: Date.parse(item.dueAt) })) }); }
  const desktopMessage = nativeDesktop ? '桌面提醒已开启；关闭窗口后会收起到托盘继续提醒。选择“退出”后停止。' : '桌面通知已开启；请保持客户端运行，升级 0.3.8 可使用托盘提醒。';
  let userId = null, items = [], webReady = null, pushPublicKey = null;
  const api = async (method, body) => {
    const response = await fetch('/api/workspace/reminders', { method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || '提醒设置失败');
    return result;
  };
  const base64 = value => Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4)), char => char.charCodeAt(0));
  const currentTasks = () => items.filter(item => item.dueAt && !item.done && item.scheduled !== false);
  function render(enabled, message) { status.textContent = message; button.hidden = enabled; disable.hidden = !enabled; }
  function desktopSchedule() {
    if (nativeDesktop || localStorage.getItem(`reminders:${userId}`) !== 'on' || !tauri) return;
    const now = Date.now();
    for (const item of items) {
      const due = Date.parse(item.dueAt), sentKey = `reminder-sent:${userId}:${item.id}:${item.dueAt}`;
      if (item.done || item.scheduled === false || !Number.isFinite(due) || due > now || due < now - 24 * 3600_000 || localStorage.getItem(sentKey)) continue;
      try { tauri.sendNotification({ title: '日程提醒', body: item.title }); localStorage.setItem(sentKey, String(now)); }
      catch (error) { console.warn('Desktop reminder:', error); }
    }
  }
  setInterval(desktopSchedule, 15_000);
  window.addEventListener('focus', desktopSchedule);
  async function webRegistration() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) throw new Error('此浏览器暂不支持后台提醒。iPhone 请先通过 Safari 添加到主屏幕。');
    await navigator.serviceWorker.register('/app-sw.js');
    return navigator.serviceWorker.ready;
  }
  async function sync(data) {
    userId = data.user.id; items = data.planner;
    if (native) {
      native.sync(JSON.stringify({ userId, items: currentTasks().map(({ id, title, dueAt }) => ({ id, title, dueAt })) }));
      render(native.enabled(), native.enabled() ? '已使用安卓设备通知；日程会在本机后台提醒。' : '开启后，安卓设备会在日程时间发送通知。');
      return;
    }
    if (desktop) {
      const enabled = localStorage.getItem(`reminders:${userId}`) === 'on' && await tauri?.isPermissionGranted();
      await desktopSync(enabled); desktopSchedule();
      render(enabled, enabled ? desktopMessage : '开启桌面通知；客户端运行时会按日程提醒。');
      return;
    }
    try {
      const registration = await webRegistration();
      const configuration = await api('GET');
      webReady = registration; pushPublicKey = configuration.publicKey;
      const failed = (configuration.deliveries || []).filter(row => row.status === 'failed');
      document.querySelector('#reminderHistory').textContent = failed.length ? `${failed.length} 次后台推送失败，系统将有限重试。请发送测试通知检查此设备。` : (configuration.deliveries || []).some(row => row.status === 'sent') ? '最近后台推送已交给通知服务。' : '';
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
        localStorage.setItem(`reminders:${userId}`, 'on'); await desktopSync(true); desktopSchedule();
        render(true, desktopMessage);
      } else {
        if (!webReady || !pushPublicKey) throw new Error('通知配置正在加载，请稍后再次点击。');
        const subscription = await webReady.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64(pushPublicKey) });
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
      else if (desktop) { localStorage.removeItem(`reminders:${userId}`); if (nativeDesktop) await window.__TAURI__.core.invoke('clear_reminders'); desktopSchedule(); }
      else {
        const registration = await webRegistration();
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) { await api('DELETE', { endpoint: subscription.endpoint }); await subscription.unsubscribe(); }
      }
      render(false, '此设备的日程提醒已关闭。');
    } catch (error) { status.textContent = error.message; }
    finally { disable.disabled = false; }
  };
  document.querySelector('#testReminders').onclick = async event => {
    const button = event.currentTarget; button.disabled = true;
    try {
      if (native) { if (!native.enabled()) throw new Error('请先开启设备提醒'); if (!native.testNotification) throw new Error('请升级安卓客户端后测试通知'); native.testNotification(); }
      else if (desktop) { if (!tauri || !await tauri.isPermissionGranted()) throw new Error('请先开启系统通知权限'); await tauri.sendNotification({ title: '通知测试', body: '你的设备已接通 Polynomial 日程提醒。' }); }
      else { const subscription = await webReady?.pushManager.getSubscription(); if (!subscription) throw new Error('请先开启设备提醒'); const response = await fetch('/api/workspace/reminders/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: subscription.endpoint }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error); }
      document.querySelector('#reminderHistory').textContent = '测试通知已提交，请检查系统通知中心。';
    } catch (error) { document.querySelector('#reminderHistory').textContent = error.message; }
    finally { button.disabled = false; }
  };
  window.PolynomialReminderUI = { sync, logout: async () => { if (native) native.disable(); else if (desktop) { localStorage.removeItem(`reminders:${userId}`); if (nativeDesktop) await window.__TAURI__.core.invoke('clear_reminders'); desktopSchedule(); } else { const registration = await webRegistration().catch(() => null); const sub = await registration?.pushManager.getSubscription(); if (sub) { await api('DELETE', { endpoint: sub.endpoint }); await sub.unsubscribe(); } } } };
})();
