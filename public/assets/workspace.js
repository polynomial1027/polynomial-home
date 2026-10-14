(() => {
  const $ = selector => document.querySelector(selector);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  let snapshot, adminSnapshot, butlerSnapshot, selectedQuotaUser;
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
    const isAdmin = snapshot.user.role === 'admin';
    $('#pricingWindow').hidden = !isAdmin;
    $('#assistantUsage').hidden = !isAdmin;
    const pricing = ai.pricing, rates = pricing.rates, next = pricing.nextOffPeakAt ? dateText(pricing.nextOffPeakAt) : '';
    $('#pricingWindow').classList.toggle('peak', pricing.peak);
    $('#pricingWindow').querySelector('strong').textContent = pricing.peak ? `现在是高峰时段 · ${next} 转为空闲价` : '现在是空闲时段 · 价格为高峰的一半';
    if (isAdmin) $('#pricingDetails').innerHTML = `${rates ? `${escape(pricing.model)}：输入缓存命中 ¥${rates.cachedInput[pricing.peak ? 1 : 0]}、未命中 ¥${rates.input[pricing.peak ? 1 : 0]}、输出 ¥${rates.output[pricing.peak ? 1 : 0]} / 百万 token。` : `${escape(pricing.model)}：未找到官方报价，请以官方页面为准。`}${!pricing.holidayCalendarCurrent ? ' 节假日表待更新，工作日按高峰保守估计。' : ''} 报价核对于 ${escape(pricing.checkedAt)}；实时价格以官方为准。 <a href="https://api-docs.deepseek.com/zh-cn/quick_start/pricing/" target="_blank" rel="noopener noreferrer">查看官方价格 ↗</a>`;
    $('#sendModeLabel').hidden = !pricing.peak;
    $('#assistantForm button').textContent = pricing.peak && $('#sendOffPeak').checked ? '低谷发送 ↗' : '发送 ↗';
    const u = ai.usage || {}, l = ai.limits?.user || {};
    if (isAdmin) $('#assistantUsage').innerHTML = `<span>今日 token <strong>${format(u.dailyTokens)} / ${format(l.dailyTokens)}</strong></span><span>本月 token <strong>${format(u.monthlyTokens)} / ${format(l.monthlyTokens)}</strong></span><span>今日调用 <strong>${format(u.dailyRequests)} / ${format(l.dailyRequests)}</strong></span>`;
    $('#assistantThread').innerHTML = snapshot.chats.length ? snapshot.chats.map(item => `<div class="assistant-message ${item.role === 'user' ? 'user' : ''}"><small>${item.role === 'user' ? '你' : '助手'}</small>${item.role === 'user' ? escape(item.content) : window.renderAssistantMath(item.content)}</div>`).join('') : '<div class="empty-state">还没有对话。可提问或让助手安排日程。</div>';
    $('#assistantThread').scrollTop = $('#assistantThread').scrollHeight;
    const queue = ai.queue.filter(item => item.status === 'pending' || item.status === 'running' || item.status === 'failed').slice(-10).reverse();
    $('#assistantQueue').innerHTML = queue.map(item => `<div class="queue-item"><div><strong>${item.status === 'pending' ? '等待空闲时段' : item.status === 'running' ? '正在发送' : '发送失败'} · ${dateText(item.createdAt)}</strong>${escape(item.message || item.error || '')}</div>${item.status === 'pending' ? `<button type="button" data-cancel-queue="${item.id}" aria-label="取消排队消息">取消</button>` : ''}</div>`).join('');
    $('#assistantQueue').querySelectorAll('[data-cancel-queue]').forEach(button => button.onclick = async () => { try { await request(`/api/workspace/assistant/queue/${button.dataset.cancelQueue}`, { method: 'DELETE' }); await refresh(); } catch (error) { alert(error.message); } });
  }

  function renderPlanner() {
    const items = snapshot.planner, due = items.filter(item => !item.done && item.dueAt && new Date(item.dueAt) <= new Date());
    $('#plannerCount').textContent = `${items.filter(item => !item.done).length} 项待办${due.length ? ` · ${due.length} 项到期` : ''}`;
    $('#plannerList').innerHTML = items.length ? items.map(item => `<div class="planner-item ${item.done ? 'done' : item.dueAt && new Date(item.dueAt) <= new Date() ? 'due' : ''}"><label class="planner-item-main"><input type="checkbox" data-toggle="${item.id}" ${item.done ? 'checked' : ''}><span>${escape(item.title)}${item.dueAt ? `<small>${dateText(item.dueAt)}${!item.done && new Date(item.dueAt) <= new Date() ? ' · 已到期' : ''}${item.scheduled === false ? ' · 明日安排已暂停' : ''}${item.source === 'assistant' ? ' · AI 安排' : ''}</small>` : ''}</span></label><button type="button" data-delete="${item.id}" aria-label="删除事项">×</button></div>`).join('') : '<div class="empty-state">还没有待办，添加第一件事吧。</div>';
    $('#plannerList').querySelectorAll('[data-toggle]').forEach(input => input.onchange = async () => { await request(`/api/workspace/planner/${input.dataset.toggle}`, { method: 'PATCH', body: JSON.stringify({ done: input.checked }) }); await refresh(); });
    $('#plannerList').querySelectorAll('[data-delete]').forEach(button => button.onclick = async () => { await request(`/api/workspace/planner/${button.dataset.delete}`, { method: 'DELETE' }); await refresh(); });
  }

  function renderButler() {
    if (!butlerSnapshot) return;
    const labels = { accessAssistant: 'AI 助手', accessChat: '聊天', driveEnabled: '网盘', accessLearning: '学习', accessPlanner: '计划' };
    const actions = new Map(butlerSnapshot.actions.map(action => [action.id, action]));
    $('#butlerThread').innerHTML = butlerSnapshot.chats.length ? butlerSnapshot.chats.map(entry => `<div class="butler-message user"><small>你</small>${escape(entry.message)}</div><div class="butler-message"><small>服务器管家</small>${escape(entry.reply)}${entry.link?.startsWith('/admin.html') ? `<a href="${escape(entry.link)}">打开账号管理 ↗</a>` : ''}${actions.has(entry.actionId) ? `<div class="butler-action"><strong>${escape(actions.get(entry.actionId).targetName)} · ${escape(labels[actions.get(entry.actionId).permission] || '权限')} → ${actions.get(entry.actionId).value ? '开放' : '关闭'}</strong>${actions.get(entry.actionId).status === 'pending' ? `<button type="button" data-confirm-butler="${entry.actionId}">确认执行此变更</button>` : `<small>${actions.get(entry.actionId).status === 'confirmed' ? '已确认执行' : '操作已过期，请重新提出请求'}</small>`}</div>` : ''}</div>`).join('') : '<div class="empty-state">可以问：“现在有几个人在线？”或“@某账号上次什么时候登录？”</div>';
    $('#butlerThread').scrollTop = $('#butlerThread').scrollHeight;
    $('#butlerThread').querySelectorAll('[data-confirm-butler]').forEach(button => button.onclick = async () => {
      button.disabled = true;
      try { await request(`/api/admin/butler/actions/${button.dataset.confirmButler}/confirm`, { method: 'POST' }); notice('#butlerNotice', '权限已更新并写入操作记录。'); await refreshButler(); await refreshAdmin(); }
      catch (error) { notice('#butlerNotice', error.message); button.disabled = false; }
    });
  }

  async function refreshButler() { butlerSnapshot = await request('/api/admin/butler'); renderButler(); }

  function renderAdmin() {
    if (!adminSnapshot) return;
    $('#adminWorkspace').hidden = false;
    $('#adminShortcut').hidden = false;
    const { settings, configured, model, pricing, queuedCount, globalUsage, users, reports, reviews = [], reviewRunning = false } = adminSnapshot;
    $('#providerState').textContent = `${configured ? 'API 密钥已配置' : 'API 密钥未配置'} · 模型 ${model} · ${pricing.label} · 待发送 ${queuedCount} 条 · 今日全站 ${format(globalUsage.dailyTokens)} token / ${format(globalUsage.dailyRequests)} 次；本月 ${format(globalUsage.monthlyTokens)} token / ${format(globalUsage.monthlyRequests)} 次。`;
    for (const [key, value] of Object.entries(settings)) { const field = $('#assistantSettingsForm').elements.namedItem(key); if (field) field.value = String(value); }
    selectedQuotaUser = users.some(user => user.id === selectedQuotaUser) ? selectedQuotaUser : users[0]?.id;
    $('#assistantUsers').innerHTML = `<label>选择用户<select id="quotaUserSelect">${users.map(user => `<option value="${user.id}" ${user.id === selectedQuotaUser ? 'selected' : ''}>${escape(user.displayName)} · @${escape(user.username)}</option>`).join('')}</select></label>` + users.filter(user => user.id === selectedQuotaUser).map(user => `<div class="user-limit-row" data-user="${user.id}"><header><div><strong>${escape(user.displayName)}</strong><small>@${escape(user.username)} · 今日 ${format(user.usage.dailyTokens)} token / ${format(user.usage.dailyRequests)} 次</small></div></header><div class="user-limit-grid"><label>AI 权限<select name="allowed" ${user.role === 'admin' ? 'disabled' : ''}><option value="true" ${user.allowed ? 'selected' : ''}>开放</option><option value="false" ${!user.allowed ? 'selected' : ''}>关闭</option></select></label>${[['dailyTokens','每日 token'],['monthlyTokens','每月 token'],['dailyRequests','每日次数'],['monthlyRequests','每月次数']].map(([key,label]) => `<label>${label}<input name="${key}" type="number" min="0" placeholder="继承默认 ${format(user.limits[key])}" value="${user.overrides[key] ?? ''}"></label>`).join('')}</div><button type="button" data-save-user="${user.id}">保存此用户额度</button></div>`).join('');
    $('#quotaUserSelect').onchange = event => { selectedQuotaUser = event.target.value; renderAdmin(); };
    $('#assistantUsers').querySelectorAll('[data-save-user]').forEach(button => button.onclick = async () => {
      const row = button.closest('[data-user]'); const limits = {};
      for (const key of ['dailyTokens','monthlyTokens','dailyRequests','monthlyRequests']) limits[key] = row.querySelector(`[name="${key}"]`).value === '' ? null : Number(row.querySelector(`[name="${key}"]`).value);
      try { await request(`/api/admin/assistant/users/${button.dataset.saveUser}`, { method: 'PATCH', body: JSON.stringify({ allowed: row.querySelector('[name="allowed"]').value === 'true', limits }) }); button.textContent = '已保存'; await refreshAdmin(); } catch (error) { alert(error.message); }
    });
    $('#healthReports').innerHTML = reports.length ? reports.map(report => `<div class="health-report ${report.severity}"><strong>${escape(report.day)} · ${report.severity === 'warning' ? '需要关注' : report.systemLogin?.status === 'unavailable' ? '部分可见' : '正常'}</strong><small>统计区间：${escape(new Date(report.windowStart || new Date(report.createdAt).getTime() - 86400000).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }))} 至 ${escape(new Date(report.windowEnd || report.createdAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }))}（北京时间）</small><small>站内登录：成功 ${report.loginSuccess} 次 / 失败 ${report.loginFailed} 次 · SSH：${report.systemLogin?.status === 'available' ? `成功 ${report.systemLogin.accepted} 次 / 失败 ${report.systemLogin.failed} 次` : '日志不可见或无记录'} · 空闲内存 ${report.memory.freeMB} / ${report.memory.totalMB} MB · 数据盘 ${report.disk ? `${report.disk.freeGB} / ${report.disk.totalGB} GB` : '不可见'} · 系统负载 ${report.loadAverage.join(' / ')}</small><small>${escape(report.notes)}${report.suspicious.length ? ` 高失败来源：${report.suspicious.map(item => `${escape(item.address)} (${item.count})`).join('、')}` : ''}</small></div>`).join('') : '<div class="empty-state">暂无巡检报告。</div>';
    $('#runAiReview').disabled = !configured || !settings.assistantEnabled || reviewRunning;
    $('#butlerReviewNow').disabled = !configured || !settings.assistantEnabled || reviewRunning;
    $('#runAiReview').textContent = pricing.peak ? '立即巡检 · 高峰价 ↗' : '运行 AI 巡检 ↗';
    $('#runAiReview').title = !configured ? '先在服务器配置 DeepSeek API Key' : !settings.assistantEnabled ? '先保存并开启全站 AI' : '';
    $('#aiReviews').innerHTML = reviews.length ? reviews.map(review => `<article class="ai-review ${escape(review.risk || '')}"><header><strong>${escape(review.day)} · ${review.source === 'auto' ? '自动巡检' : '手动巡检'} · ${review.status === 'completed' ? '已完成' : review.status === 'running' ? '运行中' : '失败'}</strong><small>${dateText(review.createdAt)}</small></header><small>统计区间：${escape(new Date(review.windowStart || new Date(review.createdAt).getTime() - 86400000).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }))} 至 ${escape(new Date(review.windowEnd || review.createdAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }))}（北京时间）</small><p>${escape(review.summary || review.error || '正在分析服务器汇总指标…')}</p>${review.proposedActions?.length ? `<small class="action-line">AI 建议：清除已过期的登录会话</small>` : ''}${review.executedActions?.length ? `<small class="action-line">已执行安全清理：移除 ${review.executedActions[0].removed} 个过期会话</small>` : review.proposedActions?.length ? '<small class="action-line">尚未执行；可由管理员开启安全清理后再次试运行</small>' : ''}</article>`).join('') : '<div class="empty-state">还没有 AI 巡检记录。配置密钥并开启 AI 后可手动试运行。</div>';
  }

  async function refresh() { snapshot = await request('/api/workspace'); if (window.PolynomialReminders) window.PolynomialReminders.sync(JSON.stringify({ userId: snapshot.user.id, items: snapshot.planner.filter(item => item.dueAt && !item.done && item.scheduled !== false && new Date(item.dueAt) > new Date()).map(({ id, title, dueAt }) => ({ id, title, dueAt })) })); renderAssistant(); renderPlanner(); window.DailyWorkspace.render(snapshot); }
  window.addEventListener('workspace:refresh', () => refresh().catch(console.error));
  async function refreshAdmin() { adminSnapshot = await request('/api/admin/assistant'); renderAdmin(); }
  async function init() {
    const account = await request('/api/me');
    if (!account.user) { location.href = '/login.html?next=%2Fworkspace.html'; return; }
    $('#workspaceName').textContent = account.user.displayName;
    const updateTime = () => {
      const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Shanghai', hour: '2-digit', hourCycle: 'h23' }).format(new Date()));
      const [theme, greeting] = hour < 5 ? ['dawn', '凌晨好'] : hour < 11 ? ['morning', '早上好'] : hour < 14 ? ['noon', '中午好'] : hour < 18 ? ['afternoon', '下午好'] : ['evening', '晚上好'];
      document.body.dataset.timeTheme = theme;
      $('#workspaceGreeting').textContent = greeting;
      $('#workspaceDate').textContent = new Date().toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    };
    updateTime(); setInterval(updateTime, 60_000);
    await refresh(); if (account.user.role === 'admin') { await refreshAdmin(); await refreshButler(); }
    $('#plannerForm').onsubmit = async event => { event.preventDefault(); try { await request('/api/workspace/planner', { method: 'POST', body: JSON.stringify({ title: $('#plannerTitle').value, dueAt: $('#plannerDue').value || null }) }); event.target.reset(); await refresh(); } catch (error) { alert(error.message); } };
    $('#sendOffPeak').onchange = () => { $('#assistantForm button').textContent = snapshot.assistant.pricing.peak && $('#sendOffPeak').checked ? '低谷发送 ↗' : '发送 ↗'; };
    $('#assistantForm').onsubmit = async event => { event.preventDefault(); const message = $('#assistantMessage').value.trim(); if (!message) return; const button = $('#assistantForm button'); button.disabled = true; button.textContent = '处理中…'; try { await request('/api/workspace/assistant', { method: 'POST', body: JSON.stringify({ message, sendMode: $('#sendOffPeak').checked ? 'offpeak' : 'now' }) }); $('#assistantMessage').value = ''; await refresh(); if (adminSnapshot) await refreshAdmin(); } catch (error) { alert(error.message); } finally { button.disabled = !(snapshot.assistant.allowed && snapshot.assistant.enabled && snapshot.assistant.configured); button.textContent = snapshot.assistant.pricing.peak && $('#sendOffPeak').checked ? '低谷发送 ↗' : '发送 ↗'; } };
    $('#assistantSettingsForm').onsubmit = async event => { event.preventDefault(); const data = Object.fromEntries(new FormData(event.target)); for (const key of Object.keys(data)) data[key] = key === 'assistantReviewFrequency' ? data[key] : ['assistantEnabled','assistantAutoMaintenance'].includes(key) ? data[key] === 'true' : Number(data[key]); try { await request('/api/admin/assistant', { method: 'PATCH', body: JSON.stringify(data) }); notice('#settingsNotice', '全站设置已保存'); await refreshAdmin(); await refresh(); } catch (error) { notice('#settingsNotice', error.message); } };
    $('#butlerForm').onsubmit = async event => { event.preventDefault(); const message = $('#butlerMessage').value.trim(); if (!message) return; const button = $('#butlerForm button'); button.disabled = true; notice('#butlerNotice', '正在查询…'); try { await request('/api/admin/butler', { method: 'POST', body: JSON.stringify({ message }) }); $('#butlerMessage').value = ''; notice('#butlerNotice', ''); await refreshButler(); await refreshAdmin(); } catch (error) { notice('#butlerNotice', error.message); } finally { button.disabled = false; } };
    $('#butlerReviewNow').onclick = () => { $('#runAiReview').click(); $('#reviewNotice').scrollIntoView({ behavior: 'smooth', block: 'center' }); };
    $('#runHealth').onclick = async () => { try { await request('/api/admin/health/run', { method: 'POST' }); await refreshAdmin(); } catch (error) { alert(error.message); } };
    $('#runAiReview').onclick = async () => { const button = $('#runAiReview'); button.disabled = true; notice('#reviewNotice', 'AI 正在分析今日巡检汇总…'); try { await request('/api/admin/assistant/review', { method: 'POST' }); notice('#reviewNotice', 'AI 巡检已完成，记录显示在下方。'); await refreshAdmin(); await refresh(); } catch (error) { notice('#reviewNotice', error.message); await refreshAdmin(); } finally { button.disabled = !adminSnapshot?.configured || !adminSnapshot?.settings.assistantEnabled; } };
    setInterval(() => { if (!document.hidden) refresh().catch(console.error); }, 60_000);
  }
  init().catch(error => { $('#workspace').insertAdjacentHTML('afterbegin', `<p role="alert">${escape(error.message)}</p>`); });
})();
