const crypto = require('node:crypto');
const assistant = require('./assistant');
const planner = require('./planner');
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
  const planMode = planner.isPlanningRequest(message);
  const today = assistant.dayKey(), tomorrow = assistant.dayKey(new Date(Date.now() + 86400_000));
  const system = planMode
    ? `你是个人日程助手。当前北京时间日期是 ${today}，明天严格指 ${tomorrow}；当前 UTC 时间 ${new Date().toISOString()}。用户时区 Asia/Shanghai。只返回 JSON 对象：{"reply":"给用户的简洁中文说明","plans":[{"title":"事项","dueAt":"带时区的 ISO 8601 时间"}]}。最多 5 项，未来 90 天以内。有明确日期时间的事项才放入 plans；不确定时先在 reply 中询问。不要把“明天”安排到今天。这里不能读取邮箱、发送邮件、执行服务器命令或连接外部日历，不得声称已执行。邮件相关安排只能建立待办。`
    : '你是 Polynomial Server 的个人助理。用简洁中文回答。你没有服务器命令、邮箱或外部日历工具；不要声称已经执行操作。数学公式请用标准 LaTeX 定界符：行内 $...$，独立公式 $$...$$。';
  const messages = [{ role: 'system', content: system }, ...recent.map(item => ({ role: item.role, content: item.content })), { role: 'user', content: message }];
  const maxOutput = Math.max(1, Math.min(4096, Number(state.settings.assistantMaxOutputTokens || 512)));
  const reservation = assistant.reserve(state, save, user, assistant.estimateReservation(messages, maxOutput));
  try {
    const result = await complete({ key, model, messages, maxOutput, jsonMode: planMode, disableThinking: planMode });
    assistant.finish(state, save, reservation, result.tokens || reservation.tokens, 'completed');
    let reply = result.content;
    if (planMode) {
      const parsed = planner.parseAiPlan(reply);
      const slots = Math.max(0, 100 - state.plannerItems.filter(item => item.userId === user.id && !item.done).length);
      const created = parsed.plans.slice(0, slots).map(item => planner.createItem(state, save, user, item, 'assistant'));
      reply = `${parsed.reply}${created.length ? `\n\n已加入计划与日历：${created.map(item => item.title).join('、')}` : ''}${parsed.plans.length > slots ? '\n部分事项未加入：待办数量已达上限。' : ''}`;
    }
    if (!reply.trim()) throw new Error('AI 未返回可显示的回答，请重试');
    state.assistantChats.push({ id: crypto.randomUUID(), userId: user.id, role: 'user', content: message, at: new Date().toISOString() }, { id: crypto.randomUUID(), userId: user.id, role: 'assistant', content: reply, at: new Date().toISOString() });
    state.assistantChats = state.assistantChats.slice(-3000); save(state);
    return reply;
  } catch (error) {
    if (reservation.status === 'reserved') assistant.finish(state, save, reservation, 0, 'failed');
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
