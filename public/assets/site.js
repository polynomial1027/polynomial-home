const qs = s => document.querySelector(s);
const esc = value => String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
qs('#menuButton')?.addEventListener('click', () => qs('#navLinks').classList.toggle('open'));

function updateTimes(){
  const now = new Date();
  document.querySelectorAll('[data-timezone]').forEach(el => {
    const tz = el.dataset.timezone;
    el.querySelector('strong').textContent = new Intl.DateTimeFormat('zh-CN',{timeZone:tz,hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(now);
    el.querySelector('small').textContent = new Intl.DateTimeFormat('zh-CN',{timeZone:tz,month:'long',day:'numeric',weekday:'short'}).format(now);
  });
}
if(document.querySelector('[data-timezone]')){updateTimes();setInterval(updateTimes,1000)}

async function request(url, options={}){
  const res=await fetch(url,{...options,headers:{'Content-Type':'application/json',...(options.headers||{})}});
  const data=await res.json(); if(!res.ok) throw new Error(data.error||'请求失败'); return data;
}

qs('#loginForm')?.addEventListener('submit',async e=>{e.preventDefault();const note=qs('#notice');note.textContent='';try{const data=await request('/api/login',{method:'POST',body:JSON.stringify({username:qs('#username').value,password:qs('#password').value})});location.href=data.user.role==='admin'?'/admin.html':'/chat.html'}catch(err){note.textContent=err.message}});

async function loadAccount(){
  const data=await request('/api/me'); if(!data.user){location.href='/login.html';throw new Error('未登录')} return data.user;
}
qs('#logout')?.addEventListener('click',async()=>{await request('/api/logout',{method:'POST'});location.href='/'});

async function initChat(){
  const messages=qs('#messages'); if(!messages)return; const user=await loadAccount(); qs('#currentUser').textContent=user.displayName;
  const history=await request('/api/messages'); history.messages.forEach(renderMessage); messages.scrollTop=messages.scrollHeight;
  const protocol=location.protocol==='https:'?'wss':'ws'; const socket=new WebSocket(`${protocol}://${location.host}/chat-socket`);
  socket.onmessage=e=>{const data=JSON.parse(e.data);if(data.type==='message'){renderMessage(data.message);messages.scrollTop=messages.scrollHeight}};
  socket.onclose=()=>qs('#connection').textContent='连接已断开，请刷新页面';
  qs('#chatForm').addEventListener('submit',e=>{e.preventDefault();const input=qs('#messageInput');const text=input.value.trim();if(text&&socket.readyState===1){socket.send(JSON.stringify({text}));input.value=''}});
  function renderMessage(m){const item=document.createElement('article');item.className='message';item.innerHTML=`<div class="avatar">${esc(m.displayName[0]||'?')}</div><div><div class="message-meta"><strong>${esc(m.displayName)}</strong><time>${new Date(m.createdAt).toLocaleString('zh-CN')}</time></div><p>${esc(m.text)}</p></div>`;messages.append(item)}
}

async function initAdmin(){
  if(!qs('#userList'))return; const me=await loadAccount(); if(me.role!=='admin'){location.href='/chat.html';return} qs('#adminName').textContent=me.displayName; await refresh();
  qs('#createUser').addEventListener('submit',async e=>{e.preventDefault();const note=qs('#adminNotice');note.textContent='';try{await request('/api/users',{method:'POST',body:JSON.stringify({username:qs('#newUsername').value,displayName:qs('#newDisplayName').value,password:qs('#newPassword').value,role:qs('#newRole').value})});e.target.reset();note.style.color='var(--accent2)';note.textContent='账号已创建';await refresh()}catch(err){note.style.color='var(--danger)';note.textContent=err.message}});
  async function refresh(){const data=await request('/api/users');qs('#userList').innerHTML=data.users.map(u=>`<div class="user-row"><div><strong>${esc(u.displayName)}</strong><small>@${esc(u.username)} · ${u.role==='admin'?'管理员':'成员'} · ${u.active?'启用':'停用'}</small></div><div class="actions"><button class="button secondary" data-toggle="${u.id}" data-active="${u.active}">${u.active?'停用':'启用'}</button></div></div>`).join('');document.querySelectorAll('[data-toggle]').forEach(btn=>btn.onclick=async()=>{await request(`/api/users/${btn.dataset.toggle}`,{method:'PATCH',body:JSON.stringify({active:btn.dataset.active!=='true'})});await refresh()})}
}
initChat().catch(()=>{});initAdmin().catch(()=>{});
