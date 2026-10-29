(() => {
  const $ = s => document.querySelector(s);
  const notice = text => { $('#notice').textContent = text; };
  async function api(route, data) { const r = await fetch('/api/admin/labs/genshin/' + route, { method: data ? 'POST' : 'GET', headers: {'Content-Type':'application/json'}, ...(data ? {body:JSON.stringify(data)} : {}) }); const v=await r.json(); if(!r.ok)throw new Error(v.error||'请求失败');return v; }
  function action(selector, fn) { $(selector).onsubmit=async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;try{await fn();}catch(error){notice(error.message);}finally{b.disabled=false;}}; }
  const fields = [ ['atk', '总攻击力', false], ['em', '元素精通', false], ['multiplier', '技能倍率 %', true], ['bonus', '伤害加成 %', true], ['critRate', '暴击率 %', true], ['critDamage', '暴击伤害 %', true], ['level', '角色等级', false], ['enemyLevel', '敌人等级', false], ['resistance', '减抗后敌人抗性 %', true], ['defReduction', '减防 %（≤90）', true], ['defIgnore', '无视防御 %', true], ['reactionBonus', '额外反应加成 %', true] ];
  for (const id of ['before', 'after']) {
    $('#' + id).insertAdjacentHTML('beforeend', fields.map(([key, title]) => `<label>${title}<input name="${key}" type="number" step="any" required aria-label="${id === 'before' ? '换装前' : '换装后'}${title}"></label>`).join('') + '<label>反应类型<select name="reaction"><option value="none">不触发增幅反应</option><option value="vaporize-pyro">火触发蒸发</option><option value="vaporize-hydro">水触发蒸发</option><option value="melt-pyro">火触发融化</option><option value="melt-cryo">冰触发融化</option></select></label><label class="check"><input type="checkbox" name="reactionConfirmed">已依据附着与ICD确认本击触发所选反应</label>');
  }
  function panel(id) { const root = $('#' + id), p = {}; for (const [key, , percent] of fields) p[key] = Number(root.querySelector(`[name="${key}"]`).value) / (percent ? 100 : 1); p.reaction = root.querySelector('[name="reaction"]').value; p.reactionConfirmed = root.querySelector('[name="reactionConfirmed"]').checked; return p; }
  action('#calcForm', async () => {
    const r = await api('calculate', { before: panel('before'), after: panel('after') });
    $('#calculation').textContent = `期望伤害：${r.before.expected.toFixed(3)} → ${r.after.expected.toFixed(3)}\n提升：${r.improvement === null ? '基准为零，无法计算百分比' : (100 * r.improvement).toFixed(3) + '%'}\n\n${r.formula}\n\n${r.scope}\n\n完整输入与乘区：\n${JSON.stringify({ before: r.before, after: r.after }, null, 2)}`; notice('服务器计算完成，没有调用 AI。');
  });
})();
