const { dayKey } = require('./assistant');

function cost(record) {
  const d = record.detail, u = d?.usage, p = d?.pricing;
  if (!u || !p?.rates || [u.cacheHitTokens, u.cacheMissTokens, u.outputTokens].some(n => n == null)) return null;
  if (u.inputTokens == null || u.cacheHitTokens + u.cacheMissTokens !== u.inputTokens) return null;
  const i = p.peak ? 1 : 0;
  const cachedInput = u.cacheHitTokens * p.rates.cachedInput[i] / 1e6;
  const input = u.cacheMissTokens * p.rates.input[i] / 1e6;
  const output = u.outputTokens * p.rates.output[i] / 1e6;
  return { cachedInput, input, output, total: cachedInput + input + output, currency: 'CNY', estimated: true };
}

function view(state, record) {
  const user = state.users.find(u => u.id === record.userId);
  const d = record.detail;
  return { id: record.id, userId: record.userId, username: user?.username || '已删除账号', displayName: user?.displayName || '已删除账号', at: record.at, finishedAt: record.finishedAt, status: record.status, tokens: record.tokens, reservedTokens: record.reservedTokens ?? null, tokenBasis: record.tokenBasis || 'legacy', source: d?.source || 'legacy', model: d?.model || null, usage: d?.usage || null, cost: cost(record), pricing: d?.pricing || null, hasDetail: Boolean(d), preview: d?.messages?.filter(m => m.role === 'user').at(-1)?.content.slice(0, 160) || '旧记录未保存逐次对话关联' };
}

function list(state, params, now = new Date()) {
  const date = params.get('date') || dayKey(now);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00+08:00`)) || dayKey(new Date(`${date}T00:00:00+08:00`)) !== date) throw new Error('请选择有效日期');
  const userId = params.get('userId') || '';
  if (userId && !state.users.some(u => u.id === userId)) throw new Error('用户不存在');
  const page = Number(params.get('page') || 1);
  if (!Number.isSafeInteger(page) || page < 1 || page > 100000) throw new Error('页码无效');
  const start = new Date(`${date}T00:00:00+08:00`), end = new Date(start.getTime() + 86400000);
  const rows = state.assistantUsage.filter(r => r.day === date && (!userId || r.userId === userId)).sort((a,b) => b.at.localeCompare(a.at)).map(r => view(state,r));
  const summary = { requests: rows.length, quotaTokens: 0, providerTokens: 0, reservedTokens: 0, inputTokens: 0, outputTokens: 0, cacheHitTokens: 0, cacheMissTokens: 0, knownCost: 0, unknownCostRequests: 0, failedRequests: 0 };
  for (const r of rows) {
    summary.quotaTokens += r.tokens;
    if (r.tokenBasis === 'provider') summary.providerTokens += r.tokens;
    else summary.reservedTokens += r.tokens;
    for (const key of ['inputTokens','outputTokens','cacheHitTokens','cacheMissTokens']) summary[key] += r.usage?.[key] || 0;
    if (r.cost) summary.knownCost += r.cost.total; else summary.unknownCostRequests++;
    if (r.status === 'failed') summary.failedRequests++;
  }
  const legacy = state.assistantChats.filter(r => !r.usageRecordId && (!userId || r.userId === userId) && new Date(r.at) >= start && new Date(r.at) < end);
  return { date, timezone: 'Asia/Shanghai', windowStart: start.toISOString(), windowEndExclusive: end.toISOString(), page, pageSize: 25, total: rows.length, records: rows.slice((page-1)*25,page*25), summary, users: state.users.map(({id,username,displayName}) => ({id,username,displayName})), legacyChatCount: legacy.length };
}

function detail(state, id) {
  const record = state.assistantUsage.find(r => r.id === id);
  return record ? { ...view(state, record), detail: record.detail || null } : null;
}

module.exports = { cost, list, detail };
