const crypto = require('node:crypto');
const { priceWindow } = require('./pricing');

const limitKeys = ['dailyTokens', 'monthlyTokens', 'dailyRequests', 'monthlyRequests'];
const settingKeys = ['assistantDailyTokens', 'assistantMonthlyTokens', 'assistantDailyRequests', 'assistantMonthlyRequests', 'assistantDefaultUserDailyTokens', 'assistantDefaultUserMonthlyTokens', 'assistantDefaultUserDailyRequests', 'assistantDefaultUserMonthlyRequests', 'assistantMaxOutputTokens'];
const positiveInt = (value, max = 100000000) => Number.isSafeInteger(Number(value)) && Number(value) >= 0 && Number(value) <= max;
const dayKey = (date = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
const monthKey = (date = new Date()) => dayKey(date).slice(0, 7);

function limits(state, user) {
  const s = state.settings, u = user.assistantLimits || {};
  return {
    global: { dailyTokens: s.assistantDailyTokens, monthlyTokens: s.assistantMonthlyTokens, dailyRequests: s.assistantDailyRequests, monthlyRequests: s.assistantMonthlyRequests },
    user: {
      dailyTokens: u.dailyTokens ?? s.assistantDefaultUserDailyTokens,
      monthlyTokens: u.monthlyTokens ?? s.assistantDefaultUserMonthlyTokens,
      dailyRequests: u.dailyRequests ?? s.assistantDefaultUserDailyRequests,
      monthlyRequests: u.monthlyRequests ?? s.assistantDefaultUserMonthlyRequests
    }
  };
}

function usage(state, userId = null, now = new Date()) {
  const today = dayKey(now), month = monthKey(now);
  const relevant = state.assistantUsage.filter(item => !userId || item.userId === userId);
  const sum = (items, field) => items.reduce((total, item) => total + Number(item[field] || 0), 0);
  const daily = relevant.filter(item => item.day === today), monthly = relevant.filter(item => item.month === month);
  return { dailyTokens: sum(daily, 'tokens'), monthlyTokens: sum(monthly, 'tokens'), dailyRequests: sum(daily, 'requests'), monthlyRequests: sum(monthly, 'requests') };
}

function reserve(state, save, user, tokens, detail = null) {
  state.assistantUsage = state.assistantUsage.filter(item => Date.now() - new Date(item.at).getTime() < 400 * 86400_000);
  const caps = limits(state, user), globalUsage = usage(state), userUsage = usage(state, user.id);
  for (const [cap, spent] of [[caps.global, globalUsage], [caps.user, userUsage]]) {
    for (const key of limitKeys) {
      const next = spent[key] + (key.endsWith('Tokens') ? tokens : 1);
      if (next > cap[key]) { const error = new Error('AI 用量已达到管理员设置的上限'); error.code = 'AI_LIMIT'; throw error; }
    }
  }
  const now = new Date(), record = { id: crypto.randomUUID(), userId: user.id, day: dayKey(now), month: monthKey(now), tokens, requests: 1, status: 'reserved', at: now.toISOString() };
  record.reservedTokens = tokens;
  if (detail) record.detail = { source: detail.source, model: detail.model, messages: detail.messages.map(({ role, content }) => ({ role, content })), maxOutput: detail.maxOutput, pricing: priceWindow(now, detail.model) };
  state.assistantUsage.push(record); save(state);
  return record;
}

function finish(state, save, record, actualTokens, status, result = null) {
  // A failed HTTP exchange may still be billed upstream, so keep the reservation.
  if (status === 'completed') record.tokens = Math.max(0, Math.floor(actualTokens));
  record.status = status;
  record.finishedAt = new Date().toISOString();
  record.tokenBasis = status === 'completed' && result?.usage?.totalTokens != null ? 'provider' : 'reservation';
  if (record.detail && result) {
    record.detail.response = result.rawContent ?? result.content;
    record.detail.usage = result.usage || null;
    record.detail.error = result.error || null;
  }
  save(state);
}

function validateSettings(input) {
  const result = {};
  for (const key of settingKeys) if (input[key] !== undefined) {
    if (!positiveInt(input[key], key === 'assistantMaxOutputTokens' ? 4096 : 100000000) || (key === 'assistantMaxOutputTokens' && Number(input[key]) < 1)) throw new Error(`${key} 必须是有效的非负整数`);
    result[key] = Number(input[key]);
  }
  for (const key of ['assistantEnabled', 'assistantAutoReview', 'assistantAutoMaintenance']) if (input[key] !== undefined) result[key] = input[key] === true;
  if (input.assistantReviewFrequency !== undefined) {
    if (!['off', 'daily', 'weekly'].includes(input.assistantReviewFrequency)) throw new Error('巡检频率只能是关闭、每天或每周');
    result.assistantReviewFrequency = input.assistantReviewFrequency;
  }
  return result;
}

function validateUserLimits(input) {
  const result = {};
  for (const key of limitKeys) if (input[key] !== undefined) {
    if (input[key] === null) result[key] = null;
    else if (positiveInt(input[key])) result[key] = Number(input[key]);
    else throw new Error(`${key} 必须是有效的非负整数`);
  }
  return result;
}

function estimateReservation(messages, maxOutput) {
  // UTF-8 byte length is deliberately conservative for model input accounting.
  return Buffer.byteLength(JSON.stringify(messages), 'utf8') + 1024 + maxOutput;
}

async function complete({ key, model, messages, maxOutput, jsonMode = false, disableThinking = false, endpoint = 'https://api.deepseek.com/chat/completions' }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(endpoint, { method: 'POST', signal: controller.signal, headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model, messages, max_tokens: maxOutput, stream: false, ...(jsonMode ? { response_format: { type: 'json_object' } } : {}), ...(disableThinking ? { thinking: { type: 'disabled' } } : {}) }) });
    if (!response.ok) throw new Error(`DeepSeek 返回 HTTP ${response.status}`);
    const result = await response.json();
    const content = result.choices?.[0]?.message?.content;
    if (typeof content !== 'string') throw new Error('DeepSeek 没有返回可显示的回答');
    const count = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
    const u = result.usage || {};
    const usage = { totalTokens: count(u.total_tokens), inputTokens: count(u.prompt_tokens), outputTokens: count(u.completion_tokens), cacheHitTokens: count(u.prompt_cache_hit_tokens), cacheMissTokens: count(u.prompt_cache_miss_tokens), reasoningTokens: count(u.completion_tokens_details?.reasoning_tokens) };
    return { content: content.slice(0, 12000), rawContent: content, tokens: usage.totalTokens, usage };
  } finally { clearTimeout(timer); }
}

module.exports = { dayKey, limits, usage, reserve, finish, validateSettings, validateUserLimits, estimateReservation, complete };
