const crypto = require('node:crypto');
const { dayKey } = require('./assistant');

const localDay = value => dayKey(new Date(value));
const nextDay = day => {
  const date = new Date(`${day}T00:00:00+08:00`);
  return dayKey(new Date(date.getTime() + 86400_000));
};

function createItem(state, save, user, input, source = 'manual') {
  const title = String(input.title || '').trim();
  const dueAt = input.dueAt ? new Date(input.dueAt) : null;
  if (!title || title.length > 120 || (dueAt && !Number.isFinite(dueAt.getTime()))) throw new Error('请输入有效的事项和提醒时间');
  if (state.plannerItems.filter(item => item.userId === user.id && !item.done).length >= 100) throw new Error('最多保存 100 个待办事项');
  const item = { id: crypto.randomUUID(), userId: user.id, title, dueAt: dueAt?.toISOString() || null, done: false, scheduled: true, source, createdAt: new Date().toISOString(), completedAt: null };
  state.plannerItems.push(item); save(state);
  return item;
}

function updateItem(state, save, user, id, input) {
  const item = state.plannerItems.find(row => row.id === id && row.userId === user.id);
  if (!item) return null;
  if (typeof input.done === 'boolean') {
    item.done = input.done;
    item.completedAt = item.done ? new Date().toISOString() : null;
  }
  if (typeof input.scheduled === 'boolean') item.scheduled = input.scheduled;
  save(state);
  return item;
}

function dailyBrief(state, user, now = new Date()) {
  const today = dayKey(now), tomorrow = nextDay(today);
  const own = state.plannerItems.filter(item => item.userId === user.id);
  const completed = own.filter(item => item.done && item.completedAt && localDay(item.completedAt) === today);
  const tomorrowItems = own.filter(item => !item.done && item.dueAt && localDay(item.dueAt) === tomorrow);
  const report = user.role === 'admin' ? state.healthReports.find(item => item.day === today) || null : null;
  const review = user.role === 'admin' ? state.assistantReviews.find(item => item.source === 'auto') || null : null;
  const seen = state.dailyBriefViews.find(item => item.userId === user.id && item.day === today);
  return { day: today, tomorrow, completed, tomorrowItems, report: report ? { severity: report.severity, notes: report.notes } : null, review: review ? { day: review.day, status: review.status, summary: review.summary, risk: review.risk, error: review.error } : null, seen: Boolean(seen), generatedBy: 'local-records' };
}

function markBriefSeen(state, save, user, now = new Date()) {
  const day = dayKey(now);
  if (!state.dailyBriefViews.some(item => item.userId === user.id && item.day === day)) {
    state.dailyBriefViews.push({ userId: user.id, day, at: now.toISOString() });
    state.dailyBriefViews = state.dailyBriefViews.filter(item => new Date(item.at).getTime() > now.getTime() - 40 * 86400_000);
    save(state);
  }
}

function isPlanningRequest(message) {
  return /(?:提醒我|帮我安排|安排.*(?:日程|计划)|加入.*(?:日程|计划|待办)|(?:明天|今天|下周).*(?:要做|提醒|安排|计划)|创建.*(?:提醒|待办|日程))/.test(message);
}

function parseAiPlan(content, now = new Date()) {
  const data = JSON.parse(content);
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('AI 计划格式错误');
  const reply = String(data.reply || '').trim().slice(0, 2000);
  if (!reply) throw new Error('AI 未返回计划说明');
  const plans = Array.isArray(data.plans) ? data.plans.slice(0, 5) : [];
  const valid = plans.map(plan => ({ title: String(plan.title || '').trim().slice(0, 120), dueAt: new Date(plan.dueAt) }))
    .filter(plan => plan.title && Number.isFinite(plan.dueAt.getTime()) && plan.dueAt.getTime() >= now.getTime() - 60_000 && plan.dueAt.getTime() < now.getTime() + 90 * 86400_000)
    .map(plan => ({ title: plan.title, dueAt: plan.dueAt.toISOString() }));
  return { reply, plans: valid };
}

module.exports = { createItem, updateItem, dailyBrief, markBriefSeen, isPlanningRequest, parseAiPlan };
