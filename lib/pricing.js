// DeepSeek pricing checked on 2026-10-14. Keep the source link visible in the UI.
// Shanghai has a fixed UTC+8 offset. Unknown future holidays are treated as peak
// on weekdays, which is conservative for scheduling and price expectations.
const SOURCE = 'https://api-docs.deepseek.com/zh-cn/quick_start/pricing/';
const CHECKED_AT = '2026-10-14';
const HOLIDAYS_2026 = [
  ['01-01', '01-03'], ['02-15', '02-23'], ['04-04', '04-06'],
  ['05-01', '05-05'], ['06-19', '06-21'], ['09-25', '09-27'], ['10-01', '10-07']
];
const RATES = {
  'deepseek-flash': { cachedInput: [0.02, 0.04], input: [1, 2], output: [4, 8] },
  'deepseek-v4-pro': { cachedInput: [0.15, 0.30], input: [4.5, 9], output: [13.5, 27] }
};

function shanghaiParts(date = new Date()) {
  const local = new Date(date.getTime() + 8 * 3600_000);
  return { year: local.getUTCFullYear(), month: local.getUTCMonth() + 1, day: local.getUTCDate(), weekday: local.getUTCDay(), hour: local.getUTCHours(), minute: local.getUTCMinutes() };
}

function isHoliday({ year, month, day }) {
  if (year !== 2026) return false;
  const md = `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return HOLIDAYS_2026.some(([start, end]) => md >= start && md <= end);
}

function priceWindow(now = new Date(), model = 'deepseek-flash') {
  const local = shanghaiParts(now);
  const weekday = local.weekday >= 1 && local.weekday <= 5;
  const peak = weekday && !isHoliday(local) && ((local.hour >= 9 && local.hour < 12) || (local.hour >= 14 && local.hour < 18));
  let nextOffPeakAt = null;
  if (peak) {
    const endHour = local.hour < 12 ? 12 : 18;
    nextOffPeakAt = new Date(Date.UTC(local.year, local.month - 1, local.day, endHour) - 8 * 3600_000).toISOString();
  }
  return { peak, label: peak ? '高峰时段' : '空闲时段', nextOffPeakAt, timezone: 'Asia/Shanghai', holidayCalendarCurrent: local.year === 2026, model, rates: RATES[model] || null, rateUnit: '元/百万 tokens', checkedAt: CHECKED_AT, source: SOURCE };
}

function safeOffPeakStart(now = new Date(), model = 'deepseek-flash') {
  return !priceWindow(now, model).peak && !priceWindow(new Date(now.getTime() + 5 * 60_000), model).peak;
}

module.exports = { priceWindow, safeOffPeakStart, shanghaiParts };
