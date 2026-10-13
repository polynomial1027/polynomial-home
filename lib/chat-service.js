const crypto = require('node:crypto');
const assistant = require('./assistant');
const { safeOffPeakStart } = require('./pricing');

function validateMessage(value) {
  const message = String(value || '').trim();
  if (!message || message.length > 2000) throw new Error('消息需为 1–2000 字');
  return message;
}

function queueChat(state, save, user, value, now = new Date()) {
  const message = validateMessage(value);
  if (state.assistantQueuedChats.filter(item => item.status === 'pending').length >= 200 || state.assistantQueuedChats.filter(item => item.userId === user.id && item.status === 'pending').length >= 10) {
    const error = new Error('低谷发送队列已满，请稍后再试'); error.code = 'QUEUE_LIMIT'; throw error;
  }
  const item = { id: crypto.randomUUID(), userId: user.id, message, status: 'pending', createdAt: now.toISOString() };
  state.assistantQueuedChats.push(item); save(state);
  return item;
}

async function sendChat({ state, save, user, value, key, model, complete = assistant.complete }) {
  const message = validateMessage(value);
  const recent = state.assistantChats.filter(item => item.userId === user.id).slice(-8);
  const messages = [{ role: 'system', content: '你是 Polynomial Server 的个人助理。用简洁中文回答。你没有服务器命令、邮箱或日历工具；不要声称已经执行操作。' }, ...recent.map(item => ({ role: item.role, content: item.content })), { role: 'user', content: message }];
  const maxOutput = Math.max(1, Math.min(4096, Number(state.settings.assistantMaxOutputTokens || 512)));
  const reservation = assistant.reserve(state, save, user, assistant.estimateReservation(messages, maxOutput));
  try {
    const result = await complete({ key, model, messages, maxOutput });
    assistant.finish(state, save, reservation, result.tokens || reservation.tokens, 'completed');
    state.assistantChats.push({ id: crypto.randomUUID(), userId: user.id, role: 'user', content: message, at: new Date().toISOString() }, { id: crypto.randomUUID(), userId: user.id, role: 'assistant', content: result.content, at: new Date().toISOString() });
    state.assistantChats = state.assistantChats.slice(-3000); save(state);
    return result.content;
  } catch (error) {
    assistant.finish(state, save, reservation, 0, 'failed');
    throw error;
  }
}

async function processQueuedChats({ state, save, key, model, allowed, clock = () => new Date(), complete = assistant.complete }) {
  if (!key || !state.settings.assistantEnabled || !safeOffPeakStart(clock(), model)) return 0;
  let processed = 0;
  for (const item of state.assistantQueuedChats.filter(row => row.status === 'pending').slice(0, 10)) {
    if (!safeOffPeakStart(clock(), model)) break;
    const user = state.users.find(row => row.id === item.userId && row.active);
    if (!user || !allowed(user, 'accessAssistant')) { item.status = 'failed'; item.error = '账号已停用或 AI 权限已关闭'; delete item.message; save(state); processed++; continue; }
    item.status = 'running'; save(state);
    try { await sendChat({ state, save, user, value: item.message, key, model, complete }); item.status = 'completed'; item.completedAt = new Date().toISOString(); }
    catch (error) { item.status = 'failed'; item.error = String(error.message || '发送失败').slice(0, 160); }
    delete item.message;
    save(state);
    processed++;
  }
  if (processed) { state.assistantQueuedChats = state.assistantQueuedChats.filter(item => item.status === 'pending' || clock().getTime() - new Date(item.createdAt).getTime() < 30 * 86400_000); save(state); }
  return processed;
}

module.exports = { validateMessage, queueChat, sendChat, processQueuedChats };
