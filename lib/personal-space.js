const toolPermissions = { assistant: 'accessAssistant', drive: 'driveEnabled', chat: 'accessChat', learning: 'accessLearning', calendar: 'accessPlanner', games: 'accessGames', downloads: null, calculator: null, advanced: null, control: 'admin' };
const widgets = ['welcome', 'today', 'brief', 'tools'];
const permitted = (user, id) => Object.hasOwn(toolPermissions, id) && (user.role === 'admin' || toolPermissions[id] === null || toolPermissions[id] !== 'admin' && user.permissions?.[toolPermissions[id]] === true);
function preferences(user) {
  const saved = user.workspacePreferences || {};
  return { favorites: (Array.isArray(saved.favorites) ? saved.favorites : user.role==='guest'?['assistant','calendar','drive','games','calculator']:['drive', 'chat', 'learning', 'calendar']).filter(id => permitted(user, id)), hiddenWidgets: (Array.isArray(saved.hiddenWidgets) ? saved.hiddenWidgets : []).filter(id => widgets.includes(id)), updatedAt: saved.updatedAt || null };
}
function updatePreferences(user, data) {
  const invalid = message => { const error = new Error(message); error.status = 400; throw error; };
  if (!data || typeof data !== 'object' || Array.isArray(data) || Object.keys(data).some(key => !['favorites', 'hiddenWidgets', 'ifUnmodifiedSince'].includes(key))) invalid('个人空间设置格式不正确');
  if (!Object.hasOwn(data, 'ifUnmodifiedSince') || data.ifUnmodifiedSince !== preferences(user).updatedAt) { const error = new Error('其他设备已更新个人空间，请刷新后重新设置'); error.status = 409; throw error; }
  if (!Array.isArray(data.favorites) || data.favorites.length > 9 || data.favorites.some(id => typeof id !== 'string' || !permitted(user, id))) invalid('收藏包含不可用的工具');
  if (!Array.isArray(data.hiddenWidgets) || data.hiddenWidgets.length > widgets.length || data.hiddenWidgets.some(id => !widgets.includes(id))) invalid('首页组件设置不正确');
  const previous = Date.parse(user.workspacePreferences?.updatedAt) || 0;
  user.workspacePreferences = { favorites: [...new Set(data.favorites)], hiddenWidgets: [...new Set(data.hiddenWidgets)], updatedAt: new Date(Math.max(Date.now(), previous + 1)).toISOString() };
  return preferences(user);
}
function history(state, user, query) {
  const q = String(query.get('q') || '').trim().toLowerCase().slice(0, 120), date = String(query.get('date') || '');
  if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date)) throw new Error('请选择有效日期');
  const sessionId = query.get('sessionId') || '';
  if (sessionId && !(state.assistantSessions || []).some(row => row.id === sessionId && row.userId === user.id)) throw new Error('Unknown conversation');
  const rows = (state.assistantChats || []).filter(row => row.userId === user.id && (!sessionId || row.sessionId === sessionId) && ['user', 'assistant'].includes(row.role) && typeof row.content === 'string' && (!q || row.content.toLowerCase().includes(q)) && (!date || Number.isFinite(Date.parse(row.at || row.createdAt)) && new Date(Date.parse(row.at || row.createdAt) + 8 * 3600_000).toISOString().slice(0, 10) === date)).reverse();
  const pageSize = 20, pages = Math.max(1, Math.ceil(rows.length / pageSize)), page = Math.min(pages, Math.max(1, Math.floor(Number(query.get('page')) || 1)));
  return { messages: rows.slice((page - 1) * pageSize, page * pageSize).map(row => ({ role: row.role, content: row.content, at: row.at || row.createdAt || null })), total: rows.length, page, pages, pageSize, retentionDays: state.settings.aiRecordRetentionDays };
}
module.exports = { preferences, updatePreferences, history };
