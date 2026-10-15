(() => {
  const $ = selector => document.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const paths = {
    home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z"/>',
    spark: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z"/><path d="m20 2 .5 1.5L22 4l-1.5.5L20 6l-.5-1.5L18 4l1.5-.5Z"/>',
    chat: '<path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H5l-3 2v-9.5A8.5 8.5 0 0 1 10.5 4H13a8 8 0 0 1 8 7.5Z"/><path d="M7 10h9M7 14h6"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 10h18m-13 5h.01m4 0h.01m4 0h.01"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
    shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9S4 17 4 12V6Z"/><path d="m8 12 3 3 5-6"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>', arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
    check: '<path d="m5 12 4 4L19 6"/>', clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    refresh: '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M5 8a8 8 0 0 1 13-3l2 2M4 17l2 2a8 8 0 0 0 13-3"/>',
    download: '<path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/>',
    drive: '<path d="M3 7h7l2 2h9v11H3Z"/><path d="M3 7V4h7l2 3"/>',
    book: '<path d="M12 5c-3-2-7-2-10-1v15c4-1 7 0 10 2 3-2 6-3 10-2V4c-3-1-7-1-10 1Zm0 0v16"/>',
    game: '<path d="M7 7h10c4 0 5 12 2 13l-4-4H9l-4 4C2 19 3 7 7 7Z"/><path d="M7 10v4m-2-2h4m7-1h.01m2 3h.01"/>',
    pause: '<path d="M8 5v14M16 5v14"/>', play: '<path d="m8 4 12 8-12 8Z"/>',
    edit: '<path d="m15 4 5 5M4 20l4-1L21 6a2 2 0 0 0-3-3L5 16Z"/>',
    trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    bell: '<path d="M18 8a6 6 0 0 0-12 0v7l-2 3h16l-2-3ZM9 21h6"/>'
  };
  const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.grid}</svg>`;
  document.querySelectorAll('[data-icon]').forEach(node => { node.innerHTML = icon(node.dataset.icon); });
  const day = value => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
  const time = value => new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const fullTime = value => new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  const localInput = value => new Date(new Date(value).getTime() + 8 * 3600_000).toISOString().slice(0, 16);
  const storage = { get(key) { try { return localStorage.getItem(key); } catch { return null; } }, set(key, value) { try { localStorage.setItem(key, value); } catch {} } };
  let offline = false;
  let data, admin, butler, busy = false, refreshing = false, activePage, editingTask = null, editingTaskVersion = null, selected = day(new Date()), month = selected.slice(0, 7), filter = 'open', pendingMessage = '', noticeTimer, chatSignature = '', confirmation;
  const pageNames = { home: '总览', assistant: '智能助手', calendar: '计划与日历', tools: '常用工具', control: '服务器管理', account: '账号与偏好' };
  const toolDefinitions = [
    ['driveEnabled', 'drive', '文件网盘', '个人文件与公共共享资源', '/drive.html'],
    ['accessChat', 'chat', '团队聊天', '与成员保持联系', '/chat.html'],
    ['accessLearning', 'book', '网络学习', '课程、实验与学习进度', '/learning.html'],
    ['accessPlanner', 'calendar', '计划与日历', '安排每一天，按时提醒', '#calendar'],
    ['accessGames', 'game', '小游戏', '围棋与休闲空间', '/games.html'],
    [null, 'download', '资源下载', '安装包、版本与共享资料', '/download.html'],
    [null, 'home', '高级设置与报告', '完整参数与历史报告', '/workspace.html']
  ];
  const permitted = key => !key || data?.user.role === 'admin' || data?.user.permissions?.[key] === true;
  const tools = () => [...toolDefinitions.filter(([key]) => permitted(key)), ...(data?.user.role === 'admin' ? [[null, 'shield', '服务器管理', '账号、巡检与用量', '#control']] : [])];
  const personalSpace = window.createPersonalSpace({ getData: () => data, isOffline: () => offline, tools, icon, api, refresh, notice });
  function notice(message, kind = 'success') { clearTimeout(noticeTimer); $('#appNotice').hidden = !message; $('#appNotice').textContent = message || ''; $('#appNotice').dataset.kind = kind; if (message && kind !== 'error') noticeTimer = setTimeout(() => { $('#appNotice').hidden = true; }, 5000); }
  async function api(url, options = {}) {
    if (offline && options.method && options.method !== 'GET') throw new Error('离线日程为只读，请连接服务器后修改');
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), !options.method || options.method === 'GET' ? 15000 : 120000);
    let response; try { response = await fetch(url, { ...options, signal: options.signal || controller.signal, credentials: 'same-origin', headers: { 'Content-Type': 'application/json', ...options.headers } }); } catch (error) { error.network = true; throw error; } finally { clearTimeout(timeout); }
    const result = await response.json();
    if (!response.ok) { if (response.status === 401) { window.PolynomialCalendarCache?.clear(); window.__TAURI__?.core?.invoke('clear_reminders').catch(() => {}); location.href = '/login.html?next=' + encodeURIComponent('/app.html' + location.hash); } throw new Error(result.error || '操作失败，请重试'); }
    return result;
  }
  const action = (fn, prevent = true) => async event => { if (prevent) event?.preventDefault(); try { await fn(event); } catch (error) { notice(error.message, 'error'); } };
  function applyAppearance() {
    const choice = storage.get('polynomial:appearance') || 'time';
    const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Shanghai', hour: 'numeric', hourCycle: 'h23' }).format(new Date()));
    document.body.dataset.theme = choice === 'dark' || (choice === 'system' && matchMedia('(prefers-color-scheme: dark)').matches) || (choice === 'time' && (hour < 5 || hour >= 18)) ? 'dark' : 'light';
    document.body.dataset.compact = storage.get('polynomial:compact') === 'true';
    $('#appearance').value = choice; $('#compactLayout').checked = document.body.dataset.compact === 'true';
    $('meta[name="theme-color"]').content = document.body.dataset.theme === 'dark' ? '#142321' : '#f4f6f3';
  }
  function updateTime() {
    const now = new Date(), hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Shanghai', hour: 'numeric', hourCycle: 'h23' }).format(now));
    $('#greeting').textContent = hour < 5 ? '凌晨好' : hour < 11 ? '早上好' : hour < 14 ? '中午好' : hour < 18 ? '下午好' : '晚上好';
    document.body.dataset.period = hour < 5 ? 'dawn' : hour < 11 ? 'morning' : hour < 14 ? 'noon' : hour < 18 ? 'afternoon' : 'night';
    $('#todayLabel').textContent = now.toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai', weekday: 'long', month: 'long', day: 'numeric' });
    applyAppearance();
  }
  function route(scroll = true) {
    let page = location.hash.slice(1) || 'home'; if (!Object.hasOwn(pageNames, page)) page = 'home';
    if (page === 'control' && data && data.user.role !== 'admin') page = 'home';
    document.querySelectorAll('[data-view]').forEach(view => { view.hidden = view.dataset.view !== page || (view.dataset.view === 'control' && data?.user.role !== 'admin'); });
    document.querySelectorAll('.app-nav [data-page]').forEach(link => { const current = link.dataset.page === page; link.classList.toggle('active', current); if (current) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current'); });
    $('#currentPage').textContent = pageNames[page]; document.title = `${pageNames[page]} · Polynomial`;
    const changed = page !== activePage;
    if (changed) for (const id of ['chatHistoryDialog', 'spaceSettingsDialog']) { const dialog = $(`#${id}`); if (dialog.open) dialog.close(); }
    if (scroll && changed) window.scrollTo({ top: 0 }); activePage = page; document.body.dataset.page = page;
    if (page === 'assistant') { updateDraft(); if (changed) requestAnimationFrame(() => { $('#appChatThread').scrollTop = $('#appChatThread').scrollHeight; }); }
  }
  const empty = (symbol, title, description) => `<div class="empty-state"><span data-icon="${symbol}">${icon(symbol)}</span><h3>${esc(title)}</h3><p>${esc(description)}</p></div>`;
  function tasks(items) {
    if (!items.length) return empty('calendar', '留一点空间给自己', '目前没有匹配的日程，可以添加一件事。');
    return items.map(item => {
      const overdue = item.dueAt && Date.parse(item.dueAt) < Date.now() && !item.done && item.scheduled !== false;
      return `<div class="task-row ${item.done ? 'done' : ''} ${item.scheduled === false ? 'paused' : ''} ${overdue ? 'overdue' : ''}"><input type="checkbox" data-task-toggle="${esc(item.id)}" aria-label="${esc(item.done ? '重新打开' : '完成')} ${esc(item.title)}" ${item.done ? 'checked' : ''} ${!permitted('accessPlanner') ? 'disabled' : ''}><button type="button" class="task-title" data-edit-task="${esc(item.id)}" ${!permitted('accessPlanner') ? 'disabled' : ''}><strong>${esc(item.title)}</strong><small>${item.dueAt ? time(item.dueAt) : '未设置时间'}${item.scheduled === false ? ' · 已暂停' : overdue ? ' · 已到期' : ''}${item.source === 'assistant' ? ' <span class="task-source">· AI 安排</span>' : ''}</small></button>${permitted('accessPlanner') ? `<div class="task-actions"><button type="button" data-pause-task="${esc(item.id)}" aria-label="${item.scheduled === false ? '恢复' : '暂停'} ${esc(item.title)}">${icon(item.scheduled === false ? 'play' : 'pause')}</button><button type="button" data-delete-task="${esc(item.id)}" aria-label="删除 ${esc(item.title)}">${icon('trash')}</button></div>` : ''}</div>`;
    }).join('');
  }
  function renderCalendar() {
    if (!data) return;
    const [year, number] = month.split('-').map(Number), start = new Date(Date.UTC(year, number - 1, 1)); start.setUTCDate(1 - (start.getUTCDay() + 6) % 7);
    $('#appMonth').textContent = `${year} 年 ${number} 月`;
    $('#appCalendar').innerHTML = Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start); date.setUTCDate(start.getUTCDate() + index); const key = date.toISOString().slice(0, 10);
      const own = data.planner.filter(item => item.dueAt && day(item.dueAt) === key && !item.done && item.scheduled !== false);
      return `<button type="button" data-date="${key}" aria-label="${key}，${own.length} 项待办" aria-pressed="${key === selected}" class="${key.slice(0, 7) !== month ? 'outside' : ''} ${key === selected ? 'selected' : ''} ${key === day(new Date()) ? 'today' : ''}"><span>${date.getUTCDate()}</span>${own.length ? `<small>${esc(own[0].title)}</small><i></i>` : ''}</button>`;
    }).join('');
    $('#selectedDay').textContent = new Date(`${selected}T12:00:00+08:00`).toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai', month: 'long', day: 'numeric', weekday: 'short' });
    $('#selectedTasks').innerHTML = tasks(data.planner.filter(item => item.dueAt && day(item.dueAt) === selected));
    renderAgenda();
  }
  function renderAgenda() {
    if (!data) return;
    const query = $('#taskSearch').value.trim().toLowerCase();
    const visible = data.planner.filter(item => (!query || item.title.toLowerCase().includes(query)) && (filter === 'all' || filter === 'done' && item.done || filter === 'paused' && !item.done && item.scheduled === false || filter === 'open' && !item.done && item.scheduled !== false));
    $('#agendaTasks').innerHTML = tasks(visible);
    document.querySelectorAll('[data-filter]').forEach(button => { button.classList.toggle('active', button.dataset.filter === filter); button.setAttribute('aria-pressed', button.dataset.filter === filter); });
  }
  function renderHome() {
    const today = day(new Date()), todayItems = data.planner.filter(item => item.dueAt && day(item.dueAt) === today && item.scheduled !== false);
    const completed = todayItems.filter(item => item.done).length, queue = data.assistant.queue.filter(item => item.status === 'pending');
    $('#statToday').textContent = todayItems.filter(item => !item.done).length; $('#statCompleted').textContent = data.brief.completed.length; $('#statQueue').textContent = queue.length;
    $('#todayTasks').innerHTML = tasks(todayItems.slice(0, 5));
    $('#briefSummary').textContent = `今天已完成 ${data.brief.completed.length} 件事。明天有 ${data.brief.tomorrowItems.filter(item => item.scheduled !== false).length} 项安排等待你确认。`;
    const progress = todayItems.length ? Math.round(completed / todayItems.length * 100) : 0;
    $('#dayProgress').style.setProperty('--progress', `${progress}%`); $('#dayProgressValue').textContent = `${progress}%`;
    const upcoming = data.planner.find(item => item.dueAt && Date.parse(item.dueAt) > Date.now() && !item.done && item.scheduled !== false);
    $('#nextTaskTime').textContent = upcoming ? new Date(upcoming.dueAt).toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit' }) : '留一点空白';
    $('#nextTaskTitle').textContent = upcoming?.title || '暂时没有定时安排';
    $('#nextTaskDate').textContent = upcoming ? `${day(upcoming.dueAt) === today ? '今天' : time(upcoming.dueAt).split(' ')[0]} · ${upcoming.source === 'assistant' ? 'AI 为你安排' : '你的个人计划'}` : '从一件小事开始，给想法一个时间。';
    personalSpace.render();
    const overdue = data.planner.filter(item => !item.done && item.scheduled !== false && item.dueAt && Date.parse(item.dueAt) < Date.now() && day(item.dueAt) !== today);
    const failedQueue = data.assistant.queue.filter(item => item.status === 'failed');
    const pendingActions = butler?.actions?.filter(item => item.status === 'pending') || [];
    const attention = [overdue.length ? `<a href="#calendar">${overdue.length} 项逾期待办 ↗</a>` : '', failedQueue.length ? `<a href="#assistant">${failedQueue.length} 条 AI 消息发送失败 ↗</a>` : '', data.user.role === 'admin' && pendingActions.length ? `<a href="#control">${pendingActions.length} 项权限变更待确认 ↗</a>` : ''].filter(Boolean);
    $('#homeAttention').hidden = !attention.length; $('#homeAttention').innerHTML = `<strong>需要你处理</strong><div class="row-actions">${attention.join('')}</div>`;
    const latestReview = admin?.reviews?.[0];
    const report = data.health?.[0]; $('#homeHealth').textContent = report ? `${report.day} · ${report.severity === 'warning' ? '有项目需要留意' : '基础报告已生成'}。${report.notes}` : '暂时没有检查报告，可到管理空间生成基础报告。';
    if (data.user.role === 'admin' && latestReview) $('#homeHealth').textContent += ` AI 巡检（${fullTime(latestReview.createdAt)}）：${latestReview.summary || latestReview.error || '正在分析'}。`;
  }
  function renderChat(forceScroll = false) {
    const ready = data.assistant.allowed && data.assistant.enabled && data.assistant.configured;
    $('#assistantStatus').textContent = ready ? (data.assistant.pricing.peak ? '高峰时段 · 可排队发送' : '低峰时段 · 可使用') : !data.assistant.allowed ? '未获授权' : '暂未开放';
    $('#assistantDescription').textContent = ready ? '与你的计划和日历相连，继续一个想法。' : '管理员尚未开放 AI 服务；日程和其他工具可以继续使用。';
    $('#appChatMessage').disabled = !ready; $('#sendChat').disabled = !ready || busy;
    $('#sendChat').querySelector('span').textContent = busy ? '处理中' : '发送';
    const signature = JSON.stringify([data.chats, busy, pendingMessage]);
    if (signature !== chatSignature) {
      const thread = $('#appChatThread'), wasAtBottom = thread.scrollHeight - thread.scrollTop - thread.clientHeight < 100;
      const messageHtml = (content, role, index, at) => `<div class="message ${role === 'user' ? 'user' : ''}"><span class="message-avatar">${role === 'user' ? esc(data.user.displayName.slice(0, 1)) : icon('spark')}</span><div class="message-body"><div class="message-header"><span>${role === 'user' ? '你' : 'Polynomial 助手'}</span>${at ? `<time>${time(at)}</time>` : ''}${role === 'assistant' ? `<button type="button" data-copy-message="${index}">复制</button>` : ''}</div><div>${role === 'user' ? esc(content) : window.renderAssistantMath(content)}</div></div></div>`;
      let html = data.chats.map((item, index) => messageHtml(item.content, item.role, index, item.at || item.createdAt)).join('');
      if (busy && pendingMessage) html += messageHtml(pendingMessage, 'user', -1) + `<div class="message"><span class="message-avatar">${icon('spark')}</span><div class="message-body"><div class="message-header">正在整理回复</div><div class="typing" aria-label="正在回复"><i></i><i></i><i></i></div></div></div>`;
      thread.innerHTML = html || empty('spark', '从一个问题开始', '也可以告诉助手，你想在什么时候做什么。');
      if (forceScroll || wasAtBottom || !chatSignature) thread.scrollTop = thread.scrollHeight;
      chatSignature = signature;
    }
    const queue = data.assistant.queue.filter(item => ['pending', 'running', 'failed'].includes(item.status)).slice(-10).reverse();
    $('#appQueue').innerHTML = queue.length ? queue.map(item => `<div class="queue-item"><strong>${esc(item.message || item.error || '消息处理中')}</strong><div><span>${item.status === 'pending' ? '等待低峰发送' : item.status === 'running' ? '正在发送' : '发送失败'} · ${time(item.createdAt)}</span>${item.status === 'pending' ? `<button type="button" data-cancel-queue="${esc(item.id)}">取消</button>` : ''}</div></div>`).join('') : empty('clock', '没有等待中的消息', '选择低峰发送后，可在这里查看。');
  }
  function renderAdmin() {
    if (!admin || data.user.role !== 'admin') return;
    const usage = admin.globalUsage, settings = admin.settings;
    $('#appUsage').innerHTML = [['今日 Token', usage.dailyTokens, settings.assistantDailyTokens], ['本月 Token', usage.monthlyTokens, settings.assistantMonthlyTokens], ['今日调用', usage.dailyRequests, settings.assistantDailyRequests]].map(([label, value, max]) => `<div class="usage-row"><div><span>${label}</span><strong>${Number(value).toLocaleString()} / ${Number(max).toLocaleString()}</strong></div><div class="usage-bar"><span style="width:${max > 0 ? Math.min(100, value / max * 100) : value > 0 ? 100 : 0}%"></span></div></div>`).join('');
    $('#appReview').disabled = !admin.configured || !settings.assistantEnabled || admin.reviewRunning;
    if (document.activeElement !== $('#appReviewFrequency')) $('#appReviewFrequency').value = settings.assistantReviewFrequency || 'off';
    $('#appReviewResults').innerHTML = admin.reviews?.length ? admin.reviews.slice(0, 5).map(review => `<div class="operation-row"><div><strong>${review.status === 'completed' ? ({ normal: '正常', warning: '需要留意', critical: '需要处理' })[review.risk] || '已完成' : review.status === 'running' ? '分析中' : '巡检失败'}</strong><small>${fullTime(review.createdAt)} · ${review.source === 'manual' ? '手动' : '自动'}<br>${esc(review.summary || review.error || '正在分析')}<br>统计区间 ${fullTime(review.windowStart)} — ${fullTime(review.windowEnd)}</small></div></div>`).join('') : '<p class="muted">暂无 AI 巡检结果。</p>';
    const report = admin.reports?.[0];
    const ssh = report?.systemLogin;
    const sshStatus = ssh?.status === 'available' ? `已读取 SSH 日志 · 成功 ${Number(ssh.accepted) || 0} / 失败 ${Number(ssh.failed) || 0}` : ssh?.status === 'no_entries' ? '所查询的 SSH 日志中没有记录，无法据此确认没有异常。' : '无法读取 SSH 登录日志；本次检查未覆盖系统登录。';
    $('#healthSummary').innerHTML = report ? `<span class="health-badge ${report.severity === 'warning' ? 'warning' : ''}">${report.severity === 'warning' ? '需要留意' : '检查报告已生成'}</span><p class="muted">${esc(report.notes)}</p><div class="health-details"><div><small>站内登录成功 / 失败</small><strong>${report.loginSuccess} / ${report.loginFailed}</strong></div><div><small>数据盘剩余</small><strong>${report.disk ? `${report.disk.freeGB} / ${report.disk.totalGB} GB` : '暂不可读取'}</strong></div></div><div class="health-visibility" data-state="${ssh?.status || 'unavailable'}"><strong>系统登录检查</strong><br>${esc(sshStatus)}</div><p class="health-window">统计区间（北京时间）<br>${fullTime(report.windowStart)} — ${fullTime(report.windowEnd)}<br>报告生成于 ${fullTime(report.createdAt)}</p>` : empty('shield', '暂无报告', '点击刷新按钮生成只读基础报告。');
    if (butler) $('#appButlerThread').innerHTML = butler.chats.map(item => {
      const proposal = butler.actions.find(action => action.id === item.actionId);
      const action = proposal ? `<div class="butler-action"><strong>${esc(proposal.targetName)} · ${esc(proposal.label || proposal.permission)}：${proposal.before ? '开放' : '关闭'} → ${proposal.value ? '开放' : '关闭'}</strong>${proposal.status === 'pending' ? `<button class="secondary small" data-confirm-butler="${proposal.id}">核对并执行</button><button class="secondary small" data-cancel-butler="${proposal.id}">取消</button><small>有效至 ${fullTime(proposal.expiresAt)}</small>` : `<small>${({ confirmed: '已执行', cancelled: '已取消', expired: '已过期' })[proposal.status] || esc(proposal.status)}</small>`}</div>` : '';
      const link = item.link && ['/admin.html','/ai-records.html','/drive.html'].some(path => item.link.split('?')[0].split('#')[0] === path) ? `<a href="${esc(item.link)}" class="text-link">打开相关页面 ↗</a>` : '';
      return `<div class="message user"><div class="message-body">${esc(item.message)}</div></div><div class="message"><div class="message-body">${esc(item.reply)}${link}${action}</div></div>`;
    }).join('') || empty('shield', '你的服务器管家', '问我登录情况、用量或服务器状态，也可以核对并执行权限变更。');
  }
  function render() {
    document.querySelectorAll('[data-offline-disabled]').forEach(node => { node.disabled = node.dataset.offlineDisabled === 'true'; delete node.dataset.offlineDisabled; });
    document.body.classList.toggle('offline-mode', offline);
    const user = data.user;
    $('#userName').textContent = user.displayName; $('#accountButton').textContent = user.displayName.slice(0, 1); $('#accountAvatar').textContent = user.displayName.slice(0, 1);
    $('#accountName').textContent = user.displayName; $('#accountRole').textContent = user.role === 'admin' ? `管理员 · @${user.username}` : `成员 · @${user.username}`; $('#serverAddress').textContent = location.origin;
    document.querySelectorAll('.admin-only').forEach(node => { node.hidden = user.role !== 'admin'; });
    document.querySelectorAll('.planner-only').forEach(node => { node.hidden = !permitted('accessPlanner'); });
    renderHome(); renderCalendar(); renderChat(); renderAdmin(); route(false); $('#appContent').setAttribute('aria-busy', 'false');
    $('#offlineCalendar').checked = window.PolynomialCalendarCache?.enabled();
    if (offline) { for (const node of document.querySelectorAll('[data-add-task],[data-edit-task],[data-delete-task],[data-pause-task],[data-task-toggle],#enableReminders,#disableReminders,#testReminders,#saveBrief')) { node.dataset.offlineDisabled = String(node.disabled); node.disabled = true; } $('#accountRole').textContent = '离线日程副本 · 只读'; }
    document.dispatchEvent(new CustomEvent('polynomial-snapshot', { detail: { data, admin, butler, offline } }));
  }
  let refreshTail = Promise.resolve();
  function refresh() { const run = refreshTail.catch(() => {}).then(refreshSnapshot); refreshTail = run; return run; }
  async function refreshSnapshot() {
    refreshing = true; $('#refreshApp').classList.add('refreshing'); $('#refreshApp').disabled = true;
    try {
      const snapshot = await api('/api/workspace');
      const stored = window.PolynomialCalendarCache?.load(); if (stored && stored.user.id !== snapshot.user.id) window.PolynomialCalendarCache.clear();
      data = snapshot; offline = false; window.PolynomialCalendarCache?.save(data);
      if (data.user.role === 'admin') { const results = await Promise.allSettled([api('/api/admin/assistant'), api('/api/admin/butler')]); admin = results[0].status === 'fulfilled' ? results[0].value : admin; butler = results[1].status === 'fulfilled' ? results[1].value : butler; }
      render(); maybeBrief(); window.PolynomialReminderUI?.sync(data).catch(error => console.warn('Reminder sync:', error));
      $('#connectionStatus').textContent = `已同步 · ${new Date().toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit' })}`;
      if (!$('#appChatMessage').value) { try { $('#appChatMessage').value = sessionStorage.getItem(`assistant-draft:${data.user.id}`) || ''; } catch {} updateDraft(); }
    } catch (error) {
      const cached = error.network && window.PolynomialCalendarCache?.load();
      if (cached) { data = cached; admin = null; butler = null; offline = true; render(); $('#connectionStatus').textContent = `离线副本 · ${fullTime(cached.savedAt)}`; notice('当前显示此设备保存的日程，只能查看。网络恢复后自动同步。', 'error'); }
      else { $('#connectionStatus').textContent = '暂未同步 · 点击刷新重试'; $('#appContent').setAttribute('aria-busy', 'false'); throw error; }
    }
    finally { refreshing = false; $('#refreshApp').classList.remove('refreshing'); $('#refreshApp').disabled = false; }
  }
  function updateDraft() { const input = $('#appChatMessage'); input.style.height = 'auto'; input.style.height = `${Math.min(200, Math.max(76, input.scrollHeight))}px`; $('#messageCount').textContent = `${input.value.length} / 4000`; if (data) try { sessionStorage.setItem(`assistant-draft:${data.user.id}`, input.value); } catch {} }
  function openTask(id = null) {
    if (!data || !permitted('accessPlanner')) return;
    const item = id ? data.planner.find(row => row.id === id) : null; if (id && !item) return;
    editingTask = id; editingTaskVersion = item?.updatedAt || item?.createdAt; $('#taskDialogTitle').textContent = id ? '编辑日程' : '添加日程'; $('#appPlanTitle').value = item?.title || '';
    $('#appPlanDate').value = item ? (item.dueAt ? localInput(item.dueAt) : '') : selected === day(new Date()) ? localInput(Date.now() + 3600_000) : `${selected}T09:00`;
    $('#taskScheduled').checked = item?.scheduled !== false; $('#taskError').hidden = true; $('#taskDialog').showModal(); $('#appPlanTitle').focus();
  }
  function confirmDelete(title) { $('#confirmText').textContent = `“${title}”将从计划中移除，之后不会再发送提醒。`; $('#confirmDialog').showModal(); return new Promise(resolve => { confirmation = resolve; }); }
  $('#confirmAccept').onclick = () => { confirmation?.(true); confirmation = null; $('#confirmDialog').close(); };
  $('#confirmCancel').onclick = () => $('#confirmDialog').close();
  $('#confirmDialog').addEventListener('close', () => { confirmation?.(false); confirmation = null; });
  $('#taskForm').onsubmit = async event => {
    event.preventDefault(); const button = $('#saveTask'); button.disabled = true; $('#taskError').hidden = true;
    try { const due = $('#appPlanDate').value, payload = { ...(editingTask ? { ifUnmodifiedSince: editingTaskVersion } : {}), title: $('#appPlanTitle').value.trim(), dueAt: due ? new Date(`${due}:00+08:00`).toISOString() : null, scheduled: $('#taskScheduled').checked }; await api(editingTask ? `/api/workspace/planner/${editingTask}` : '/api/workspace/planner', { method: editingTask ? 'PATCH' : 'POST', body: JSON.stringify(payload) }); $('#taskDialog').close(); notice(editingTask ? '日程已更新，提醒时间同步调整。' : '日程已添加。'); await refresh().catch(error => notice(`已保存，但刷新失败：${error.message}`, 'error')); }
    catch (error) { $('#taskError').textContent = error.message; $('#taskError').hidden = false; }
    finally { button.disabled = false; }
  };
  document.addEventListener('click', action(async event => {
    const button = event.target.closest('button'); if (!button) return;
    if (button.hasAttribute('data-add-task')) openTask();
    if (button.dataset.closeDialog) $(`#${button.dataset.closeDialog}`).close();
    if (button.dataset.editTask) openTask(button.dataset.editTask);
    if (button.dataset.date) { selected = button.dataset.date; month = selected.slice(0, 7); renderCalendar(); }
    if (button.dataset.filter) { filter = button.dataset.filter; renderAgenda(); }
    if (button.dataset.pauseTask) { const item = data.planner.find(row => row.id === button.dataset.pauseTask); button.disabled = true; try { await api(`/api/workspace/planner/${item.id}`, { method: 'PATCH', body: JSON.stringify({ scheduled: item.scheduled === false, ifUnmodifiedSince: item.updatedAt || item.createdAt }) }); await refresh(); notice(item.scheduled === false ? '已恢复这项安排。' : '已暂停这项安排，不再发送提醒。'); } finally { button.disabled = false; } }
    if (button.dataset.deleteTask) { const item = data.planner.find(row => row.id === button.dataset.deleteTask); if (await confirmDelete(item.title)) { await api(`/api/workspace/planner/${item.id}`, { method: 'DELETE' }); await refresh(); notice('日程已删除。'); } }
    if (button.dataset.cancelQueue) { button.disabled = true; try { await api(`/api/workspace/assistant/queue/${button.dataset.cancelQueue}`, { method: 'DELETE' }); await refresh(); notice('已取消这条排队消息。'); } finally { button.disabled = false; } }
    if (button.dataset.copyMessage) { await navigator.clipboard.writeText(data.chats[Number(button.dataset.copyMessage)].content); notice('回复已复制。'); }
    if (button.dataset.cancelButler) { await api(`/api/admin/butler/actions/${button.dataset.cancelButler}/cancel`, { method: 'POST', body: '{}' }); await refresh(); notice('权限操作已取消。'); }
    if (button.dataset.confirmButler) {
      const proposal = butler.actions.find(item => item.id === button.dataset.confirmButler);
      if (!proposal || proposal.status !== 'pending') throw new Error('操作已过期，请重新提出请求');
      $('#butlerConfirmSummary').innerHTML = `<p>${esc(proposal.targetName)}</p><p>${esc(proposal.label || proposal.permission)}：<strong>${proposal.before ? '开放' : '关闭'} → ${proposal.value ? '开放' : '关闭'}</strong></p><p class="fine-print">服务器会再次核对当前权限；操作会写入审计记录。</p>`;
      const dialog = $('#butlerConfirm'); dialog.returnValue = ''; const accepted = new Promise(resolve => dialog.addEventListener('close', () => resolve(dialog.returnValue === 'accept'), { once: true })); dialog.showModal();
      if (await accepted) { await api(`/api/admin/butler/actions/${proposal.id}/confirm`, { method: 'POST', body: '{}' }); await refresh(); notice('权限变更已执行。'); }
    }
    if (button.dataset.prompt) { location.hash = 'assistant'; $('#appChatMessage').value = button.dataset.prompt; updateDraft(); $('#appChatMessage').focus(); }
  }, false));
  document.addEventListener('change', action(async event => {
    const input = event.target;
    if (input.dataset.taskToggle) { input.disabled = true; try { await api(`/api/workspace/planner/${input.dataset.taskToggle}`, { method: 'PATCH', body: JSON.stringify({ done: input.checked, ifUnmodifiedSince: data.planner.find(row => row.id === input.dataset.taskToggle)?.updatedAt || data.planner.find(row => row.id === input.dataset.taskToggle)?.createdAt }) }); await refresh(); notice(input.checked ? '已标记完成。' : '日程已重新打开。'); } catch (error) { input.checked = !input.checked; throw error; } finally { input.disabled = false; } }
  }, false));
  function openBrief() {
    if (!data) return;
    $('#briefDate').textContent = `${data.brief.day} 回顾 · ${data.brief.tomorrow} 安排`;
    $('#briefCompleted').innerHTML = data.brief.completed.length ? data.brief.completed.map(item => `<div class="brief-row"><span>${icon('check')}</span>${esc(item.title)}</div>`).join('') : '<p class="muted">今天还没有标记完成的事项。</p>';
    $('#briefTomorrow').innerHTML = data.brief.tomorrowItems.length ? data.brief.tomorrowItems.map(item => `<label class="brief-row"><input type="checkbox" data-brief-task="${item.id}" ${item.scheduled !== false ? 'checked' : ''} ${!permitted('accessPlanner') ? 'disabled' : ''}><span>${esc(item.title)}<small>${time(item.dueAt)}</small></span></label>`).join('') : '<p class="muted">明天暂无定时安排。可以让助手安排，也可以手动添加。</p>';
    $('#saveBrief').hidden = !permitted('accessPlanner');
    if (!$('#briefDialog').open) $('#briefDialog').showModal();
  }
  function maybeBrief() {
    const key = `brief-shown:${data.user.id}:${data.brief.day}`;
    let shown = false; try { shown = sessionStorage.getItem(key) === 'yes'; } catch {}
    if (!shown && !data.brief.seen && !document.querySelector('dialog[open]')) { try { sessionStorage.setItem(key, 'yes'); } catch {} openBrief(); }
  }
  $('#openBrief').onclick = openBrief;
  $('#briefCalendar').onclick = () => $('#briefDialog').close();
  $('#briefDialog').addEventListener('close', () => { if (data && !data.brief.seen) api('/api/workspace/brief/seen', { method: 'POST' }).then(() => { data.brief.seen = true; }).catch(error => notice(error.message, 'error')); });
  $('#saveBrief').onclick = action(async () => {
    const button = $('#saveBrief'); button.disabled = true;
    try { for (const input of $('#briefTomorrow').querySelectorAll('[data-brief-task]')) { const item = data.planner.find(row => row.id === input.dataset.briefTask); if (item && (item.scheduled !== false) !== input.checked) { await api(`/api/workspace/planner/${item.id}`, { method: 'PATCH', body: JSON.stringify({ scheduled: input.checked }) }); item.scheduled = input.checked; } } $('#briefDialog').close(); await refresh(); notice('明日安排已保存。'); }
    finally { button.disabled = false; }
  });
  $('#appChatForm').onsubmit = action(async () => {
    const input = $('#appChatMessage'), message = input.value.trim(); if (!message || busy) return;
    busy = true; pendingMessage = message; input.value = ''; updateDraft(); renderChat(true);
    try { const result = await api('/api/workspace/assistant', { method: 'POST', body: JSON.stringify({ message, sendMode: $('#appOffpeak').checked ? 'offpeak' : 'now' }) }); pendingMessage = ''; busy = false; await refresh(); if (result.queued) notice('已进入低峰发送队列，可在右侧查看或取消。'); }
    catch (error) { if (!input.value) { input.value = message; updateDraft(); } throw error; }
    finally { busy = false; pendingMessage = ''; renderChat(); }
  });
  $('#appChatMessage').addEventListener('input', updateDraft);
  $('#appChatMessage').addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); if (!$('#sendChat').disabled) $('#appChatForm').requestSubmit(); } });
  $('#taskSearch').oninput = renderAgenda;
  const changeMonth = offset => { const [year, number] = month.split('-').map(Number); month = new Date(Date.UTC(year, number - 1 + offset, 1)).toISOString().slice(0, 7); renderCalendar(); };
  $('#appPrevMonth').onclick = () => changeMonth(-1); $('#appNextMonth').onclick = () => changeMonth(1); $('#appToday').onclick = () => { selected = day(new Date()); month = selected.slice(0, 7); renderCalendar(); };
  $('#appButlerForm').onsubmit = action(async () => { const button = $('#appButlerForm button'); button.disabled = true; try { await api('/api/admin/butler', { method: 'POST', body: JSON.stringify({ message: $('#appButlerMessage').value.trim() }) }); $('#appButlerMessage').value = ''; await refresh(); $('#appButlerThread').scrollTop = $('#appButlerThread').scrollHeight; } finally { button.disabled = false; } });
  $('#appReview').onclick = action(async () => { const button = $('#appReview'); button.disabled = true; notice('AI 正在分析服务器报告，请稍候…'); try { await api('/api/admin/assistant/review', { method: 'POST' }); await refresh(); notice('AI 巡检已完成，可展开最近巡检结果和任务历史查看。'); } catch (error) { await refresh(); throw error; } finally { button.disabled = !admin?.configured || !admin?.settings.assistantEnabled; } });
  $('#refreshHealth').onclick = action(async () => { const button = $('#refreshHealth'); button.disabled = true; try { await api('/api/admin/health/run', { method: 'POST' }); await refresh(); notice('基础报告已刷新。'); } finally { button.disabled = false; } });
  $('#reviewScheduleForm').onsubmit = action(async () => { const button = $('#reviewScheduleForm button'); button.disabled = true; try { await api('/api/admin/assistant', { method: 'PATCH', body: JSON.stringify({ assistantReviewFrequency: $('#appReviewFrequency').value }) }); await refresh(); notice('自动巡检间隔已保存。'); } finally { button.disabled = false; } });
  $('#appearance').onchange = () => { storage.set('polynomial:appearance', $('#appearance').value); applyAppearance(); notice('外观偏好已保存到此设备。'); }; $('#compactLayout').onchange = () => { storage.set('polynomial:compact', $('#compactLayout').checked); applyAppearance(); };
  $('#offlineCalendar').onchange = () => { window.PolynomialCalendarCache?.setEnabled($('#offlineCalendar').checked); if ($('#offlineCalendar').checked && data && !offline) window.PolynomialCalendarCache.save(data); notice($('#offlineCalendar').checked ? '此设备会保存日程供离线查看。' : '此设备的离线日程已清除。'); };
  $('#appLogout').onclick = action(async () => { await window.PolynomialReminderUI?.logout().catch(() => {}); if (data) try { sessionStorage.removeItem(`assistant-draft:${data.user.id}`); } catch {} window.PolynomialCalendarCache?.clear(); offline = false; await api('/api/logout', { method: 'POST' }); location.href = '/login.html?next=%2Fapp.html'; });
  function renderCommands() {
    const query = $('#commandQuery').value.trim().toLowerCase();
    const pages = Object.entries(pageNames).filter(([name]) => name !== 'control' || data?.user.role === 'admin').map(([name, title]) => [null, name === 'assistant' ? 'spark' : name === 'control' ? 'shield' : name === 'account' ? 'user' : name, title, '应用页面', `#${name}`]);
    const unique = [...new Map([...pages, ...tools()].map(entry => [entry[4], entry])).values()].filter(entry => `${entry[2]} ${entry[3]}`.toLowerCase().includes(query));
    const taskResults = (data?.planner || []).filter(item => !item.done && (!query || item.title.toLowerCase().includes(query))).slice(0, 8);
    $('#commandResults').innerHTML = unique.map(([, symbol, title, description, href]) => `<a class="command-result" href="${href}"><span data-icon="${symbol}">${icon(symbol)}</span><span>${title}<small>${description}</small></span><span class="result-arrow">↗</span></a>`).join('') + taskResults.map(item => `<button class="command-result" type="button" data-command-task="${item.id}"><span data-icon="calendar">${icon('calendar')}</span><span>${esc(item.title)}<small>${item.dueAt ? time(item.dueAt) : '未设置时间'}</small></span><span class="result-arrow">↗</span></button>`).join('');
    if (!unique.length && !taskResults.length) $('#commandResults').innerHTML = empty('search', '没有找到结果', '试试更短的关键词。');
  }
  $('#openCommand').onclick = () => { $('#commandQuery').value = ''; renderCommands(); $('#commandDialog').showModal(); $('#commandQuery').focus(); };
  $('#commandQuery').oninput = renderCommands;
  $('#commandResults').onclick = event => { const result = event.target.closest('.command-result'); if (!result) return; $('#commandDialog').close(); if (result.dataset.commandTask) openTask(result.dataset.commandTask); };
  document.addEventListener('keydown', event => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); if ($('#commandDialog').open) $('#commandDialog').close(); else $('#openCommand').click(); }
    if ($('#commandDialog').open && ['ArrowDown', 'ArrowUp'].includes(event.key)) { const results = [...$('#commandResults').querySelectorAll('.command-result')]; if (results.length) { event.preventDefault(); const current = results.indexOf(document.activeElement); results[(current + (event.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length].focus(); } }
  });
  $('.skip-link').onclick = event => { event.preventDefault(); $('#appContent').focus(); };
  $('#refreshApp').onclick = action(async () => { await refresh(); notice('数据已同步。'); }); $('#accountButton').onclick = () => { location.hash = 'account'; };
  window.addEventListener('hashchange', () => route()); window.addEventListener('offline', () => { const cached = window.PolynomialCalendarCache?.load(); if (cached) { data = cached; admin = null; butler = null; offline = true; render(); $('#connectionStatus').textContent = `离线副本 · ${fullTime(cached.savedAt)}`; } else { offline = true; document.body.classList.add('offline-mode'); $('#connectionStatus').textContent = '已离线'; } notice('网络已断开，日程暂为只读；恢复后自动同步。', 'error'); }); window.addEventListener('online', action(refresh));
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyAppearance);
  updateTime(); route(false); setInterval(updateTime, 60000); setInterval(() => { if (!document.hidden && !busy && !$('#taskDialog').open) refresh().catch(error => notice(error.message, 'error')); }, 60000);
  refresh().catch(error => notice(error.message, 'error'));
  async function checkClientUpdate() {
    try {
      const release = await api('/api/client/releases'), info = navigator.userAgent.match(/PolynomialClient\/([\w.-]+) \((\w+); ([\w-]+)\)/);
      $('#clientVersion').textContent = info ? `已安装客户端 v${info[1]} · ${info[2]} / ${info[3]}。当前界面 v${release.uiVersion}，联网自动更新。` : `网页 / 主屏幕界面 v${release.uiVersion}，联网自动更新。`;
      $('#checkClientUpdate').href = '/download.html' + (info ? `?installed=${encodeURIComponent(info[1])}&platform=${encodeURIComponent(info[2])}&arch=${encodeURIComponent(info[3])}` : '');
      if (info) {
        const result = await api(`/api/client/update?${new URLSearchParams({ installed: info[1], platform: info[2], arch: info[3] })}`);
        $('#clientUpdateStatus').dataset.state = result.required ? 'required' : result.updateAvailable ? 'available' : 'current';
        $('#clientUpdateStatus').textContent = result.required ? `当前安装版本已低于兼容要求或停止分发，请升级至推荐版本 v${result.recommendedVersion || '待发布'}。` : result.updateAvailable ? `有新版本 v${result.recommendedVersion} 可安装。` : '已使用当前推荐版本。';
        $('#clientUpdateDetails').hidden = !result.notes; $('#clientUpdateNotes').textContent = result.notes;
      } else $('#clientUpdateStatus').textContent = '联网界面自动更新，原生安装包更新在下载中心提供。';
    } catch { $('#clientUpdateStatus').textContent = '版本检查暂未成功，恢复连接后重试。'; }
  }
  checkClientUpdate(); setInterval(checkClientUpdate, 6 * 3600000);
})();
