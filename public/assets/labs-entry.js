fetch('/api/me', { cache: 'no-store', credentials: 'same-origin' }).then(r => r.json()).then(({ user }) => {
  if (user?.role === 'admin') document.getElementById('homeLabs').hidden = false;
}).catch(() => {});
