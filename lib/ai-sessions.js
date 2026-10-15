const crypto = require('node:crypto'), tools = require('./ai-tools');
const locks = new WeakMap();
function busy(state, id) { return locks.get(state)?.has(id) || false; }
function acquire(state, id) { if (!locks.has(state)) locks.set(state, new Set()); if (busy(state, id)) throw tools.error('此会话正在回复，请等待完成后再发送', 409); locks.get(state).add(id); return () => locks.get(state).delete(id); }
function create(state, user, input = {}, migration = false) {
  state.assistantSessions ||= [];
  if (!migration && state.assistantSessions.filter(row => row.userId === user.id).length >= 100) throw tools.error('每个账号最多保存 100 个会话，请先导出并删除不需要的会话');
  const title = input.title === undefined ? '新的对话' : typeof input.title === 'string' ? input.title.trim() : '';
  if (!title || title.length > 80) throw tools.error('会话名称需为 1–80 字');
  const now = new Date().toISOString(), row = { id: crypto.randomUUID(), userId: user.id, title, autoTitle: input.title === undefined, pinned: false, archived: false, createdAt: now, updatedAt: now, ...tools.resolve(state, user, input) };
  state.assistantSessions.push(row); return row;
}
function migrate(state) {
  state.assistantSessions ||= []; state.assistantTemplates ||= [];
  for (const user of state.users || []) ensure(state, user);
}
function ensure(state, user) {
  state.assistantSessions ||= []; state.assistantChats ||= []; state.assistantQueuedChats ||= [];
  let changed = false;
  const legacy = [...state.assistantChats, ...state.assistantQueuedChats].filter(row => row.userId === user.id && !row.sessionId);
  let session = state.assistantSessions.find(row => row.userId === user.id && row.legacy);
  if (legacy.length && !session) { session = create(state, user, { title: '历史对话' }, true); session.legacy = true; changed = true; }
  if (session) for (const row of legacy) { row.sessionId = session.id; changed = true; }
  if (!state.assistantSessions.some(row => row.userId === user.id)) { create(state, user); changed = true; }
  return changed;
}
function get(state, user, id, writable = false) {
  state.assistantSessions ||= [];
  if (!id) { ensure(state, user); id = (list(state, user).find(row => !row.archived) || list(state, user)[0])?.id; }
  const row = state.assistantSessions.find(row => row.id === id && row.userId === user.id);
  if (!row) throw tools.error('会话不存在或已删除', 404);
  if (writable && row.archived) throw tools.error('此会话已归档，请先恢复', 409);
  return row;
}
function list(state, user) {
  return (state.assistantSessions || []).filter(row => row.userId === user.id).map(({ userId, promptSnapshot, ...row }) => ({ ...row, busy: busy(state, row.id), messageCount: (state.assistantChats || []).filter(item => item.sessionId === row.id && item.userId === user.id).length })).sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt));
}
function update(state, user, id, input) {
  const row = get(state, user, id);
  if (busy(state, id)) throw tools.error('会话正在回复，请稍后修改', 409);
  if (input.ifUnmodifiedSince !== row.updatedAt) throw tools.error('会话已在其他设备修改，请刷新', 409);
  const changes = {};
  if (Object.hasOwn(input, 'title')) { if (typeof input.title !== 'string' || !input.title.trim() || input.title.trim().length > 80) throw tools.error('会话名称需为 1–80 字'); changes.title = input.title.trim(); changes.autoTitle = false; changes.autoTitleGeneratedAt = null; }
  for (const field of ['pinned', 'archived']) if (Object.hasOwn(input, field)) { if (typeof input[field] !== 'boolean') throw tools.error('会话状态格式错误'); changes[field] = input[field]; }
  if (changes.archived && state.assistantQueuedChats.some(item => item.sessionId === id && ['pending', 'running'].includes(item.status))) throw tools.error('请先取消本会话的低峰队列，或等待执行完成', 409);
  Object.assign(row, changes, { updatedAt: new Date(Math.max(Date.now(), Date.parse(row.updatedAt) + 1)).toISOString() }); return row;
}
function remove(state, user, id, version) {
  const row = get(state, user, id);
  if (busy(state, id) || state.assistantQueuedChats.some(item => item.sessionId === id && ['pending', 'running'].includes(item.status))) throw tools.error('会话仍有回复或排队消息，请先取消队列或等待完成', 409);
  if (version !== row.updatedAt) throw tools.error('会话已更新，请刷新后重试', 409);
  state.assistantChats = state.assistantChats.filter(item => !(item.sessionId === id && item.userId === user.id));
  state.assistantSessions = state.assistantSessions.filter(item => item !== row);
}
function view(state, user, id) { const row = get(state, user, id); return { session: list(state, user).find(item => item.id === row.id), messages: state.assistantChats.filter(item => item.userId === user.id && item.sessionId === row.id).map(({ userId, ...safe }) => safe) }; }
module.exports = { create, ensure, migrate, get, list, update, remove, view, busy, acquire };
