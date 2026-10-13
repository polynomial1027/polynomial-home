const crypto = require('node:crypto');
const assistant = require('./assistant');
const { shanghaiParts } = require('./pricing');

const SAFE_ACTION = 'cleanup_expired_sessions';

function autoReviewDue(state, now = new Date()) {
  const frequency = state.settings.assistantReviewFrequency || (state.settings.assistantAutoReview ? 'daily' : 'off');
  if (frequency === 'off') return false;
  const local = shanghaiParts(now);
  const dayStart = Date.UTC(local.year, local.month - 1, local.day) - 8 * 3600_000;
  const periodStart = frequency === 'weekly' ? dayStart - ((local.weekday + 6) % 7) * 86400_000 : dayStart;
  return !state.assistantReviews.some(item => item.source === 'auto' && new Date(item.createdAt).getTime() >= periodStart);
}

function messagesForReport(report) {
  const facts = {
    day: report.day,
    appLoginSuccess: report.loginSuccess,
    appLoginFailed: report.loginFailed,
    repeatedFailureSources: report.suspicious.map(item => item.count),
    sshLogStatus: report.systemLogin?.status || 'unavailable',
    sshAccepted: report.systemLogin?.accepted || 0,
    sshFailed: report.systemLogin?.failed || 0,
    memory: report.memory,
    disk: report.disk,
    loadAverage: report.loadAverage,
    uptimeHours: report.uptimeHours,
    expiredSessions: report.expiredSessions || 0
  };
  return [
    { role: 'system', content: '你是服务器只读巡检助手。只根据给出的汇总指标分析，不要声称读取了原始日志或执行过命令。只返回 JSON 对象，字段为 summary（中文，最多300字）、risk（normal/warning/critical）、actions（字符串数组）。actions 只能包含 cleanup_expired_sessions；只有确实有必要清理过期会话时才建议它。不要包含其他字段、命令、脚本或敏感数据。' },
    { role: 'user', content: `请分析以下巡检汇总并给出保守建议。只输出 JSON。\n${JSON.stringify(facts)}` }
  ];
}

function parseReview(content) {
  const parsed = JSON.parse(content);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('AI 巡检结果格式错误');
  const summary = String(parsed.summary || '').trim().slice(0, 300);
  if (!summary) throw new Error('AI 巡检结果缺少摘要');
  return {
    summary,
    risk: ['normal', 'warning', 'critical'].includes(parsed.risk) ? parsed.risk : 'warning',
    actions: Array.isArray(parsed.actions) && parsed.actions.includes(SAFE_ACTION) ? [SAFE_ACTION] : []
  };
}

function executeSafeActions(state, save, actionIds, now = new Date()) {
  const executed = [];
  if (actionIds.includes(SAFE_ACTION)) {
    const before = state.sessions.length;
    state.sessions = state.sessions.filter(session => new Date(session.expiresAt).getTime() > now.getTime());
    executed.push({ id: SAFE_ACTION, removed: before - state.sessions.length });
    save(state);
  }
  return executed;
}

async function runReview({ state, save, user, key, model, report, source = 'manual', complete = assistant.complete }) {
  if (!key || state.settings.assistantEnabled !== true) throw new Error('请先配置 API 密钥并开启 AI 对话');
  if (source === 'auto' && state.assistantReviews.some(item => item.day === report.day && item.source === 'auto')) return null;
  const messages = messagesForReport(report), maxOutput = Math.min(512, Math.max(1, Number(state.settings.assistantMaxOutputTokens || 512)));
  const reservation = assistant.reserve(state, save, user, assistant.estimateReservation(messages, maxOutput));
  const entry = { id: crypto.randomUUID(), day: report.day, source, userId: user.id, status: 'running', createdAt: new Date().toISOString(), summary: '', risk: null, proposedActions: [], executedActions: [] };
  state.assistantReviews.unshift(entry); save(state);
  try {
    const result = await complete({ key, model, messages, maxOutput, jsonMode: true });
    assistant.finish(state, save, reservation, result.tokens || reservation.tokens, 'completed');
    const review = parseReview(result.content);
    entry.summary = review.summary;
    entry.risk = review.risk;
    entry.proposedActions = review.actions;
    if (state.settings.assistantAutoMaintenance === true) entry.executedActions = executeSafeActions(state, save, review.actions);
    entry.status = 'completed';
  } catch (error) {
    if (reservation.status === 'reserved') assistant.finish(state, save, reservation, 0, 'failed');
    entry.status = 'failed';
    entry.error = String(error.message || '巡检失败').slice(0, 160);
  }
  state.assistantReviews = state.assistantReviews.slice(0, 90);
  save(state);
  return entry;
}

module.exports = { SAFE_ACTION, autoReviewDue, messagesForReport, parseReview, executeSafeActions, runReview };
