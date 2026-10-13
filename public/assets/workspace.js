(() => {
  const $ = selector => document.querySelector(selector);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  let snapshot, adminSnapshot;
  const format = value => Number(value || 0).toLocaleString('zh-CN');
  const dateText = value => new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const notice = (selector, message) => { $(selector).textContent = message; };

  function renderAssistant() {
    const ai = snapshot.assistant, ready = ai.allowed && ai.enabled && ai.configured;
    $('#assistantStatus').textContent = !ai.configured ? '等待 API 密钥' : !ai.enabled ? '全站已关闭' : !ai.allowed ? '未获授权' : '可使用';
    $('#assistantStatus').classList.toggle('off', !ready);
    $('#assistantDescription').textContent = ready ? '向助手提问、整理想法和制定计划。当前仅提供对话。' : !ai.configured ? '管理员尚未配置 DeepSeek API 密钥；界面与额度功能已经就绪。' : !ai.enabled ? '管理员暂未开放 AI 对话。' : '管理员尚未给你的账号开放 AI 对话。';
    $('#assistantForm button').disabled = !ready;
    $('#assistantMessage').disabled = !ready;
    const u = ai.usage, l = ai.limits.user;
    $('#assistantUsage').innerHTML = `<span>今日 token <strong>${format(u.dailyTokens)} / ${format(l.dailyTokens)}</strong></span><span>本月 token <strong>${format(u.monthlyTokens)} / ${format(l.monthlyTokens)}</strong></span><span>今日调用 <strong>${format(u.dailyRequests)} / ${format(l.dailyRequests)}</strong></span>`;
    $('#assistantThread').innerHTML = snapshot.chats.length ? snapshot.chats.map(item => `<div class="assistant-message ${item.role === 'user' ? 'user' : ''}"><small>${item.role === 'user' ? '你' : '助手'}</small>${escape(item.content)}</div>`).join('') : '<div class="empty-state">还没有对话。等 API 接入后，可以在这里开始。</div>';
    $('#assistantThread').scrollTop = $('#assistantThread').scrollHeight;
  }

  function renderPlanner() {
    const items = snapshot.planner, due = items.filter(item => !item.done && item.dueAt && new Date(item.dueAt) <= new Date());
    $('#plannerCount').textContent = `${items.filter(item => !item.done).length} 项待办${due.length ? ` · ${due.length} 项到期` : ''}`;
    $('#plannerList').innerHTML = items.length ? items.map(item => `<div class="planner-item ${item.done ? 'done' : item.dueAt && new Date(item.dueAt) <= new Date() ? 'due' : ''}"><label class="planner-item-main"><input type="checkbox" data-toggle="${item.id}" ${item.done ? 'checked' : ''}><span>${escape(item.title)}${item.dueAt ? `<small>${dateText(item.dueAt)}${!item.done && new Date(item.dueAt) <= new Date() ? ' · 已到期' : ''}</small>` : ''}</span></label><button type="button" data-delete="${item.id}" aria-label="删除事项">×</button></div>`).join('') : '<div class="empty-state">还没有待办，添加第一件事吧。</div>';
    $('#plannerList').querySelectorAll('[data-toggle]').forEach(input => input.onchange = async () => { await request(`/api/workspace/planner/${input.dataset.toggle}`, { method: 'PATCH', body: JSON.stringify({ done: input.checked }) }); await refresh(); });
    $('#plannerList').querySelectorAll('[data-delete]').forEach(button => button.onclick = async () => { await request(`/api/workspace/planner/${button.dataset.delete}`, { method: 'DELETE' }); await refresh(); });
  }

  function renderAdmin() {
    if (!adminSnapshot) return;
    $('#adminWorkspace').hidden = false;
    $('#adminShortcut').hidden = false;
    const { settings, configured, model, globalUsage, users, reports, reviews = [], reviewRunning = false } = adminSnapshot;
    $('#providerState').textContent = `${configured ? 'API 密钥已配置' : 'API 密钥未配置'} · 模型 ${model} · 今日全站 ${format(globalUsage.dailyTokens)} token / ${format(globalUsage.dailyRequests)} 次；本月 ${format(globalUsage.monthlyTokens)} token / ${format(globalUsage.monthlyRequests)} 次。`;
    for (const [key, value] of Object.entries(settings)) { const field = $('#assistantSettingsForm').elements.namedItem(key); if (field) field.value = String(value); }
    $('#assistantUsers').innerHTML = users.map(user => `<div class="user-limit-row" data-user="${user.id}"><header><div><strong>${escape(user.displayName)}</strong><small>@${escape(user.username)} · 今日 ${format(user.usage.dailyTokens)} token / ${format(user.usage.dailyRequests)} 次</small></div></header><div class="user-limit-grid"><label>AI 权限<select name="allowed" ${user.role === 'admin' ? 'disabled' : ''}><option value="true" ${user.allowed ? 'selected' : ''}>开放</option><option value="false" ${!user.allowed ? 'selected' : ''}>关闭</option></select></label>${[['dailyTokens','每日 token'],['monthlyTokens','每月 token'],['dailyRequests','每日次数'],['monthlyRequests','每月次数']].map(([key,label]) => `<label>${label}<input name="${key}" type="number" min="0" placeholder="继承默认 ${format(user.limits[key])}" value="${user.overrides[key] ?? ''}"></label>`).join('')}</div><button type="button" data-save-user="${user.id}">保存此用户额度</button></div>`).join('');
    $('#assistantUsers').querySelectorAll('[data-save-user]').forEach(button => button.onclick = async () => {
      const row = button.closest('[data-user]'); const limits = {};
      for (const key of ['dailyTokens','monthlyTokens','dailyRequests','monthlyRequests']) limits[key] = row.querySelector(`[name="${key}"]`).value === '' ? null : Number(row.querySelector(`[name="${key}"]`).value);
      try { await request(`/api/admin/assistant/users/${button.dataset.saveUser}`, { method: 'PATCH', body: JSON.stringify({ allowed: row.querySelector('[name="allowed"]').value === 'true', limits }) }); button.textContent = '已保存'; await refreshAdmin(); } catch (error) { alert(error.message); }
    });
    $('#healthReports').innerHTML = reports.length ? reports.map(report => `<div class="health-report ${report.severity}"><strong>${escape(report.day)} · ${report.severity === 'warning' ? '需要关注' : report.systemLogin?.status === 'unavailable' ? '部分可见' : '正常'}</strong><small>站内登录：成功 ${report.loginSuccess} 次 / 失败 ${report.loginFailed} 次 · SSH：${report.systemLogin?.status === 'available' ? `成功 ${report.systemLogin.accepted} 次 / 失败 ${report.systemLogin.failed} 次` : '日志不可见或无记录'} · 空闲内存 ${report.memory.freeMB} / ${report.memory.totalMB} MB · 数据盘 ${report.disk ? `${report.disk.freeGB} / ${report.disk.totalGB} GB` : '不可见'} · 系统负载 ${report.loadAverage.join(' / ')}</small><small>${escape(report.notes)}${report.suspicious.length ? ` 高失败来源：${report.suspicious.map(item => `${escape(item.address)} (${item.count})`).join('、')}` : ''}</small></div>`).join('') : '<div class="empty-state">暂无巡检报告。</div>';
    $('#runAiReview').disabled = !configured || !settings.assistantEnabled || reviewRunning;
    $('#runAiReview').title = !configured ? '先在服务器配置 DeepSeek API Key' : !settings.assistantEnabled ? '先保存并开启全站 AI' : '';
    $('#aiReviews').innerHTML = reviews.length ? reviews.map(review => `<article class="ai-review ${escape(review.risk || '')}"><header><strong>${escape(review.day)} · ${review.source === 'auto' ? '自动巡检' : '手动巡检'} · ${review.status === 'completed' ? '已完成' : review.status === 'running' ? '运行中' : '失败'}</strong><small>${dateText(review.createdAt)}</small></header><p>${escape(review.summary || review.error || '正在分析服务器汇总指标…')}</p>${review.proposedActions?.length ? `<small class="action-line">AI 建议：清除已过期的登录会话</small>` : ''}${review.executedActions?.length ? `<small class="action-line">已执行安全清理：移除 ${review.executedActions[0].removed} 个过期会话</small>` : review.proposedActions?.length ? '<small class="action-line">尚未执行；可由管理员开启安全清理后再次试运行</small>' : ''}</article>`).join('') : '<div class="empty-state">还没有 AI 巡检记录。配置密钥并开启 AI 后可手动试运行。</div>';
  }

  async function refresh() { snapshot = await request('/api/workspace'); renderAssistant(); renderPlanner(); }
  async function refreshAdmin() { adminSnapshot = await request('/api/admin/assistant'); renderAdmin(); }
  async function init() {
    const account = await request('/api/me');
    if (!account.user) { location.href = '/login.html?next=%2Fworkspace.html'; return; }
    $('#workspaceName').textContent = account.user.displayName;
    const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Shanghai', hour: '2-digit', hourCycle: 'h23' }).format(new Date()));
    $('#workspaceGreeting').textContent = hour < 11 ? '早上好' : hour < 18 ? '下午好' : '晚上好';
    $('#workspaceDate').textContent = new Date().toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    await refresh(); if (account.user.role === 'admin') await refreshAdmin();
    $('#plannerForm').onsubmit = async event => { event.preventDefault(); try { await request('/api/workspace/planner', { method: 'POST', body: JSON.stringify({ title: $('#plannerTitle').value, dueAt: $('#plannerDue').value || null }) }); event.target.reset(); await refresh(); } catch (error) { alert(error.message); } };
    $('#assistantForm').onsubmit = async event => { event.preventDefault(); const message = $('#assistantMessage').value.trim(); if (!message) return; const button = $('#assistantForm button'); button.disabled = true; button.textContent = '思考中…'; try { await request('/api/workspace/assistant', { method: 'POST', body: JSON.stringify({ message }) }); $('#assistantMessage').value = ''; await refresh(); if (adminSnapshot) await refreshAdmin(); } catch (error) { alert(error.message); } finally { button.textContent = '发送 ↗'; button.disabled = false; } };
    $('#assistantSettingsForm').onsubmit = async event => { event.preventDefault(); const data = Object.fromEntries(new FormData(event.target)); for (const key of Object.keys(data)) data[key] = ['assistantEnabled','assistantAutoReview','assistantAutoMaintenance'].includes(key) ? data[key] === 'true' : Number(data[key]); try { await request('/api/admin/assistant', { method: 'PATCH', body: JSON.stringify(data) }); notice('#settingsNotice', '全站设置已保存'); await refreshAdmin(); await refresh(); } catch (error) { notice('#settingsNotice', error.message); } };
    $('#runHealth').onclick = async () => { try { await request('/api/admin/health/run', { method: 'POST' }); await refreshAdmin(); } catch (error) { alert(error.message); } };
    $('#runAiReview').onclick = async () => { const button = $('#runAiReview'); button.disabled = true; notice('#reviewNotice', 'AI 正在分析今日巡检汇总…'); try { await request('/api/admin/assistant/review', { method: 'POST' }); notice('#reviewNotice', 'AI 巡检已完成，记录显示在下方。'); await refreshAdmin(); await refresh(); } catch (error) { notice('#reviewNotice', error.message); await refreshAdmin(); } finally { button.disabled = !adminSnapshot?.configured || !adminSnapshot?.settings.assistantEnabled; } };
    setInterval(() => { if (!document.hidden) refresh().catch(console.error); }, 60_000);
  }
  init().catch(error => { $('#workspace').insertAdjacentHTML('afterbegin', `<p role="alert">${escape(error.message)}</p>`); });
})();
