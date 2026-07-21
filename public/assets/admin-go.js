'use strict';

const goAdminStyle = document.createElement('link'); goAdminStyle.rel = 'stylesheet'; goAdminStyle.href = '/assets/admin-go.css'; document.head.append(goAdminStyle);
const goPermissionHost = document.querySelector('#editPermissions');
if (goPermissionHost && !goPermissionHost.querySelector('[data-permission="accessGo"]')) goPermissionHost.insertAdjacentHTML('beforeend', `<details class="permission-category"><summary><span><strong>围棋中心</strong><small>研究、题库、人机、联机与棋谱</small></span><span class="category-arrow">⌄</span></summary><div class="permission-list"><label><span>进入围棋中心</span><input type="checkbox" data-permission="accessGo"></label><label><span>自由研究</span><input type="checkbox" data-permission="goStudy"></label><label><span>题库练习</span><input type="checkbox" data-permission="goPuzzles"></label><label><span>KataGo 人机</span><input type="checkbox" data-permission="goAi"></label><label><span>联机对战</span><input type="checkbox" data-permission="goMultiplayer"></label><label><span>发送邀请</span><input type="checkbox" data-permission="goInvite"></label><label><span>共享棋盘</span><input type="checkbox" data-permission="goShared"></label><label><span>导入 SGF</span><input type="checkbox" data-permission="goSgfImport"></label><label><span>导出 SGF</span><input type="checkbox" data-permission="goSgfExport"></label></div></details>`);

let goAdminData = null, feedbackPage = 1, feedbackPages = 1, puzzleStones = [], puzzleTool = 'B';
const goSettingIds = ['goEnabled','goAllowedBoardSizes','goDefaultBoardSize','goAllowedRules','goDefaultRules','goAllowedKoRules','goDefaultKoRule','goDefaultKomi','goHandicapKomi','goMaxHandicap','goUndoDefault','goMaxUndoRequests','goRecordDefaultVisibility','goAllowedTimeSystems','goDefaultMainMinutes','goMaxMainMinutes','goDefaultByoYomiSeconds','goDefaultByoYomiPeriods','goInviteExpiryMinutes','goMaxPendingInvites','goDisconnectPolicy','goDisconnectGraceSeconds','goAiEnabled','goKataGoBinary','goKataGoModel','goKataGoConfig','goAiMoveTimeoutSeconds','goAiProfiles','goStudyMaxCount','goStudyMaxKB','goBoardSkins','goDefaultBoardSkin','goStoneSkins','goDefaultStoneSkin'];

async function loadGoAdmin() {
  if (!document.querySelector('#goSettingsForm')) return;
  goAdminData = await request('/api/admin/go');
  const settings = goAdminData.settings;
  for (const id of goSettingIds) {
    const field = document.getElementById(id); if (!field) continue; const value = settings[id];
    field.value = id === 'goAiProfiles' ? JSON.stringify(value, null, 2) : Array.isArray(value) ? value.join(',') : String(value);
  }
  const stats = goAdminData.stats, engine = goAdminData.engine;
  document.querySelector('#goAdminStats').innerHTML = `<div class="go-stat"><small>进行中</small><strong>${stats.activeGames}</strong></div><div class="go-stat"><small>已结束</small><strong>${stats.finishedGames}</strong></div><div class="go-stat"><small>待处理邀请</small><strong>${stats.pendingInvites}</strong></div><div class="go-stat"><small>研究棋谱</small><strong>${stats.studies}</strong></div><div class="go-stat"><small>题目 / 作答</small><strong>${stats.puzzles} / ${stats.puzzleAttempts}</strong></div><div class="go-stat engine-admin-state ${engine.available ? 'ready' : ''}"><small>KataGo</small><strong>${engine.available ? (engine.running ? '运行中' : '已就绪') : '环境不完整'}</strong></div>`;
  renderGoPuzzles();
}

function renderGoPuzzles() {
  const list = document.querySelector('#goPuzzleAdminList');
  list.innerHTML = goAdminData.puzzles.map(item => `<div class="go-puzzle-admin-row"><div><strong data-i18n-user>${esc(item.title)}</strong><small>${item.boardSize} 路 · ${item.difficulty} · ${item.status === 'published' ? '已发布' : item.status === 'archived' ? '已下架' : '草稿'} · <span data-i18n-user>${esc(item.objective)}</span></small></div><button class="button secondary" data-edit-go-puzzle="${item.id}">编辑</button></div>`).join('') || '<div class="empty">还没有围棋题目</div>';
  list.querySelectorAll('[data-edit-go-puzzle]').forEach(button => button.onclick = () => openPuzzleEditor(goAdminData.puzzles.find(item => item.id === button.dataset.editGoPuzzle)));
}

function openPuzzleEditor(item = null) {
  document.querySelector('#goPuzzleId').value = item?.id || ''; document.querySelector('#goPuzzleTitle').value = item?.title || ''; document.querySelector('#goPuzzleStatus').value = item?.status || 'draft'; document.querySelector('#goPuzzleSize').value = String(item?.boardSize || 9); document.querySelector('#goPuzzleDifficulty').value = item?.difficulty || '入门'; document.querySelector('#goPuzzleNext').value = item?.nextPlayer || 'B'; document.querySelector('#goPuzzleUserColor').value = item?.userColor || 'B'; document.querySelector('#goPuzzleObjective').value = item?.objective || ''; document.querySelector('#goPuzzleDescription').value = item?.description || ''; document.querySelector('#goPuzzleTags').value = (item?.tags || []).join(','); document.querySelector('#goPuzzleHints').value = (item?.hints || []).join('\n'); document.querySelector('#goPuzzleSource').value = item?.source || ''; document.querySelector('#goPuzzleSolution').value = JSON.stringify(item?.solutionTree || [], null, 2); document.querySelector('#goPuzzleNotice').textContent = ''; puzzleStones = structuredClone(item?.initialStones || []); puzzleTool = 'B'; document.querySelectorAll('[data-puzzle-stone]').forEach(button => button.classList.toggle('active', button.dataset.puzzleStone === 'B')); document.querySelector('#deleteGoPuzzle').classList.toggle('hidden', !item); renderPuzzleEditorBoard(); document.querySelector('#goPuzzleDialog').showModal();
}

function renderPuzzleEditorBoard() {
  const size = Number(document.querySelector('#goPuzzleSize').value), board = document.querySelector('#puzzleBoardEditor'); board.style.gridTemplateColumns = `repeat(${size},1fr)`; board.innerHTML = '';
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const stone = puzzleStones.find(item => item.x === x && item.y === y), button = document.createElement('button'); button.type = 'button'; button.className = `puzzle-point${x === 0 ? ' edge-left' : ''}${x === size - 1 ? ' edge-right' : ''}${y === 0 ? ' edge-top' : ''}${y === size - 1 ? ' edge-bottom' : ''}`; button.dataset.x = x; button.dataset.y = y; button.innerHTML = stone ? `<span class="${stone.color === 'B' ? 'black' : 'white'}"></span>` : ''; button.onclick = () => { puzzleStones = puzzleStones.filter(item => item.x !== x || item.y !== y); if (puzzleTool !== 'erase') puzzleStones.push({ color: puzzleTool, x, y }); renderPuzzleEditorBoard(); }; board.append(button);
  }
}

async function savePuzzleEditor(event) {
  event.preventDefault(); const notice = document.querySelector('#goPuzzleNotice'), id = document.querySelector('#goPuzzleId').value; notice.textContent = '';
  try {
    let solutionTree; try { solutionTree = JSON.parse(document.querySelector('#goPuzzleSolution').value || '[]'); } catch { throw new Error('答案树 JSON 格式错误'); }
    const payload = { title: document.querySelector('#goPuzzleTitle').value, status: document.querySelector('#goPuzzleStatus').value, boardSize: Number(document.querySelector('#goPuzzleSize').value), difficulty: document.querySelector('#goPuzzleDifficulty').value, nextPlayer: document.querySelector('#goPuzzleNext').value, userColor: document.querySelector('#goPuzzleUserColor').value, objective: document.querySelector('#goPuzzleObjective').value, description: document.querySelector('#goPuzzleDescription').value, tags: document.querySelector('#goPuzzleTags').value.split(/[,，]/).map(value => value.trim()).filter(Boolean), hints: document.querySelector('#goPuzzleHints').value.split(/\n/).map(value => value.trim()).filter(Boolean), source: document.querySelector('#goPuzzleSource').value, initialStones: puzzleStones, solutionTree };
    await request(id ? `/api/admin/go/puzzles/${id}` : '/api/admin/go/puzzles', { method: id ? 'PATCH' : 'POST', body: JSON.stringify(payload) }); document.querySelector('#goPuzzleDialog').close(); await loadGoAdmin();
  } catch (error) { notice.textContent = error.message; }
}

async function submitGoSettings(event) {
  event.preventDefault(); const note = document.querySelector('#goSettingsNotice'); note.textContent = '';
  const booleans = new Set(['goEnabled','goAiEnabled']), numbers = new Set(['goDefaultBoardSize','goDefaultKomi','goHandicapKomi','goMaxHandicap','goMaxUndoRequests','goDefaultMainMinutes','goMaxMainMinutes','goDefaultByoYomiSeconds','goDefaultByoYomiPeriods','goInviteExpiryMinutes','goMaxPendingInvites','goDisconnectGraceSeconds','goAiMoveTimeoutSeconds','goStudyMaxCount','goStudyMaxKB']), payload = {};
  for (const id of goSettingIds) { const value = document.getElementById(id).value; payload[id] = booleans.has(id) ? value === 'true' : numbers.has(id) ? Number(value) : value; }
  try { await request('/api/admin/go/settings', { method: 'PATCH', body: JSON.stringify(payload) }); note.style.color = 'var(--accent2)'; note.textContent = '围棋预设已保存；正在进行的棋局保持原配置。'; await loadGoAdmin(); } catch (error) { note.style.color = 'var(--danger)'; note.textContent = error.message; }
}

async function loadFeedback() {
  const query = encodeURIComponent(document.querySelector('#feedbackSearch').value.trim()), status = encodeURIComponent(document.querySelector('#feedbackStatus').value), data = await request(`/api/admin/feedback?page=${feedbackPage}&status=${status}&q=${query}`); feedbackPages = data.pages;
  for (const id of ['feedbackEnabled','feedbackAnonymousEnabled','feedbackMaxPerHour','feedbackRetentionDays']) { const field = document.getElementById(id); if (field) field.value = String(data.settings[id]); }
  document.querySelector('#feedbackPageInfo').textContent = `第 ${data.page} / ${data.pages} 页，共 ${data.total} 条`; document.querySelector('#prevFeedbackPage').disabled = data.page <= 1; document.querySelector('#nextFeedbackPage').disabled = data.page >= data.pages;
  const labels = { new: '新反馈', reviewing: '处理中', resolved: '已解决', closed: '已关闭' }, categories = { bug: '功能错误', suggestion: '建议', account: '账号', content: '内容', performance: '性能', other: '其他' };
  document.querySelector('#adminFeedbackList').innerHTML = `<div class="feedback-summary">${Object.entries(data.counts).map(([key, count]) => `<div class="feedback-count"><small>${labels[key]}</small><strong>${count}</strong></div>`).join('')}</div>` + (data.feedback.map(item => `<details class="feedback-item"><summary><span>${categories[item.category] || '其他'}</span><div><strong data-i18n-user>${esc(item.title)}</strong><small><span data-i18n-user>${esc(item.displayName)}</span>${item.username ? ` · @${esc(item.username)}` : ''} · ${new Date(item.createdAt).toLocaleString()} · ${esc(item.pagePath)}</small></div><b>${labels[item.status]}</b></summary><div class="feedback-item-body"><blockquote data-i18n-user>${esc(item.description)}</blockquote><small>联系方式：<span data-i18n-user>${esc(item.contact || '未填写')}</span><br>浏览器：<span data-i18n-user>${esc(item.userAgent || '未知')}</span></small><div class="feedback-admin-fields"><label>状态<select data-feedback-status="${item.id}"><option value="new">新反馈</option><option value="reviewing">处理中</option><option value="resolved">已解决</option><option value="closed">已关闭</option></select></label><label>优先级<select data-feedback-priority="${item.id}"><option value="low">低</option><option value="normal">普通</option><option value="high">高</option><option value="urgent">紧急</option></select></label><label>管理员备注<textarea data-feedback-note="${item.id}">${esc(item.adminNote || '')}</textarea></label></div><div class="feedback-actions"><button class="button secondary" data-save-feedback="${item.id}">保存处理记录</button><button class="button danger" data-delete-feedback="${item.id}">删除</button></div></div></details>`).join('') || '<div class="empty">没有匹配的问题反馈</div>');
  for (const item of data.feedback) { document.querySelector(`[data-feedback-status="${item.id}"]`).value = item.status; document.querySelector(`[data-feedback-priority="${item.id}"]`).value = item.priority; }
  document.querySelectorAll('[data-save-feedback]').forEach(button => button.onclick = async () => { const id = button.dataset.saveFeedback; button.disabled = true; try { await request(`/api/admin/feedback/${id}`, { method: 'PATCH', body: JSON.stringify({ status: document.querySelector(`[data-feedback-status="${id}"]`).value, priority: document.querySelector(`[data-feedback-priority="${id}"]`).value, adminNote: document.querySelector(`[data-feedback-note="${id}"]`).value }) }); await loadFeedback(); } catch (error) { alert(error.message); button.disabled = false; } });
  document.querySelectorAll('[data-delete-feedback]').forEach(button => button.onclick = async () => { if (!confirm('确定永久删除这条问题反馈吗？')) return; await request(`/api/admin/feedback/${button.dataset.deleteFeedback}`, { method: 'DELETE' }); await loadFeedback(); });
}

async function submitFeedbackSettings(event) {
  event.preventDefault(); const notice = document.querySelector('#feedbackSettingsNotice'); notice.textContent = '';
  try {
    await request('/api/admin/feedback/settings', { method: 'PATCH', body: JSON.stringify({ feedbackEnabled: document.querySelector('#feedbackEnabled').value === 'true', feedbackAnonymousEnabled: document.querySelector('#feedbackAnonymousEnabled').value === 'true', feedbackMaxPerHour: Number(document.querySelector('#feedbackMaxPerHour').value), feedbackRetentionDays: Number(document.querySelector('#feedbackRetentionDays').value) }) });
    notice.style.color = 'var(--accent2)'; notice.textContent = '反馈参数已保存'; await loadFeedback();
  } catch (error) { notice.style.color = 'var(--danger)'; notice.textContent = error.message; }
}

function bindGoAdmin() {
  document.querySelector('#goSettingsForm')?.addEventListener('submit', submitGoSettings); document.querySelector('#refreshGoAdmin')?.addEventListener('click', loadGoAdmin); document.querySelector('#newGoPuzzle')?.addEventListener('click', () => openPuzzleEditor()); document.querySelector('#goPuzzleForm')?.addEventListener('submit', savePuzzleEditor); document.querySelector('#goPuzzleSize')?.addEventListener('change', () => { puzzleStones = []; renderPuzzleEditorBoard(); });
  document.querySelector('#closeGoPuzzleDialog')?.addEventListener('click', () => document.querySelector('#goPuzzleDialog').close());
  document.querySelector('#feedbackSettingsForm')?.addEventListener('submit', submitFeedbackSettings);
  document.querySelectorAll('[data-puzzle-stone]').forEach(button => button.onclick = () => { puzzleTool = button.dataset.puzzleStone; document.querySelectorAll('[data-puzzle-stone]').forEach(item => item.classList.toggle('active', item === button)); }); document.querySelector('#clearPuzzleBoard')?.addEventListener('click', () => { puzzleStones = []; renderPuzzleEditorBoard(); });
  document.querySelector('#deleteGoPuzzle')?.addEventListener('click', async () => { const id = document.querySelector('#goPuzzleId').value; if (!id || !confirm('确定删除这道围棋题目吗？')) return; await request(`/api/admin/go/puzzles/${id}`, { method: 'DELETE' }); document.querySelector('#goPuzzleDialog').close(); await loadGoAdmin(); });
  document.querySelector('#searchFeedback')?.addEventListener('click', () => { feedbackPage = 1; loadFeedback(); }); document.querySelector('#feedbackStatus')?.addEventListener('change', () => { feedbackPage = 1; loadFeedback(); }); document.querySelector('#prevFeedbackPage')?.addEventListener('click', () => { if (feedbackPage > 1) { feedbackPage--; loadFeedback(); } }); document.querySelector('#nextFeedbackPage')?.addEventListener('click', () => { if (feedbackPage < feedbackPages) { feedbackPage++; loadFeedback(); } });
}

bindGoAdmin(); Promise.all([loadGoAdmin(), loadFeedback()]).catch(error => console.error('Go admin:', error));
