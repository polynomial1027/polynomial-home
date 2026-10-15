(() => {
  if (!['/', '/index.html', '/workspace.html', '/admin.html', '/download.html', '/ai-records.html'].includes(location.pathname)) return;
  document.body.dataset.connected = 'true';
  const style = document.createElement('link'); style.rel = 'stylesheet'; style.href = '/assets/connected-shell.css'; document.head.append(style);
  function apply() {
    let choice = 'time'; try { choice = localStorage.getItem('polynomial:appearance') || 'time'; } catch {}
    const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Shanghai', hour: 'numeric', hourCycle: 'h23' }).format(new Date()));
    const dark = choice === 'dark' || choice === 'system' && matchMedia('(prefers-color-scheme: dark)').matches || choice === 'time' && (hour < 5 || hour >= 18);
    document.body.dataset.theme = dark ? 'dark' : 'light';
    document.body.dataset.period = hour < 5 ? 'dawn' : hour < 11 ? 'morning' : hour < 14 ? 'noon' : hour < 18 ? 'afternoon' : 'night';
    const meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.content = dark ? '#142321' : '#f4f6f3';
  }
  apply(); setInterval(apply, 60000); window.addEventListener('storage', apply); matchMedia('(prefers-color-scheme: dark)').addEventListener('change', apply);
})();
