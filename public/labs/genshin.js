(() => {
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let busy = false, initialized = false;
  const notice = text => { $('#notice').textContent = text; };
  async function api(route, data, method='POST') {
    const r = await fetch('/api/admin/labs/genshin/' + route, {method:data===undefined?'GET':method,cache:'no-store',headers:{'Content-Type':'application/json'},...(data===undefined?{}:{body:JSON.stringify(data)})});
    const v = await r.json(); if(!r.ok)throw new Error(v.error||'请求失败');return v;
  }
  function addUser(content) { $('#thread .empty')?.remove();const n=document.createElement('div');n.className='question chat-user';n.textContent=content;$('#thread').append(n); }
  function addAnswer(r) {
    const n=document.createElement('article');n.className='answer';
    n.innerHTML=(r.claims||[]).map(c=>`<p>${esc(c.text)}</p>`).join('')+((r.missing||[]).length?`<p>需要确认：</p><ul>${r.missing.map(m=>`<li>${esc(m)}</li>`).join('')}</ul>`:'');
    if(!(r.claims||[]).length && !(r.missing||[]).length)n.textContent='暂时没有找到足够的可靠资料，请补充问题的角色、版本或场景。';
    if((r.claims||[]).length)n.insertAdjacentHTML('beforeend',`<details class="answer-sources"><summary>查看资料来源</summary>${r.claims.map(c=>{const s=(r.sources||[]).find(s=>s.id===c.sourceId);return `<blockquote>${esc(c.quote)}</blockquote><small>${s?.url?`<a href="${esc(s.url)}">${esc(s.title)}</a>`:esc(s?.title||'资料')} · ${esc(s?.version||'')}</small>`;}).join('')}</details>`);
    if((r.warnings||[]).length)n.insertAdjacentHTML('beforeend',`<details><summary>检索提示</summary><p>${r.warnings.map(esc).join('<br>')}</p></details>`);
    $('#thread').append(n);$('#thread').scrollTop=$('#thread').scrollHeight;
  }
  async function refresh() {
    const s=await api('status');$('#surface').hidden=false;
    $('#budget').textContent=`测试用量 ${s.budget.usedTokens.toLocaleString()} / ${s.budget.maxTokens.toLocaleString()} token${s.exhausted?' · 已到上限':''}`;
    $('#maxTokens').value=s.budget.maxTokens;$('#calls').textContent=JSON.stringify(s.calls,null,2);
    $('#domains').textContent='联网来源：'+s.domains.join('、');
    $('#knowledgeStatus').textContent=`已有 ${s.seeds.length} 份内置机制资料，可联网检索。`+(s.documents.length?'已导入 '+s.documents.length+' 份额外资料。':'旧对话未提供可读取的手册正文，尚无额外上传资料；不影响使用现有资料和联网问答。');
    $('#documents').innerHTML=s.documents.map(d=>`<li>${esc(d.title)} · ${esc(d.version)} <button type="button" class="remove" data-remove="${esc(d.id)}">删除</button></li>`).join('');
    if(!initialized){initialized=true;for(const m of s.conversation||[]){if(m.role==='user')addUser(m.content);else addAnswer(m);}}
    $('#send').disabled=busy||s.exhausted||!s.configured||!s.enabled;return s;
  }
  $('#askForm').onsubmit=async e=>{
    e.preventDefault();if(busy)return;const q=$('#question').value.trim();if(!q)return;
    busy=true;$('#send').disabled=true;addUser(q);$('#question').value='';notice('正在回答…');
    try{const r=await api('ask',{question:q,search:$('#search').checked});addAnswer(r);notice(r.exhausted?'测试预算已到上限，后续调用已停止。':'');}
    catch(error){const n=document.createElement('p');n.className='answer';n.textContent=error.message;$('#thread').append(n);$('#question').value=q;notice('发送未完成，可修改问题后重试。');}
    finally{busy=false;try{await refresh();}catch(error){notice(error.message);}}
  };
  function action(selector,fn){$(selector).onsubmit=async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;try{await fn();await refresh();}catch(error){notice(error.message);}finally{b.disabled=false;}};}
  $('#docFile').onchange=async()=>{const f=$('#docFile').files[0];if(!f)return;if(f.size>250000)return notice('每份资料最多250KB，请分卷导入。');$('#docContent').value=await f.text();if(!$('#docTitle').value)$('#docTitle').value=f.name;};
  action('#importForm',async()=>{await api('documents',{title:$('#docTitle').value,version:$('#docVersion').value,content:$('#docContent').value});$('#importForm').reset();notice('资料已导入。');});
  $('#documents').onclick=async e=>{const b=e.target.closest('[data-remove]');if(!b)return;try{await api('documents/'+b.dataset.remove,{},'DELETE');await refresh();}catch(error){notice(error.message);}};
  action('#budgetForm',async()=>{await api('budget',{maxTokens:+$('#maxTokens').value,confirm:'提高测试上限'},'PATCH');$('#confirmBudget').checked=false;notice('累计上限已提高，历史用量保留。');});
  refresh().then(s=>notice(!s.enabled||!s.configured?'AI服务未启用，请检查管理员设置。':s.exhausted?'测试预算已到上限。':'')).catch(e=>notice(e.message+'；请使用管理员账号登录。'));
})();
