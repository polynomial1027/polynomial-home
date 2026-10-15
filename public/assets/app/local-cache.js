(() => {
  const KEY = 'polynomial:offline-calendar', ENABLED = 'polynomial:offline-calendar-enabled';
  const setEnabled = value => { localStorage.setItem(ENABLED, value ? 'true' : 'false'); if (!value) localStorage.removeItem(KEY); };
  function save(data) {
    if (localStorage.getItem(ENABLED) !== 'true') return;
    // The explicit device preference stores only calendar data, never chats,
    // administrator reports, API pricing, passwords or security settings.
    const safe = { savedAt: new Date().toISOString(), user: { id: data.user.id, username: data.user.username, displayName: data.user.displayName, role: 'member', permissions: { accessPlanner: true } }, planner: data.planner, brief: { ...data.brief, report: null, review: null, seen: true }, chats: [], health: [], assistant: { allowed: false, enabled: false, configured: false, queue: [], pricing: { peak: false } } };
    localStorage.setItem(KEY, JSON.stringify(safe));
  }
  function load() { if (localStorage.getItem(ENABLED) !== 'true') return null; try { const value = JSON.parse(localStorage.getItem(KEY)); return value?.user?.id && Date.now() - Date.parse(value.savedAt) < 30 * 86400_000 ? value : null; } catch { return null; } }
  function clear() { localStorage.removeItem(KEY); }
  window.PolynomialCalendarCache = { save, load, clear, setEnabled, enabled: () => localStorage.getItem(ENABLED) === 'true' };
})();
