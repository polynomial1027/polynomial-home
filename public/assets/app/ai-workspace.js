window.createAiWorkspace = ({ getData, isOffline, isSending, api, refresh, notice, rerender }) => {
  const $ = selector => document.querySelector(selector), esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let selectedId = new URLSearchParams(location.search).get('conversation') || null, knownUser = null, draftKey = null, attachment = null, editing = null, templateVersion = null, mutating = false, transitioning = false;
  const attachments = new Map(), active = () => getData()?.ai?.sessions.find(row => row.id === getData().ai.activeSessionId);
  function initial(snapshot) {
    if (knownUser !== snapshot.user.id) { knownUser = snapshot.user.id; if (!selectedId) { try { const saved = localStorage.getItem(`ai-session:${knownUser}`); if (snapshot.ai?.sessions.some(row => row.id === saved)) selectedId = saved; } catch {} } }
    if (!selectedId) selectedId = snapshot.ai?.activeSessionId || null;
    return selectedId && selectedId !== snapshot.ai?.activeSessionId;
  }
  function syncDraft() {
    const data = getData(), id = data?.ai?.activeSessionId; if (!id) return;
    const next = `assistant-draft:${data.user.id}:${id}`;
    if (next !== draftKey) {
      if (draftKey) { try { sessionStorage.setItem(draftKey, $('#appChatMessage').value); } catch {} attachments.set(draftKey, attachment); }
      draftKey = next; attachment = attachments.get(next) || null; $('#aiShowArchived').checked = Boolean(active()?.archived);
      try { $('#appChatMessage').value = sessionStorage.getItem(next) || (active()?.legacy ? sessionStorage.getItem(`assistant-draft:${data.user.id}`) : '') || ''; if (active()?.legacy) sessionStorage.removeItem(`assistant-draft:${data.user.id}`); } catch { $('#appChatMessage').value = ''; }
    }
    if (!transitioning && !mutating) selectedId = id; try { localStorage.setItem(`ai-session:${data.user.id}`, id); const url = new URL(location.href); url.searchParams.set('conversation', id); history.replaceState(null, '', url); } catch {}
  }
  function renderAttachment() { $('#aiAttachment').hidden = !attachment; $('#aiAttachment').innerHTML = attachment ? `<span>${esc(attachment.name)} · ${attachment.text.length} 字</span><button type="button" id="removeAiAttachment" aria-label="移除文本资料">×</button>` : ''; }
  function renderList() {
    const data = getData(); if (!data?.ai) return;
    const query = $('#aiSessionSearch').value.trim().toLowerCase(), archived = $('#aiShowArchived').checked;
    const rows = data.ai.sessions.filter(row => row.archived === archived && `${row.title} ${row.toolTitle}`.toLowerCase().includes(query));
    $('#aiSessionList').innerHTML = rows.map(row => `<button type="button" class="ai-session-row ${row.id === data.ai.activeSessionId ? 'active' : ''}" data-ai-session="${row.id}" aria-pressed="${row.id === data.ai.activeSessionId}" ${isSending() || transitioning || mutating ? 'disabled' : ''}><strong>${row.pinned ? '★ ' : ''}${esc(row.title)}</strong><small>${esc(row.toolTitle)} · ${row.messageCount} 条${row.busy ? ' · 正在回复' : ''}</small></button>`).join('') || '<p class="fine-print">没有符合条件的会话。</p>';
  }
  function render() {
    const data = getData(); if (!data?.ai) { for (const id of ['newAiSession', 'editAiSession', 'openAiTools']) $(`#${id}`).disabled = true; return; }
    syncDraft(); renderList(); renderAttachment(); const row = active();
    $('#aiSessionTitle').textContent = row?.title || 'Polynomial 助手'; $('#aiSessionTool').textContent = `${row?.toolTitle || '通用助手'}${row?.archived ? ' · 已归档，请恢复后继续' : row?.busy || isSending() ? ' · 正在回复，请稍候' : ' · 独立上下文'}`;
    const disabled = isOffline() || isSending() || transitioning || mutating; $('#newAiSession').disabled = disabled || !data.assistant.allowed; $('#openAiTools').disabled = disabled || !data.assistant.allowed; $('#editAiSession').disabled = disabled || !row || row.busy;
    $('#aiFileInput').disabled = disabled || row?.archived || row?.busy; $('#messageCount').textContent = `${$('#appChatMessage').value.length} / 4000`;
  }
  async function select(id) {
    if (isSending()) return notice('请等待当前回复完成后切换会话。', 'error');
    transitioning = true; rerender(); selectedId = id;
    try { await refresh(); $('.ai-conversations').dataset.expanded = 'false'; $('#toggleAiSessions').setAttribute('aria-expanded', 'false'); $('#toggleAiSessions').textContent = '展开'; } catch (error) { selectedId = getData()?.ai?.activeSessionId || null; throw error; } finally { transitioning = false; rerender(); }
  }
  async function create(input = {}) {
    if (mutating || transitioning || isSending()) return; mutating = true; rerender();
    try { const result = await api('/api/account/ai/sessions', { method: 'POST', body: JSON.stringify(input) }); $('#aiToolsDialog').close(); selectedId = result.session.id; location.hash = 'assistant'; await refresh(); }
    finally { mutating = false; rerender(); }
  }
  const action = fn => async event => { event?.preventDefault(); try { await fn(event); } catch (error) { notice(error.message, 'error'); } };
  document.addEventListener('click', event => { const button = event.target.closest('[data-open-ai-session]'); if (!button) return; event.preventDefault(); location.hash = 'assistant'; select(button.dataset.openAiSession).catch(error => notice(error.message, 'error')); });
  $('#toggleAiSessions').onclick = () => { const expanded = $('.ai-conversations').dataset.expanded !== 'true'; $('.ai-conversations').dataset.expanded = String(expanded); $('#toggleAiSessions').setAttribute('aria-expanded', String(expanded)); $('#toggleAiSessions').textContent = expanded ? '收起' : '展开'; };
  $('#newAiSession').onclick = action(() => create()); $('#aiSessionSearch').oninput = renderList; $('#aiShowArchived').onchange = renderList;
  $('#aiSessionList').onclick = action(event => { const row = event.target.closest('[data-ai-session]'); if (row) return select(row.dataset.aiSession); });
  function renderTools() {
    const data = getData(); $('#aiToolCatalog').innerHTML = (data.ai?.tools || []).map(row => `<button type="button" class="ai-tool-card" data-use-ai-tool="${row.id}"><strong>${esc(row.title)}</strong><small>${esc(row.description)}</small></button>`).join('');
    $('#aiTemplateList').innerHTML = (data.ai?.templates || []).map(row => `<div class="ai-template-row"><strong>${esc(row.title)}</strong><div><button type="button" class="secondary small" data-use-ai-template="${row.id}">使用</button><button type="button" class="text-button" data-edit-ai-template="${row.id}">编辑</button><button type="button" class="text-button" data-delete-ai-template="${row.id}">删除</button></div></div>`).join('') || '<p class="fine-print">保存常用指令，下次直接创建专用会话。已有会话保留创建时的模板内容。</p>';
  }
  $('#openAiTools').onclick = () => { renderTools(); $('#aiToolsDialog').showModal(); };
  $('#aiToolCatalog').onclick = action(event => { const button = event.target.closest('[data-use-ai-tool]'); if (!button) return; const tool = getData().ai.tools.find(row => row.id === button.dataset.useAiTool); return create({ toolId: tool.id, title: tool.title }); });
  function resetTemplate() { $('#aiTemplateForm').reset(); $('#aiTemplateId').value = ''; templateVersion = null; $('#aiTemplateNotice').textContent = ''; }
  $('#resetAiTemplate').onclick = resetTemplate;
  async function confirm(text) {
    const dialog = $('#operationConfirm'); $('#operationConfirmTitle').textContent = '核对这次操作'; $('#operationConfirmText').textContent = text; $('#operationConfirmAccept').textContent = '确认删除'; dialog.returnValue = '';
    const result = new Promise(resolve => dialog.addEventListener('close', () => resolve(dialog.returnValue === 'accept'), { once: true })); dialog.showModal(); return result;
  }
  $('#aiTemplateList').onclick = action(async event => {
    const button = event.target.closest('button'); if (!button) return;
    const id = button.dataset.useAiTemplate || button.dataset.editAiTemplate || button.dataset.deleteAiTemplate, row = getData().ai.templates.find(row => row.id === id); if (!row) return;
    if (button.dataset.useAiTemplate) return create({ templateId: id, title: row.title });
    if (button.dataset.editAiTemplate) { $('#aiTemplateId').value = id; $('#aiTemplateTitle').value = row.title; $('#aiTemplatePrompt').value = row.prompt; templateVersion = row.updatedAt; $('#aiTemplateTitle').focus(); }
    if (button.dataset.deleteAiTemplate && await confirm('删除这个模板？已经创建的会话仍保留原来的模板设置。')) { await api(`/api/account/ai/templates/${id}?version=${encodeURIComponent(row.updatedAt)}`, { method: 'DELETE' }); await refresh(); resetTemplate(); renderTools(); }
  });
  $('#aiTemplateForm').onsubmit = async event => {
    event.preventDefault(); const button = event.submitter; button.disabled = true; $('#aiTemplateNotice').textContent = '';
    try { const id = $('#aiTemplateId').value; await api(`/api/account/ai/templates${id ? '/' + id : ''}`, { method: id ? 'PATCH' : 'POST', body: JSON.stringify({ title: $('#aiTemplateTitle').value, prompt: $('#aiTemplatePrompt').value, ifUnmodifiedSince: templateVersion }) }); await refresh(); resetTemplate(); renderTools(); notice('模板已保存。'); }
    catch (error) { $('#aiTemplateNotice').textContent = error.message; } finally { button.disabled = false; }
  };
  $('#editAiSession').onclick = () => { editing = { ...active() }; $('#aiRenameSession').value = editing.title; $('#aiPinSession').checked = editing.pinned; $('#aiArchiveSession').textContent = editing.archived ? '恢复会话' : '归档会话'; $('#aiSessionNotice').textContent = ''; $('#aiSessionDialog').showModal(); };
  $('#aiSessionForm').onsubmit = async event => {
    event.preventDefault(); const button = event.submitter; button.disabled = true;
    try { await api(`/api/account/ai/sessions/${editing.id}`, { method: 'PATCH', body: JSON.stringify({ title: $('#aiRenameSession').value, pinned: $('#aiPinSession').checked, ifUnmodifiedSince: editing.updatedAt }) }); $('#aiSessionDialog').close(); await refresh(); }
    catch (error) { $('#aiSessionNotice').textContent = `${error.message}；请关闭窗口后重新打开再试。`; } finally { button.disabled = false; }
  };
  $('#aiArchiveSession').onclick = action(async () => { await api(`/api/account/ai/sessions/${editing.id}`, { method: 'PATCH', body: JSON.stringify({ archived: !editing.archived, ifUnmodifiedSince: editing.updatedAt }) }); $('#aiShowArchived').checked = !editing.archived; $('#aiSessionDialog').close(); await refresh(); });
  $('#aiDeleteSession').onclick = action(async () => {
    const dialog = $('#aiDeleteDialog'); dialog.returnValue = ''; const result = new Promise(resolve => dialog.addEventListener('close', () => resolve(dialog.returnValue), { once: true })); dialog.showModal(); if (await result !== 'delete') return;
    await api(`/api/account/ai/sessions/${editing.id}?version=${encodeURIComponent(editing.updatedAt)}`, { method: 'DELETE' });
    try { sessionStorage.removeItem(`assistant-draft:${getData().user.id}:${editing.id}`); } catch {} attachments.delete(`assistant-draft:${getData().user.id}:${editing.id}`); if (draftKey?.endsWith(editing.id)) { draftKey = null; attachment = null; $('#appChatMessage').value = ''; }
    selectedId = null; $('#aiSessionDialog').close(); await refresh(); notice('会话已删除。');
  });
  const native = /PolynomialClient\//.test(navigator.userAgent); if (native) $('#aiExportSession').textContent = '复制会话 JSON';
  $('#aiExportSession').onclick = action(async () => { const result = await api(`/api/account/ai/sessions/${editing.id}`), text = JSON.stringify({ exportedAt: new Date().toISOString(), ...result }, null, 2); if (native) { await navigator.clipboard.writeText(text); notice('会话 JSON 已复制，请保存到你保管的位置。'); return; } const url = URL.createObjectURL(new Blob([text], { type: 'application/json' })), link = document.createElement('a'); link.href = url; link.download = `Polynomial-conversation-${editing.id}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 10000); });
  $('#aiFileInput').onchange = async () => {
    try { const file = $('#aiFileInput').files[0]; if (!file) return; if (file.size > 65536 || !/\.(txt|md|csv|json|py|js|ts|java|go|rs|css|html|sql)$/i.test(file.name)) throw new Error('请选择不超过 64 KB 的 UTF-8 文本或代码文件'); const text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer()).trim(); if (!text || text.length > 8000 || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text)) throw new Error('文本资料需为 1–8000 字，请缩短或移除二进制内容'); attachment = { name: file.name, text }; renderAttachment(); }
    catch (error) { notice(error.message, 'error'); } finally { $('#aiFileInput').value = ''; }
  };
  $('#aiAttachment').onclick = event => { if (event.target.closest('#removeAiAttachment')) { attachment = null; renderAttachment(); } };
  return { initial, render, requestId: () => selectedId, resetSelection: () => { selectedId = null; }, canSend: () => Boolean(active() && !active().archived && !active().busy && !transitioning && !mutating), draftKey: () => draftKey, payload: () => ({ sessionId: getData()?.ai?.activeSessionId, attachment }), sent: () => { attachment = null; if (draftKey) attachments.delete(draftKey); renderAttachment(); }, clearDrafts: () => { try { const prefix = `assistant-draft:${getData().user.id}`; for (const key of Object.keys(sessionStorage)) if (key.startsWith(prefix)) sessionStorage.removeItem(key); } catch {} attachments.clear(); } };
};
