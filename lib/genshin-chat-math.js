// A narrow deterministic tool for a common natural-language comparison.
// It states its applicability rather than inventing a character or rotation.
function fromQuestion(question) {
  if (/%|％|百分比|基础攻击/.test(question)) return null;
  const match = question.match(/(?:总)?攻击力\s*(?:从|由)?\s*(\d+(?:\.\d+)?)\s*(?:提升到|提高到|变成|变为|换到|换成|到|→|->)\s*(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const before = Number(match[1]), after = Number(match[2]);
  if (before <= 0 || before > 1000000 || after > 1000000) return null;
  const percent = (after / before - 1) * 100;
  return { id: 'server-ratio', title: '服务器计算：总攻击力变化比例', origin: '用户问题的显式数值', version: '其他乘区不变的单次攻击力倍率伤害', checkedAt: new Date().toISOString(), content: `用户明确给出总攻击力从${before}到${after}。服务器计算变化比例=(${after}/${before}-1)×100%=${percent.toFixed(6)}%。只有在伤害按攻击力缩放、技能倍率和其他乘区都不变时，单次伤害也变化${percent.toFixed(6)}%；不能据此断言真实角色全队循环或其他倍率伤害的实际提升。` };
}
module.exports = { fromQuestion };
