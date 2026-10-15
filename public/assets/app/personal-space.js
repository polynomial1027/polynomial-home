window.createPersonalSpace = ({ getData, isOffline, tools, icon, api, refresh, notice }) => {
  const $ = selector => document.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ids = { '#assistant': 'assistant', '/drive.html': 'drive', '/chat.html': 'chat', '/learning.html': 'learning', '#calendar': 'calendar', '/games.html': 'games', '/download.html': 'downloads', '/genshin-calculator/':'calculator', '/workspace.html': 'advanced', '#control': 'control' };
  const groups = { assistant: '日常工作', drive: '日常工作', chat: '日常工作', calendar: '日常工作', learning: '学习与探索', games: '学习与探索', calculator:'学习与探索', downloads: '资源与设置', advanced: '资源与设置', control: '资源与设置' };
  const widgetLabels = { welcome: '欢迎与下一项安排', today: '今天的安排', brief: '每日回顾', tools: '我的收藏入口' };
  let draft, historyPage = 1, historyRows = [], historySequence = 0;
  const entries = () => tools().map(entry => ({ entry, id: ids[entry[4]], group: groups[ids[entry[4]]] }));
  const preferences = () => getData()?.preferences || { favorites: ['drive', 'chat', 'learning', 'calendar'], hiddenWidgets: [], updatedAt: null };
  function tile({ entry, id }, pin = false) {
    const [, symbol, title, description, href] = entry, selected = preferences().favorites.includes(id);
    return `<div class="tool-entry"><a class="tool-tile" href="${href}"><span data-icon="${symbol}">${icon(symbol)}</span><div><strong>${esc(title)}</strong><small>${esc(description)}</small></div></a>${pin ? `<button type="button" class="tool-pin" data-pin-tool="${id}" aria-pressed="${selected}" aria-label="${selected ? '取消收藏' : '收藏'}${esc(title)}" ${isOffline() ? 'disabled' : ''}>${selected ? '★' : '☆'}</button>` : ''}</div>`;
  }
  function render() {
    if (!getData()) return;
    const prefs = preferences(), available = entries(), favorites = prefs.favorites.map(id => available.find(row => row.id === id)).filter(Boolean);
    $('#quickTools').innerHTML = favorites.length ? favorites.map(row => tile(row)).join('') : '<p class="muted">还没有收藏入口。到工具页点击星标，或在“自定义首页”中选择。</p>';
    document.querySelectorAll('[data-home-widget]').forEach(node => { node.hidden = prefs.hiddenWidgets.includes(node.dataset.homeWidget); });
    $('#customizeSpace').disabled = isOffline();
    const query = $('#toolSearch').value.trim().toLowerCase(), visible = available.filter(row => `${row.entry[2]} ${row.entry[3]} ${row.group}`.toLowerCase().includes(query));
    $('#toolResultCount').textContent = `${visible.length} 个可用工具`;
    $('#allTools').innerHTML = Object.values(groups).filter((group, index, all) => all.indexOf(group) === index).map(group => {
      const rows = visible.filter(row => row.group === group);
      return rows.length ? `<section class="tool-group"><h2>${group}<span>${rows.length}</span></h2><div class="all-tools">${rows.map(row => tile(row, true)).join('')}</div></section>` : '';
    }).join('') || '<p class="muted">没有找到工具，试试“日历”“文件”或“设置”。</p>';
    $('#spaceSaveHint').textContent = isOffline() ? '离线时暂不能修改。联网后可同步到你的其他设备。' : '首页收藏与组件设置随账号同步到你的其他设备。';
    $('#openChatHistory').disabled = isOffline();
  }
  async function save(value) {
    if (isOffline()) throw new Error('请联网后修改个人空间');
    await api('/api/account/workspace-preferences', { method: 'PATCH', body: JSON.stringify({ favorites: value.favorites, hiddenWidgets: value.hiddenWidgets, ifUnmodifiedSince: value.updatedAt }) });
    await refresh();
  }
  function renderChoices() {
    const available = entries(), ordered = [...draft.favorites.map(id => available.find(row => row.id === id)).filter(Boolean), ...available.filter(row => !draft.favorites.includes(row.id))];
    $('#spaceFavoriteChoices').innerHTML = ordered.map(row => {
      const index = draft.favorites.indexOf(row.id), selected = index >= 0;
      return `<div class="space-choice"><label><input type="checkbox" data-space-favorite="${row.id}" ${selected ? 'checked' : ''}><span>${esc(row.entry[2])}</span></label><div><button type="button" class="icon-button" data-move-tool="${row.id}" data-direction="-1" aria-label="上移${esc(row.entry[2])}" ${!selected || index === 0 ? 'disabled' : ''}>↑</button><button type="button" class="icon-button" data-move-tool="${row.id}" data-direction="1" aria-label="下移${esc(row.entry[2])}" ${!selected || index === draft.favorites.length - 1 ? 'disabled' : ''}>↓</button></div></div>`;
    }).join('');
  }
  function populate() {
    draft = { ...preferences(), favorites: [...preferences().favorites], hiddenWidgets: [...preferences().hiddenWidgets] };
    renderChoices(); $('#spaceSettingsError').textContent = '';
    $('#spaceWidgetChoices').innerHTML = Object.entries(widgetLabels).map(([id, label]) => `<label class="space-widget-choice"><input type="checkbox" data-space-widget="${id}" ${draft.hiddenWidgets.includes(id) ? '' : 'checked'}><span>${label}</span></label>`).join('');
  }
  $('#customizeSpace').onclick = () => { populate(); $('#spaceSettingsDialog').showModal(); };
  $('#toolSearch').oninput = render;
  $('#allTools').addEventListener('click', async event => {
    const button = event.target.closest('[data-pin-tool]'); if (!button) return;
    button.disabled = true;
    try { const prefs = preferences(), id = button.dataset.pinTool; await save({ ...prefs, favorites: prefs.favorites.includes(id) ? prefs.favorites.filter(value => value !== id) : [...prefs.favorites, id] }); notice('收藏已同步。'); }
    catch (error) { await refresh().catch(() => {}); notice(error.message, 'error'); }
    finally { button.disabled = false; }
  });
  $('#spaceFavoriteChoices').addEventListener('change', event => { const id = event.target.dataset.spaceFavorite; if (!id) return; draft.favorites = event.target.checked ? [...draft.favorites, id] : draft.favorites.filter(value => value !== id); renderChoices(); });
  $('#spaceFavoriteChoices').addEventListener('click', event => { const button = event.target.closest('[data-move-tool]'); if (!button) return; const index = draft.favorites.indexOf(button.dataset.moveTool), target = index + Number(button.dataset.direction); if (index >= 0 && target >= 0 && target < draft.favorites.length) { [draft.favorites[index], draft.favorites[target]] = [draft.favorites[target], draft.favorites[index]]; renderChoices(); } });
  $('#reloadSpaceSettings').onclick = async () => { try { await refresh(); populate(); } catch (error) { $('#spaceSettingsError').textContent = error.message; } };
  $('#spaceSettingsForm').onsubmit = async event => {
    event.preventDefault(); const button = event.submitter; button.disabled = true;
    draft.hiddenWidgets = [...$('#spaceWidgetChoices').querySelectorAll('input:not(:checked)')].map(node => node.dataset.spaceWidget);
    try { await save(draft); $('#spaceSettingsDialog').close(); notice('个人首页已保存，其他设备刷新后同步。'); }
    catch (error) { $('#spaceSettingsError').textContent = `${error.message}。可点击“重新载入”读取最新设置。`; }
    finally { button.disabled = false; }
  };
  async function loadHistory(page = 1) {
    const sequence = ++historySequence; $('#historyStatus').textContent = '正在读取你的记录…';
    $('#historyPrev').disabled = true; $('#historyNext').disabled = true;
    try {
      const query = new URLSearchParams({ q: $('#historyQuery').value.trim(), date: $('#historyDate').value, sessionId: $('#historySession').value, page });
      const result = await api(`/api/account/assistant-history?${query}`); if (sequence !== historySequence) return;
      historyRows = result.messages; historyPage = result.page;
      $('#historyStatus').textContent = `${result.total} 条记录 · 第 ${result.page} / ${result.pages} 页 · 时间为北京时间`;
      $('#historyResults').innerHTML = result.messages.map((row, index) => `<article class="history-message"><header><strong>${row.role === 'user' ? '你' : 'Polynomial 助手'}</strong><time>${row.at ? esc(new Date(row.at).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })) : '时间未记录'}</time><button type="button" class="text-button" data-copy-history="${index}">复制</button></header><div>${row.role === 'assistant' ? window.renderAssistantMath(row.content) : esc(row.content)}</div></article>`).join('') || '<p class="muted">没有找到记录。可更换关键词或清除日期。</p>';
      $('#historyPrev').disabled = result.page <= 1; $('#historyNext').disabled = result.page >= result.pages;
    } catch (error) { if (sequence === historySequence) { $('#historyStatus').textContent = error.message; $('#historyResults').replaceChildren(); } }
  }
  $('#openChatHistory').onclick = () => { $('#historySession').innerHTML = '<option value="">所有会话</option>' + (getData()?.ai?.sessions || []).map(row => `<option value="${row.id}">${esc(row.title)}${row.archived ? '（已归档）' : ''}</option>`).join(''); $('#chatHistoryDialog').showModal(); loadHistory(); };
  $('#historySearchForm').onsubmit = event => { event.preventDefault(); loadHistory(); };
  $('#historyPrev').onclick = () => loadHistory(historyPage - 1); $('#historyNext').onclick = () => loadHistory(historyPage + 1);
  $('#historyResults').addEventListener('click', async event => { const button = event.target.closest('[data-copy-history]'); if (!button) return; try { await navigator.clipboard.writeText(historyRows[Number(button.dataset.copyHistory)].content); button.textContent = '已复制'; } catch { $('#historyStatus').textContent = '无法访问剪贴板，可直接选择文字复制。'; } });
  return { render };
};
