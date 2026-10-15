(() => {
  const $ = s => document.querySelector(s);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num = v => v == null ? '未提供' : Number(v).toLocaleString('zh-CN');
  const money = v => v == null ? '未知' : `¥${Number(v).toFixed(6)}`;
  const time = v => new Date(v).toLocaleString('zh-CN', {timeZone:'Asia/Shanghai',hour12:false});
  const today = () => new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const sources = {'chat':'即时对话','chat-plan':'对话安排日程','queued-chat':'低峰队列','queued-chat-plan':'低峰日程安排','butler':'管理员管家','auto-review':'自动巡检','manual-review':'手动巡检','legacy':'旧用量记录'};
  const status = v => ({completed:'调用完成',failed:'调用失败',reserved:'调用中 / 预留额度'}[v] || v);
  let page = 1, snapshot, sequence = 0;
  const params = () => new URLSearchParams({date:$('#recordDate').value,userId:$('#recordUser').value,page});
  async function api(url) { const res = await fetch(url,{cache:'no-store'}), data = await res.json(); if(!res.ok) throw new Error(data.error || '读取失败'); return data; }
  const metric = (title,value,sub='') => `<article>${esc(title)}<strong>${esc(value)}</strong><small>${esc(sub)}</small></article>`;
  async function load() {
    const seq = ++sequence; $('#recordNotice').textContent='正在查询…';
    try {
      const data = await api(`/api/admin/assistant/records?${params()}`); if (seq!==sequence) return; snapshot=data;
      const selected=$('#recordUser').value;
      $('#recordUser').innerHTML='<option value="">全部用户</option>'+data.users.map(u=>`<option value="${esc(u.id)}">${esc(u.displayName)} · @${esc(u.username)}</option>`).join(''); $('#recordUser').value=selected;
      $('#recordWindow').textContent=`统计区间：${time(data.windowStart)} 至 ${time(data.windowEndExclusive)}（结束时间不包含，北京时间）`;
      const s=data.summary;
      $('#recordSummary').innerHTML=metric('调用次数',num(s.requests),`失败 ${s.failedRequests} 次`)+metric('额度计入 Token',num(s.quotaTokens),`接口报告 ${num(s.providerTokens)} · 预留或旧记录 ${num(s.reservedTokens)}`)+metric('输入 / 输出 Token',`${num(s.inputTokens)} / ${num(s.outputTokens)}`,'仅汇总已返回明细的调用')+metric('可计算部分的估算费用',money(s.knownCost),`${s.unknownCostRequests} 次费用未知，不计入此金额`);
      $('#recordCount').textContent=`${data.total} 条记录`;
      $('#recordList').innerHTML=data.records.map(r=>`<article class="record-row"><div><strong>${esc(r.displayName)}</strong><small>@${esc(r.username)}</small><small>${esc(time(r.at))}</small></div><div><span class="record-tag ${r.status==='failed'?'failed':''}">${esc(sources[r.source]||r.source)} · ${esc(status(r.status))}</span>${r.sessionTitle ? `<small>会话：${esc(r.sessionTitle)}${r.toolId ? ' · '+esc(r.toolId) : ''}</small>` : ''}<p>${esc(r.preview)}</p><small>${esc(r.model||'模型未记录')}${r.pricing?` · ${r.pricing.peak?'高峰':'低峰'}`:''}</small></div><div><strong>${num(r.tokens)} Token</strong><small>${r.tokenBasis==='provider'?'接口报告':r.tokenBasis==='legacy'?'旧记录 / 明细缺失':'额度预留'}</small><small>估算 ${money(r.cost?.total)}</small></div><button type="button" data-record="${esc(r.id)}">详情 ↗</button></article>`).join('')||'<div class="records-empty">这个日期没有 AI 调用记录。</div>';
      $('#recordPage').textContent=`第 ${data.page} / ${Math.max(1,Math.ceil(data.total/data.pageSize))} 页`; $('#recordPrev').disabled=page===1; $('#recordNext').disabled=page*data.pageSize>=data.total;
      $('#recordLegacy').hidden=!data.legacyChatCount; $('#recordLegacyOpen').disabled=!selected;
      $('#recordNotice').textContent='';
    } catch(e) { if(seq===sequence) $('#recordNotice').textContent=e.message; }
  }
  function open(title, html) { $('#recordDialogTitle').textContent=title; $('#recordDetail').innerHTML=html; if(!$('#recordDialog').open) $('#recordDialog').showModal(); }
  const cell = (label,value) => `<div>${esc(label)}<strong>${esc(value)}</strong></div>`;
  $('#recordList').onclick=async e=>{
    const id=e.target.closest('[data-record]')?.dataset.record; if(!id) return;
    open('正在读取调用详情','');
    try {
      const {record:r}=await api(`/api/admin/assistant/records/${encodeURIComponent(id)}`),d=r.detail,u=r.usage;
      const metrics=[['额度计入',num(r.tokens)],['实际总量',num(u?.totalTokens)],['输入 Token',num(u?.inputTokens)],['输出 Token',num(u?.outputTokens)],['缓存命中',num(u?.cacheHitTokens)],['缓存未命中',num(u?.cacheMissTokens)],['推理 Token（输出内）',num(u?.reasoningTokens)],['原始预留 Token',num(r.reservedTokens)],['单次输出上限',num(d?.maxOutput)]];
      open(`${r.displayName} · ${time(r.at)}`,`<p>${esc(sources[r.source]||r.source)} · ${esc(status(r.status))} · ${esc(r.model||'模型未知')}</p><div class="record-detail-grid">${metrics.map(([k,v])=>cell(k,v)).join('')}</div><p class="records-note">${r.tokenBasis==='provider'?'实际 Token 由接口返回；缓存命中和未命中属于输入，推理 Token 包含在输出中，不能重复相加。':'这条记录缺少接口实际用量。额度计入值可能为保守预留或旧记录，不应视为实际账单。'}</p>${r.cost?`<p>估算费用：缓存输入 ${money(r.cost.cachedInput)} + 未命中输入 ${money(r.cost.input)} + 输出 ${money(r.cost.output)} = <strong>${money(r.cost.total)}</strong></p><p class="records-muted">单价（元 / 百万 Token）：缓存 ${num(r.pricing.rates.cachedInput[r.pricing.peak?1:0])}，未命中 ${num(r.pricing.rates.input[r.pricing.peak?1:0])}，输出 ${num(r.pricing.rates.output[r.pricing.peak?1:0])}。按调用开始时间的${r.pricing.peak?'高峰':'低峰'}报价估算；以实际账单为准。<a href="https://api-docs.deepseek.com/zh-cn/quick_start/pricing/" target="_blank" rel="noopener">官方报价 ↗</a></p>`:'<p>费用未知：缺少完整缓存 / 输出用量或对应报价。</p>'}${d?.messages?`${r.sessionTitle ? `<p>会话：${esc(r.sessionTitle)} · 工具 ${esc(r.toolId || 'general')}${r.attachmentName ? ' · 资料 '+esc(r.attachmentName) : ''}</p>` : ''}<h3>本次提问 / 任务内容</h3><pre>${esc(d.messages.filter(m=>m.role==='user').at(-1)?.content||'')}</pre><h3>AI 回复</h3><pre>${esc(d.displayedResponse ?? d.response ?? '未收到回答')}</pre>${d.displayedResponse&&d.displayedResponse!==d.response?`<details><summary>接口原始回复（含日程 JSON）</summary><pre>${esc(d.response)}</pre></details>`:''}<details><summary>查看实际发送的上下文（${d.messages.length} 条）</summary><p>这些系统提示和历史对话也消耗输入 Token。</p>${d.messages.map(m=>`<strong>${esc({system:'系统提示',user:'用户',assistant:'助手'}[m.role]||m.role)}</strong><pre>${esc(m.content)}</pre>`).join('')}</details>${d.error||d.processingError?`<p class="records-note">${esc(d.error||d.processingError)}</p>`:''}`:'<p>对话内容未保存或已超过保存期限；Token 和费用明细继续保留。</p>'}`);
    } catch(error) { $('#recordDetail').textContent=error.message; }
  };
  $('#recordLegacyOpen').onclick=async()=>{ open('更新前的聊天记录',''); try {const data=await api(`/api/admin/assistant/legacy-chats?${params()}`);$('#recordDetail').innerHTML='<p class="records-note">这些聊天无法准确关联到单次 Token 或费用；仅显示仍保存的内容。</p>'+data.chats.map(c=>`<h3>${c.role==='user'?'用户提问':'AI 回复'} · ${esc(time(c.at))}</h3><pre>${esc(c.content)}</pre>`).join('');}catch(e){$('#recordDetail').textContent=e.message;} };
  $('#recordClose').onclick=()=>$('#recordDialog').close();
  $('#recordFilters').onsubmit=e=>{e.preventDefault();page=1;load();};
  $('#recordToday').onclick=()=>{$('#recordDate').value=today();page=1;load();};
  $('#recordPrev').onclick=()=>{page--;load();}; $('#recordNext').onclick=()=>{page++;load();};
  $('#recordDate').value=today();
  api('/api/me').then(({user})=>{if(!user){location.href='/login.html?next=%2Fai-records.html';return;}if(user.role!=='admin'){location.href='/workspace.html';return;}load();}).catch(e=>$('#recordNotice').textContent=e.message);
})();
