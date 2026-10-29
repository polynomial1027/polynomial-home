// Deliberately limited to one ATK-scaling hit. No rotation/reaction inference.
const source = 'https://library.keqingmains.com/combat-mechanics/damage/damage-formula';
const fields = {
  atk: [0, 1000000], em: [0, 100000], multiplier: [0, 1000], bonus: [-1, 100],
  critRate: [-10, 10], critDamage: [0, 100], level: [1, 100], enemyLevel: [1, 200],
  resistance: [-10, 10], defReduction: [0, 0.9], defIgnore: [0, 1], reactionBonus: [0, 100]
};
function hit(input) {
  if (!input || typeof input !== 'object') throw new Error('请填写完整的伤害参数');
  const p = {};
  for (const [key, [min, max]] of Object.entries(fields)) {
    const n = input[key];
    if (typeof n !== 'number' || !Number.isFinite(n) || n < min || n > max) throw new Error(`${key} 必须为 ${min} 到 ${max} 的数字`);
    p[key] = n;
  }
  if (!['none', 'vaporize-pyro', 'vaporize-hydro', 'melt-pyro', 'melt-cryo'].includes(input.reaction)) throw new Error('尚不支持此反应计算');
  if (input.reaction !== 'none' && input.reactionConfirmed !== true) throw new Error('须先确认该次攻击实际触发反应；缺少附着量、ICD 或残余元素量时不能假设触发');
  const defense = (p.level + 100) / ((p.level + 100) + (p.enemyLevel + 100) * (1 - p.defReduction) * (1 - p.defIgnore));
  const resistance = p.resistance < 0 ? 1 - p.resistance / 2 : p.resistance < .75 ? 1 - p.resistance : 1 / (4 * p.resistance + 1);
  const reaction = input.reaction === 'none' ? 1 : (['vaporize-hydro', 'melt-pyro'].includes(input.reaction) ? 2 : 1.5) * (1 + 2.78 * p.em / (1400 + p.em) + p.reactionBonus);
  const base = p.atk * p.multiplier * (1 + p.bonus) * defense * resistance * reaction;
  const result = { nonCrit: base, crit: base * (1 + p.critDamage), expected: base * (1 + Math.max(0, Math.min(1, p.critRate)) * p.critDamage) };
  if (!Object.values(result).every(Number.isFinite)) throw new Error('结果超出计算范围');
  return { ...result, factors: { defense, resistance, reaction }, input: { ...p, reaction: input.reaction, reactionConfirmed: input.reactionConfirmed === true } };
}
function compare(input) {
  const before = hit(input.before), after = hit(input.after);
  return { before, after, improvement: before.expected === 0 ? null : after.expected / before.expected - 1, source,
    formula: 'ATK × 技能倍率 × (1+增伤) × 防御乘区 × 抗性乘区 × 反应乘区 × (1+有效暴击率×暴击伤害)',
    scope: '用户输入的完整战斗面板；单次攻击力倍率伤害。换装后须填写完整面板，不是圣遗物词条差值。不含生命/防御倍率、激化、剧变、月反应、护盾、特殊独立乘区或循环模拟。反应触发由用户确认，不自动推断附着/ICD。' };
}
module.exports = { hit, compare, fields };
