(() => {
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let busy = false;
  async function api(route, data, method = 'POST') {
    const response = await fetch('/api/admin/labs/genshin/' + route, { method: data === undefined ? 'GET' : method, cache: 'no-store', headers: { 'Content-Type': 'application/json' }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || '请求失败'); return result;
  }
  const notice = text => { $('#notice').textContent = text; };
  async function refresh() {
    const s = await api('status'); $('#surface').hidden = false;
    $('#budget').textContent = `外部请求 ${s.budget.usedCalls} 次（不限次数） · 已用/预留 token ${s.budget.usedTokens} / ${s.budget.maxTokens}${s.exhausted ? ' · 已达到上限，需明确提高后继续' : ''}`;
    $('#maxTokens').value = s.budget.maxTokens;
    $('#calls').textContent = JSON.stringify(s.calls, null, 2);
    $('#domains').textContent = '允许来源：' + s.domains.join('、');
    $('#documents').innerHTML = s.documents.map(d => `<li>${esc(d.title)}<br><small>${esc(d.version)} · ${d.characters} 字符</small><button type="button" class="remove" data-remove="${esc(d.id)}">删除</button></li>`).join('') || '<li>旧手册未导入。当前只有基础机制摘要。</li>';
    $('#send').disabled = busy || s.exhausted || !s.configured || !s.enabled;
    return s;
  }
  function action(form, fn) { $(form).onsubmit = async e => { e.preventDefault(); const button = e.submitter; if (button) button.disabled = true; try { await fn(); } catch (error) { notice(error.message); } finally { if (button) button.disabled = false; try { await refresh(); } catch {} } }; }
  action('#askForm', async () => {
    if (busy) return; busy = true;
    const q = $('#question').value;
    notice('正在检索资料与核对引用…');
    try {
      const payload = { question: q, search: $('#search').checked };
      if ($('#attachCalculation').checked) {
        if (!$('#calcForm').reportValidity()) throw new Error('请先填写下方完整的计算面板');
        payload.calculation = { before: panel('before'), after: panel('after') };
      }
      const r = await api('ask', payload);
      const node = document.createElement('article'); node.className = 'answer';
      node.innerHTML = `<strong class="question">${esc(q)}</strong>` + r.claims.map(c => { const s = r.sources.find(s => s.id === c.sourceId); return `<p>${esc(c.text)}</p><blockquote>${esc(c.quote)}</blockquote><small>${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a>` : esc(s.title)} · ${esc(s.version)} · ${esc(s.origin)} · ${esc(s.checkedAt)}</small>`; }).join('') + `<p>${r.warnings.map(esc).join('<br>')}</p>` + (r.missing.length ? `<strong>需要补充 / 核验</strong><ul>${r.missing.map(s => `<li>${esc(s)}</li>`).join('')}</ul>` : '') + `<small>${esc(r.note)}</small>`;
      if (r.calculation) {
        const pre = document.createElement('pre'); pre.textContent = `服务器计算：${r.calculation.before.expected.toFixed(3)} → ${r.calculation.after.expected.toFixed(3)}；提升 ${r.calculation.improvement === null ? '无法计算' : (r.calculation.improvement * 100).toFixed(3) + '%'}\n${r.calculation.formula}`; node.append(pre);
      }
      $('#thread .empty')?.remove(); $('#thread').append(node); node.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      notice(r.exhausted ? '测试预算已到上限，已停止后续调用；需要你明确提高上限。' : '回答已返回。请核对引文和版本，数值结论使用下方计算。');
    } finally { busy = false; }
  });
  $('#docFile').onchange = async () => {
    const f = $('#docFile').files[0]; if (!f) return;
    if (f.size > 250000) { notice('每份资料最多250KB，请分卷导入。'); return; }
    $('#docContent').value = await f.text(); if (!$('#docTitle').value) $('#docTitle').value = f.name;
  };
  action('#importForm', async () => { await api('documents', { title: $('#docTitle').value, version: $('#docVersion').value, content: $('#docContent').value }); $('#importForm').reset(); notice('资料已导入；来源与适用版本仍需人工核验。'); });
  $('#documents').onclick = async e => { const b = e.target.closest('[data-remove]'); if (!b) return; try { await api('documents/' + b.dataset.remove, {}, 'DELETE'); await refresh(); notice('已删除该资料。'); } catch (error) { notice(error.message); } };
  action('#budgetForm', async () => { if (!$('#confirmBudget').checked) return; await api('budget', { maxTokens: +$('#maxTokens').value, confirm: '提高测试上限' }, 'PATCH'); $('#confirmBudget').checked = false; notice('已按你的确认提高累计测试上限，历史用量保留。'); });
  const fields = [ ['atk', '总攻击力', false], ['em', '元素精通', false], ['multiplier', '技能倍率 %', true], ['bonus', '伤害加成 %', true], ['critRate', '暴击率 %', true], ['critDamage', '暴击伤害 %', true], ['level', '角色等级', false], ['enemyLevel', '敌人等级', false], ['resistance', '减抗后敌人抗性 %', true], ['defReduction', '减防 %（≤90）', true], ['defIgnore', '无视防御 %', true], ['reactionBonus', '额外反应加成 %', true] ];
  for (const id of ['before', 'after']) {
    $('#' + id).insertAdjacentHTML('beforeend', fields.map(([key, title]) => `<label>${title}<input name="${key}" type="number" step="any" required aria-label="${id === 'before' ? '换装前' : '换装后'}${title}"></label>`).join('') + '<label>反应类型<select name="reaction"><option value="none">不触发增幅反应</option><option value="vaporize-pyro">火触发蒸发</option><option value="vaporize-hydro">水触发蒸发</option><option value="melt-pyro">火触发融化</option><option value="melt-cryo">冰触发融化</option></select></label><label class="check"><input type="checkbox" name="reactionConfirmed">已依据附着与ICD确认本击触发所选反应</label>');
  }
  function panel(id) { const root = $('#' + id), p = {}; for (const [key, , percent] of fields) p[key] = Number(root.querySelector(`[name="${key}"]`).value) / (percent ? 100 : 1); p.reaction = root.querySelector('[name="reaction"]').value; p.reactionConfirmed = root.querySelector('[name="reactionConfirmed"]').checked; return p; }
  action('#calcForm', async () => {
    const r = await api('calculate', { before: panel('before'), after: panel('after') });
    $('#calculation').textContent = `期望伤害：${r.before.expected.toFixed(3)} → ${r.after.expected.toFixed(3)}\n提升：${r.improvement === null ? '基准为零，无法计算百分比' : (100 * r.improvement).toFixed(3) + '%'}\n\n${r.formula}\n\n${r.scope}\n\n完整输入与乘区：\n${JSON.stringify({ before: r.before, after: r.after }, null, 2)}`; notice('服务器计算完成，没有调用 AI。');
  });
  refresh().then(s => notice(!s.enabled || !s.configured ? '现有 AI 服务未开启或未配置。资料导入与服务器计算仍可用。' : s.exhausted ? '测试总预算已到上限，需你明确提高后继续。' : '已连接现有 AI 配置。当前尚未验证真实联网请求，所有调用受测试总预算限制。')).catch(e => notice(e.message + '；本功能仅对已登录管理员开放。'));
})();
