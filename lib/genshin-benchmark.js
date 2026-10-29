// Independently worked examples. Expectations are constants, not calls to the
// production damage engine. These test one-hit conditional damage, not rotations.
const base = { atk: 2000, em: 0, multiplier: 2, bonus: .5, critRate: .5, critDamage: 1, level: 90, enemyLevel: 90, resistance: .1, defReduction: 0, defIgnore: 0, reactionBonus: 0, reaction: 'none' };
const numerical = (id, question, after, expected, search = false) => ({ id, question, search, calculation: { before: { ...base }, after: { ...base, ...after } }, expected, type: 'numeric' });
const cases = [
  numerical('atk', '其他条件不变，总攻击力从2000换到2200，单次期望伤害提升多少？请依据附带完整面板解释。', { atk: 2200 }, { before: 4050, after: 4455, improvement: .1 }),
  numerical('vaporize', '这次火伤已确认触发蒸发，精通为0。与不蒸发相比单次期望伤害是多少？不要假设每击都蒸发。', { reaction: 'vaporize-pyro', reactionConfirmed: true }, { before: 4050, after: 6075, improvement: .5 }),
  numerical('melt', '这次火伤已确认触发融化，精通为0。与不融化相比，单次期望伤害是多少？', { reaction: 'melt-pyro', reactionConfirmed: true }, { before: 4050, after: 8100, improvement: 1 }),
  numerical('negative-resistance', '减抗后敌人抗性从10%变为-20%，其他面板不变，单次期望伤害如何变化？', { resistance: -.2 }, { before: 4050, after: 4950, improvement: 2 / 9 }),
  numerical('crit-cap', '暴击率从50%提高到150%，暴击伤害为100%，是否超出100%的暴击率也继续提升期望伤害？', { critRate: 1.5 }, { before: 4050, after: 5400, improvement: 1 / 3 }),
  { id: 'icd', type: 'mechanic', question: '同一技能连续打出元素伤害，是否每一下都能附着元素？标准ICD的计时与命中计数如何互相重置？', search: true, expected: '不能认为每次元素伤害命中都附着；标准ICD为2.5秒或每3次命中。计数触发不重置计时，计时触发重置计数；具体技能有例外。', checks: ['ICD|冷却', '2\.5', '3|三', '重置'] },
  { id: 'recharge', type: 'mechanic', question: '元素充能效率堆高以后，西风武器一次触发的球会变多吗？直接回复的固定能量会被充能效率放大吗？', search: true, expected: '不会增加产球数量；西风被动触发是3个无色微粒，精炼影响频率。直接回复固定能量不受充能效率影响。', checks: ['3|三', '无色', '固定', '不受|不会|不影响'] },
  { id: 'insufficient-data', type: 'missing', question: '请告诉我维斯娜7.1版本90级的精确基础攻击力、全部技能附着量、ICD组和每次产球数，并直接给我最佳圣遗物；资料库没有这张表时请明确说缺少。', search: false, expected: '不得编造角色表或最佳圣遗物，应明确缺少可核验的版本、角色与逐击数据。' }
];
function evaluate(item, response) {
  if (item.type === 'numeric') {
    const c = response.calculation;
    const errors = !c ? ['未返回服务器计算'] : Object.entries({ before: c.before?.expected, after: c.after?.expected, improvement: c.improvement }).filter(([key, value]) => typeof value !== 'number' || Math.abs(value - item.expected[key]) > 1e-7).map(([key]) => key + '数值不符');
    const citations = response.claims?.some(c => c.sourceId === 'server-calculation');
    const answerNumbers = (response.claims || []).flatMap(c => (String(c.text).replace(/,/g, '').match(/-?\d+(?:\.\d+)?/g) || []).map(Number));
    const modelReportedAfter = answerNumbers.some(n => Math.abs(n - item.expected.after) < .01);
    return { numericPass: errors.length === 0, modelReportedAfter, citedCalculation: citations === true, pass: errors.length === 0 && citations === true && modelReportedAfter, errors, review: '数值由独立预期常量比较；AI解释另需人工检查，未把服务器正确视作模型自己算对。' };
  }
  const text = JSON.stringify({ claims: response.claims, missing: response.missing });
  if (item.type === 'missing') return { pass: Array.isArray(response.missing) && response.missing.length > 0, review: '仅检查是否声明缺失，仍需人工排查是否夹带无依据数值。' };
  const absent = item.checks.filter(pattern => !new RegExp(pattern).test(text));
  return { pass: absent.length === 0 && response.claims?.length > 0, absent, review: '关键词只用于初筛，不等于语义判定；请对照标准答案阅读实际回答。' };
}
module.exports = { cases, evaluate };
