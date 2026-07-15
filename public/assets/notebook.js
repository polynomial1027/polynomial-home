const nb = id => document.getElementById(id);

function showNotebookConfig(config = {}) {
  const cpu = (Number(config.cpuMilli || 0) / 1000).toFixed(config.cpuMilli % 1000 ? 2 : 0);
  nb('notebookLimits').innerHTML = [
    ['内存', `${config.memoryMB || '-'} MB`],
    ['CPU', `${cpu || '-'} 核`],
    ['存档', `${config.storageMB || '-'} MB`],
    ['闲置停止', `${config.idleMinutes || '-'} 分钟`]
  ].map(([label, value]) => `<div><small>${label}</small><strong>${value}</strong></div>`).join('');
}

function setNotebookState(running, message) {
  nb('notebookStatus').textContent = message;
  nb('notebookDot').classList.toggle('online', running);
  nb('startNotebook').textContent = running ? '进入 JupyterLab' : '启动并进入 JupyterLab';
  nb('stopNotebook').disabled = !running;
}

async function refreshNotebook() {
  const data = await request('/api/notebook/status');
  showNotebookConfig(data.config);
  setNotebookState(Boolean(data.running), data.running ? '正在运行' : '尚未启动');
  return data;
}

async function initNotebook() {
  const me = await request('/api/me');
  if (!me.user) {
    setNotebookState(false, '需要登录');
    nb('notebookNotice').innerHTML = '请先登录已获授权的账号。<br><a href="/login.html">前往登录 →</a>';
    nb('startNotebook').disabled = true;
    nb('stopNotebook').disabled = true;
    return;
  }
  if (me.user.role !== 'admin' && !me.user.permissions?.accessNotebook) {
    setNotebookState(false, '未开放权限');
    nb('notebookNotice').textContent = '请联系管理员为此账号开放 Python 实验室权限。';
    nb('startNotebook').disabled = true;
    nb('stopNotebook').disabled = true;
    return;
  }
  try { await refreshNotebook(); }
  catch (error) { nb('notebookNotice').textContent = error.message; setNotebookState(false, '暂时不可用'); }

  nb('startNotebook').onclick = async () => {
    nb('startNotebook').disabled = true;
    nb('notebookNotice').textContent = '正在准备独立 Python 环境，首次启动可能需要几秒…';
    try {
      await request('/api/notebook/start', { method: 'POST' });
      location.href = '/python/session/lab';
    } catch (error) {
      nb('notebookNotice').textContent = error.message;
      nb('startNotebook').disabled = false;
    }
  };

  nb('stopNotebook').onclick = async () => {
    if (!confirm('确定停止当前 Python 环境吗？已保存的 Notebook 不会删除。')) return;
    nb('stopNotebook').disabled = true;
    nb('notebookNotice').textContent = '正在停止…';
    try { await request('/api/notebook/stop', { method: 'POST' }); nb('notebookNotice').textContent = '环境已停止，Notebook 存档仍然保留。'; await refreshNotebook(); }
    catch (error) { nb('notebookNotice').textContent = error.message; }
  };
}

initNotebook().catch(error => { nb('notebookNotice').textContent = error.message; });
