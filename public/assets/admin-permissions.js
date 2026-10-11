const portalStyle = document.createElement('link');
portalStyle.rel = 'stylesheet';
portalStyle.href = '/assets/portal.css';
document.head.append(portalStyle);

let permissionUsers = [];
const ae = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));

function fillUserAccessFields(user) {
  if (!user) return;
  const quota = Number(user.driveQuotaMB);
  document.querySelector('#editDriveQuotaMB').value = Number.isSafeInteger(quota) && quota >= 0 ? String(quota) : '1024';
  document.querySelectorAll('[data-permission]').forEach(input => {
    input.checked = user.role === 'admin' || user.permissions?.[input.dataset.permission] === true;
    input.disabled = user.role === 'admin';
  });
}

async function refreshAndFillUser(userId) {
  permissionUsers = (await request('/api/users')).users;
  fillUserAccessFields(permissionUsers.find(user => user.id === userId));
}

async function initPermissionAdmin() {
  await loadAccount();
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-edit-user]');
    if (!button) return;
    fillUserAccessFields(permissionUsers.find(user => user.id === button.dataset.editUser));
    refreshAndFillUser(button.dataset.editUser).catch(error => {
      document.querySelector('#editUserNotice').textContent = `读取最新权限失败：${error.message}`;
    });
  }, true);
  document.querySelector('#editRole').addEventListener('change', () => {
    const user = permissionUsers.find(item => item.id === document.querySelector('#editUserId').value);
    document.querySelectorAll('[data-permission]').forEach(input => {
      input.disabled = document.querySelector('#editRole').value === 'admin';
      if (input.disabled) input.checked = true;
      else if (user) input.checked = user.permissions?.[input.dataset.permission] === true;
    });
  });
  await Promise.all([reloadPermissionUsers(), loadAdminDrive()]);
  document.querySelector('#refreshAdminDrive').onclick = loadAdminDrive;
  document.querySelector('#editUserForm').addEventListener('submit', savePermissions, true);
}

async function reloadPermissionUsers() {
  permissionUsers = (await request('/api/users')).users;
}

async function savePermissions(event) {
  event.preventDefault();
  event.stopImmediatePropagation();
  const quotaField = document.querySelector('#editDriveQuotaMB');
  const quota = Number(quotaField.value);
  if (quotaField.value.trim() === '' || !Number.isSafeInteger(quota) || quota < 0) {
    document.querySelector('#editUserNotice').textContent = '网盘额度必须是不小于 0 的整数 MB';
    quotaField.focus();
    return;
  }
  const id = document.querySelector('#editUserId').value;
  const permissions = Object.fromEntries([...document.querySelectorAll('[data-permission]')].map(input => [input.dataset.permission, input.checked]));
  const payload = {
    username: document.querySelector('#editUsername').value,
    displayName: document.querySelector('#editDisplayName').value,
    role: document.querySelector('#editRole').value,
    active: document.querySelector('#editActive').value === 'true',
    driveQuotaMB: quota,
    permissions
  };
  if (document.querySelector('#editPassword').value) payload.password = document.querySelector('#editPassword').value;
  try {
    const { user } = await request(`/api/users/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
    const saved = (await request('/api/users')).users.find(item => item.id === id);
    if (!saved || saved.driveQuotaMB !== quota || Object.entries(permissions).some(([key, value]) => saved.role !== 'admin' && saved.permissions?.[key] !== value)) {
      throw new Error('服务器返回的权限状态与保存内容不一致，请重试');
    }
    Object.assign(user, saved);
    document.querySelector('#editUserDialog').close();
    location.reload();
  } catch (error) {
    document.querySelector('#editUserNotice').textContent = error.message;
  }
}
async function loadAdminDrive(){const data=await request('/api/admin/drive'),names=Object.fromEntries(data.users.map(u=>[u.id,u.displayName]));document.querySelector('#adminDriveList').innerHTML=data.files.length?data.files.map(file=>`<div class="drive-row"><div class="file-icon">▤</div><div><strong data-i18n-user>${ae(file.originalName)}</strong><small><span data-i18n-user>${ae(names[file.ownerId]||'已删除用户')}</span> · ${file.scope==='public'?'公共盘':'私人盘'} · ${formatBytes(file.size)}</small></div><div class="actions"><a class="button secondary" href="/api/drive/files/${file.id}/content">下载</a><button class="button danger" data-admin-drive-delete="${file.id}">删除</button></div></div>`).join(''):'<div class="empty">暂无网盘文件</div>';document.querySelectorAll('[data-admin-drive-delete]').forEach(button=>button.onclick=async()=>{if(!confirm('确定删除该用户的文件吗？'))return;await request(`/api/drive/files/${button.dataset.adminDriveDelete}`,{method:'DELETE'});loadAdminDrive()})}initPermissionAdmin().catch(console.error);
