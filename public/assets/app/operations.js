(() => {
  const $ = selector => document.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const time = value => value ? new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hourCycle: 'h23' }) : '暂无';
  const states = { idle: '等待执行', running: '正在执行', completed: '已完成', failed: '执行失败', retrying: '等待重试', interrupted: '中断 · 待核对', skipped: '已跳过本次' };
  let currentUser, snapshot, operations, loading = false, lastRefresh = 0;
  async function api(url, method = 'GET', body) {
    const response = await fetch(url, { method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const result = await response.json(); if (!response.ok) throw new Error(result.error || '操作失败'); return result;
  }
  function note(message, error = false) { $('#operationsNotice').textContent = message; $('#operationsNotice').classList.toggle('form-error', error); }
  async function confirm(text, label = '确认执行') {
    const dialog = $('#operationConfirm'); $('#operationConfirmText').textContent = text; $('#operationConfirmAccept').textContent = label;
    return new Promise(resolve => { dialog.returnValue = ''; dialog.addEventListener('close', () => resolve(dialog.returnValue === 'accept'), { once: true }); dialog.showModal(); });
  }
  function renderOperations() {
    if (!operations || currentUser?.role !== 'admin') return;
    $('#storageStatus').textContent = `${operations.storage} · 最近备份 ${time(operations.backups[0]?.createdAt)}`;
    $('#jobRows').innerHTML = operations.jobs.map(job => `<div class="operation-row"><div><strong>${esc(job.title)}</strong><span class="badge">${job.paused ? '已暂停' : !job.enabled ? '已关闭' : states[job.status]}</span><small>下次：${time(job.nextAttemptAt || job.nextRunAt)}（北京时间）<br>上次完成：${time(job.lastFinishedAt)}${job.error ? `<br><span class="form-error">${esc(job.error)}</span>` : ''}</small></div><div class="row-actions"><button class="secondary small" data-job="${job.id}" data-action="${job.paused ? 'resume' : 'pause'}" ${job.status === 'running' ? 'disabled' : ''}>${job.paused ? '恢复' : '暂停'}</button><button class="secondary small" data-job="${job.id}" data-action="skip" ${job.status === 'running' ? 'disabled' : ''}>跳过本次</button><button class="secondary small" data-job="${job.id}" data-action="run" ${job.status === 'running' || operations.backupBusy ? 'disabled' : ''}>立即执行</button></div></div>`).join('');
    $('#jobHistory').innerHTML = operations.runs.length ? operations.runs.slice(0, 12).map(run => `<div class="operation-row"><div><strong>${esc(run.title)} · ${states[run.status]}</strong><small>开始 ${time(run.startedAt)}<br>结束 ${time(run.finishedAt)} · 第 ${run.attempt} 次尝试<br>${esc(run.summary || run.error || '')}</small></div></div>`).join('') : '<p class="muted">执行后，这里会保留任务结果。</p>';
    $('#backupRows').innerHTML = operations.backups.length ? operations.backups.slice(0, 7).map(row => `<div class="operation-row"><div><strong>${time(row.createdAt)}</strong><small>${(row.size / 1048576).toFixed(1)} MB · ${row.fileCount} 个文件<br>恢复验证：${time(row.verifiedAt)}</small><code class="backup-hash">SHA-256 ${esc(row.sha256)}</code></div><div class="row-actions"><a class="secondary small" href="/api/admin/operations/backups/${row.id}/content">下载备份</a><a class="text-link" href="/api/admin/operations/backups/${row.id}/metadata">校验信息</a><button class="secondary small" data-verify-backup="${row.id}">重新验证</button></div></div>`).join('') : '<p class="muted">暂无备份。可立即创建，或等待低峰自动备份。</p>';
    $('#createBackup').disabled = operations.backupBusy;
    if (!$('#retentionForm').contains(document.activeElement)) { $('#automaticBackup').checked = operations.settings.automaticBackup; for (const key of ['backupRetention', 'aiRecordRetentionDays', 'auditRetentionDays']) $(`#${key}`).value = operations.settings[key]; }
    const enabled = operations.jobs.filter(job => job.enabled && !job.paused);
    const failed = operations.jobs.filter(job => ['failed', 'interrupted', 'retrying'].includes(job.status));
    const waiting = enabled.filter(job => !operations.runs.some(run => run.jobId === job.id && run.status === 'completed') && job.status !== 'completed');
    const running = enabled.some(job => job.status === 'running');
    const headline = failed.length ? `${failed.length} 项任务需要处理` : running ? '自动任务正在执行' : !enabled.length ? operations.jobs.some(job => job.enabled && job.paused) ? '自动任务已暂停' : '自动任务未启用' : waiting.length ? '等待首次执行' : '已启用任务最近执行成功';
    const backupState = operations.backups.length ? `最近备份 ${time(operations.backups[0].createdAt)}` : '暂无备份，请先创建一份或启用自动备份';
    $('#homeOperations').innerHTML = `<div><strong>${headline}</strong><p class="muted">${failed.length ? failed.map(job => esc(job.title)).join('、') : `${backupState} · ${enabled.length} 项自动任务已启用`}</p></div><a href="#control" class="text-link">查看执行记录 ↗</a>`;
    $('#pendingOperationsCount').textContent = failed.length;
    const report = snapshot?.admin?.reports?.[0] || snapshot?.data.health?.[0], disk = report?.disk;
    const backup = operations.backups[0], next = enabled.filter(job => job.status !== 'running').sort((a, b) => Date.parse(a.nextAttemptAt || a.nextRunAt) - Date.parse(b.nextAttemptAt || b.nextRunAt))[0];
    const ai = snapshot?.admin, used = Number(ai?.usage?.dailyTokens || 0), limit = Number(ai?.settings?.assistantDailyTokens || 0);
    const remaining = disk && disk.totalGB > 0 ? Math.max(0, Math.min(100, Math.round(disk.freeGB / disk.totalGB * 100))) : null;
    const card = (title, value, detail, warning = false, percent = null) => `<article class="control-metric ${warning ? 'needs-attention' : ''}"><small>${title}</small><strong>${esc(value)}</strong>${percent === null ? '' : `<meter min="0" max="100" value="${percent}" aria-label="${title}">${percent}%</meter>`}<p>${esc(detail)}</p></article>`;
    $('#controlOverview').innerHTML = [
      card('数据盘剩余', disk ? `${disk.freeGB} / ${disk.totalGB} GB` : '尚无检查数据', `检查时间 ${time(report?.createdAt)}；报告数据不是实时采样`, remaining !== null && remaining < 10, remaining),
      card('最近备份', backup ? backup.verifiedAt ? '已验证恢复' : '尚未验证' : '暂无备份', backup ? time(backup.createdAt) : '创建备份或开启低峰自动备份', !backup || !backup.verifiedAt || Date.now() - Date.parse(backup.createdAt) > 48 * 3600000),
      card('自动任务', headline, next ? `${next.title} · ${Date.parse(next.nextAttemptAt || next.nextRunAt) <= Date.now() ? '等待低峰补执行' : '计划于 ' + time(next.nextAttemptAt || next.nextRunAt)}` : '暂无待执行的自动任务', failed.length > 0),
      card('今日 AI Token', ai ? `${used.toLocaleString()} / ${limit.toLocaleString()}` : '待同步', ai?.configured && ai?.settings?.assistantEnabled ? '全站额度；详细调用与费用见下方记录' : 'AI 服务尚未启用或未配置密钥', limit > 0 && used >= limit * 0.9)
    ].join('');
  }
  async function refreshOperations(force = false) {
    if (currentUser?.role !== 'admin' || loading || !force && Date.now() - lastRefresh < 30000) return;
    loading = true;
    try { operations = await api('/api/admin/operations'); lastRefresh = Date.now(); renderOperations(); }
    catch (error) { note(error.message, true); }
    finally { loading = false; }
  }
  async function refreshSecurity() {
    if (!currentUser) return;
    const [security, devices] = await Promise.all([api('/api/account/security'), api('/api/account/sessions')]);
    $('#mfaStatus').textContent = security.mfaEnabled ? `验证器已开启 · 剩余 ${security.recoveryCodesRemaining} 个一次性恢复码` : '验证器尚未开启';
    $('#mfaSetupForm').hidden = security.mfaEnabled; $('#mfaDisableForm').hidden = !security.mfaEnabled;
    $('#sessionRows').innerHTML = devices.sessions.map(row => `<div class="operation-row"><div><strong>${row.current ? '当前设备' : '其他设备'}</strong><small>${esc(row.userAgent || '未知设备')}<br>${esc(row.address || '未知地址')} · 最近活动 ${time(row.lastSeenAt)}<br>登录 ${time(row.createdAt)} · 到期 ${time(row.expiresAt)}</small></div>${!row.current ? `<button class="secondary small" data-revoke-session="${row.id}">退出设备</button>` : ''}</div>`).join('');
    $('#ownPasswordForm [data-mfa-factor]').hidden = !security.mfaEnabled;
    $('#ownPasswordForm input[name="newPassword"]').minLength = security.passwordMinimum;
    $('#securityPasswordHint').textContent = `新密码至少 ${security.passwordMinimum} 位。保存后退出其他设备。`;
  }
  document.addEventListener('polynomial-snapshot', event => {
    currentUser = event.detail.data.user; snapshot = event.detail;
    if (currentUser.role === 'admin') renderOperations();
    if (event.detail.offline) { $('#accountSecurity').hidden = true; return; }
    $('#accountSecurity').hidden = false;
    refreshOperations();
    if (location.hash === '#account') refreshSecurity().catch(error => $('#securityNotice').textContent = error.message);
  });
  window.addEventListener('hashchange', () => { if (location.hash === '#account') refreshSecurity().catch(error => $('#securityNotice').textContent = error.message); if (location.hash === '#control') refreshOperations(true); });
  $('#refreshOperations').onclick = () => refreshOperations(true);
  $('#operationsSurface').addEventListener('click', async event => {
    const button = event.target.closest('button'); if (!button) return;
    try {
      if (button.dataset.job) {
        const { job, action } = button.dataset;
        if (action === 'run' && !await confirm(job === 'review' ? '立即运行 AI 巡检会调用 DeepSeek 并消耗额度。请先核对上次失败或中断的记录，确认要再次调用。' : '现在执行这项任务？备份期间部分修改操作会暂时等待。')) return;
        if (action === 'skip' && !await confirm('跳过本次计划，下一周期继续执行？', '跳过本次')) return;
        button.disabled = true; note('正在处理任务…'); await api(`/api/admin/operations/jobs/${job}`, 'POST', { action }); note('任务操作已完成，可查看执行结果。');
      } else if (button.dataset.verifyBackup) { button.disabled = true; note('正在独立目录中恢复和校验备份…'); await api(`/api/admin/operations/backups/${button.dataset.verifyBackup}/verify`, 'POST', {}); note('备份恢复验证通过。'); }
      else if (button.id === 'createBackup') { button.disabled = true; note('正在创建备份并恢复校验，请保持页面打开…'); await api('/api/admin/operations/backups', 'POST', {}); note('备份已完成并通过恢复验证。'); }
      else return;
      await refreshOperations(true);
    } catch (error) { note(error.message, true); }
    finally { button.disabled = false; }
  });
  $('#retentionForm').onsubmit = async event => {
    event.preventDefault(); const button = event.submitter; button.disabled = true;
    try { await api('/api/admin/operations/settings', 'PATCH', { automaticBackup: $('#automaticBackup').checked, backupRetention: Number($('#backupRetention').value), aiRecordRetentionDays: Number($('#aiRecordRetentionDays').value), auditRetentionDays: Number($('#auditRetentionDays').value) }); note('备份和保存期限已更新。'); await refreshOperations(true); }
    catch (error) { note(error.message, true); } finally { button.disabled = false; }
  };
  $('#accountSecurity').addEventListener('click', async event => {
    const button = event.target.closest('button'); if (!button || (!button.dataset.revokeSession && button.id !== 'revokeOtherSessions')) return;
    try { if (!await confirm('让选中的设备退出账号？', '退出设备')) return; button.disabled = true; await api(`/api/account/sessions/${button.dataset.revokeSession || 'others'}`, 'DELETE'); await refreshSecurity(); $('#securityNotice').textContent = '设备会话已退出。'; }
    catch (error) { $('#securityNotice').textContent = error.message; } finally { button.disabled = false; }
  });
  for (const id of ['ownPasswordForm', 'mfaSetupForm', 'mfaVerifyForm', 'mfaDisableForm']) $(`#${id}`).onsubmit = async event => {
    event.preventDefault(); const button = event.submitter; button.disabled = true; $('#securityNotice').textContent = '';
    try {
      const form = event.target, data = Object.fromEntries(new FormData(form));
      const route = id === 'ownPasswordForm' ? 'password' : `mfa/${{ mfaSetupForm: 'setup', mfaVerifyForm: 'enable', mfaDisableForm: 'disable' }[id]}`;
      if (id === 'mfaDisableForm' && !await confirm('关闭管理员验证器？以后登录将只验证密码。', '关闭验证器')) return;
      const result = await api(`/api/account/${route}`, 'POST', data); form.reset();
      if (id === 'mfaSetupForm') { $('#mfaSecret').textContent = result.secret; $('#mfaUri').textContent = result.uri; $('#mfaVerifyForm').hidden = false; $('#mfaCode').focus(); }
      else { $('#mfaVerifyForm').hidden = true; $('#mfaSecret').textContent = ''; $('#mfaUri').textContent = ''; await refreshSecurity(); $('#securityNotice').textContent = '账号安全设置已保存。'; }
      if (result.recoveryCodes) { $('#mfaRecoveryCodes').textContent = result.recoveryCodes.join('\n'); $('#mfaRecoveryPanel').hidden = false; }
    } catch (error) { $('#securityNotice').textContent = error.message; }
    finally { button.disabled = false; }
  };
  const nativeClient = /PolynomialClient\//.test(navigator.userAgent);
  if (nativeClient) $('#downloadRecoveryCodes').textContent = '复制恢复码';
  $('#downloadRecoveryCodes').onclick = async () => { const text = $('#mfaRecoveryCodes').textContent; if (!text) return; if (nativeClient) { try { await navigator.clipboard.writeText(text); $('#securityNotice').textContent = '恢复码已复制，请保存到你保管的位置。'; } catch { const selection = getSelection(), range = document.createRange(); range.selectNodeContents($('#mfaRecoveryCodes')); selection.removeAllRanges(); selection.addRange(range); $('#securityNotice').textContent = '已选中恢复码，请使用系统复制功能保存。'; } return; } const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' })); const link = document.createElement('a'); link.href = url; link.download = 'Polynomial-recovery-codes.txt'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 10000); };
  $('#closeRecoveryCodes').onclick = () => { $('#mfaRecoveryCodes').textContent = ''; $('#mfaRecoveryPanel').hidden = true; };
})();
