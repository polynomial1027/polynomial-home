const extraStyles=document.createElement('link');extraStyles.rel='stylesheet';extraStyles.href='/assets/enhancements.css';document.head.append(extraStyles);
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
  const messages=qs('#messages'); if(!messages)return; const user=await loadAccount(); qs('#currentUser').textContent=user.displayName; let replyTarget=null;
  const history=await request('/api/messages'); history.messages.forEach(renderMessage); messages.scrollTop=messages.scrollHeight;
  const protocol=location.protocol==='https:'?'wss':'ws'; const socket=new WebSocket(`${protocol}://${location.host}/chat-socket`);
  socket.onmessage=e=>{const data=JSON.parse(e.data);if(data.type==='message'){renderMessage(data.message);messages.scrollTop=messages.scrollHeight}if(data.type==='delete')removeMessage(data.messageId)};
  socket.onclose=()=>qs('#connection').textContent='连接已断开，请刷新页面';
  qs('#cancelReply').addEventListener('click',clearReply);
  qs('#chatForm').addEventListener('submit',e=>{e.preventDefault();const input=qs('#messageInput');const text=input.value.trim();if(text&&socket.readyState===1){socket.send(JSON.stringify({text,replyToId:replyTarget?.id||null}));input.value='';clearReply()}});
  function setReply(m){replyTarget=m;qs('#replyName').textContent=m.displayName;qs('#replyText').textContent=m.text;qs('#replyBar').classList.remove('hidden');qs('#messageInput').focus()}
  function clearReply(){replyTarget=null;qs('#replyBar').classList.add('hidden')}
  function removeMessage(id){messages.querySelector(`[data-message-id="${id}"]`)?.remove();if(replyTarget?.id===id)clearReply()}
  function renderMessage(m){const item=document.createElement('article');item.className='message';item.dataset.messageId=m.id;const quote=m.replyTo?`<button class="message-quote" type="button" data-jump="${m.replyTo.id}"><strong>${esc(m.replyTo.displayName)}</strong><span>${esc(m.replyTo.text)}</span></button>`:'';const canDelete=m.userId===user.id||user.role==='admin';item.innerHTML=`<div class="avatar">${esc(m.displayName[0]||'?')}</div><div class="message-body"><div class="message-meta"><strong>${esc(m.displayName)}</strong><time>${new Date(m.createdAt).toLocaleString('zh-CN')}</time></div>${quote}<p>${esc(m.text)}</p><div class="message-actions"><button type="button" data-reply>回复</button>${canDelete?'<button type="button" data-delete>删除</button>':''}</div></div>`;item.querySelector('[data-reply]').onclick=()=>setReply(m);item.querySelector('[data-delete]')?.addEventListener('click',async()=>{if(!confirm('确定删除这条消息吗？'))return;try{await request(`/api/messages/${m.id}`,{method:'DELETE'})}catch(err){alert(err.message)}});item.querySelector('[data-jump]')?.addEventListener('click',()=>{const target=messages.querySelector(`[data-message-id="${m.replyTo.id}"]`);if(target){target.scrollIntoView({behavior:'smooth',block:'center'});target.classList.add('message-flash');setTimeout(()=>target.classList.remove('message-flash'),1200)}});messages.append(item)}
}

async function initAdmin(){
  if(!qs('#userList'))return; const me=await loadAccount(); if(me.role!=='admin'){location.href='/chat.html';return} qs('#adminName').textContent=me.displayName; await refresh();await refreshMessages();
  qs('#createUser').addEventListener('submit',async e=>{e.preventDefault();const note=qs('#adminNotice');note.textContent='';try{await request('/api/users',{method:'POST',body:JSON.stringify({username:qs('#newUsername').value,displayName:qs('#newDisplayName').value,password:qs('#newPassword').value,role:qs('#newRole').value})});e.target.reset();note.style.color='var(--accent2)';note.textContent='账号已创建';await refresh()}catch(err){note.style.color='var(--danger)';note.textContent=err.message}});
  async function refresh(){const data=await request('/api/users');qs('#userList').innerHTML=data.users.map(u=>`<div class="user-row"><div><strong>${esc(u.displayName)}</strong><small>@${esc(u.username)} · ${u.role==='admin'?'管理员':'成员'} · ${u.active?'启用':'停用'}</small></div><div class="actions"><button class="button secondary" data-toggle="${u.id}" data-active="${u.active}">${u.active?'停用':'启用'}</button></div></div>`).join('');document.querySelectorAll('[data-toggle]').forEach(btn=>btn.onclick=async()=>{await request(`/api/users/${btn.dataset.toggle}`,{method:'PATCH',body:JSON.stringify({active:btn.dataset.active!=='true'})});await refresh()})}
  async function refreshMessages(){const data=await request('/api/admin/messages');const list=qs('#adminMessageList');list.innerHTML=data.messages.length?data.messages.map(m=>`<div class="admin-message-row" data-admin-message="${m.id}"><div><div class="message-meta"><strong>${esc(m.displayName)}</strong><span>@${esc(m.username)}</span><time>${new Date(m.createdAt).toLocaleString('zh-CN')}</time></div>${m.replyTo?`<small>回复 ${esc(m.replyTo.displayName)}：${esc(m.replyTo.text)}</small>`:''}<p>${esc(m.text)}</p></div><button class="button danger" data-admin-delete="${m.id}">删除</button></div>`).join(''):'<div class="empty">暂无聊天记录</div>';list.querySelectorAll('[data-admin-delete]').forEach(btn=>btn.onclick=async()=>{if(!confirm('确定由管理员删除这条消息吗？'))return;try{await request(`/api/messages/${btn.dataset.adminDelete}`,{method:'DELETE'});btn.closest('[data-admin-message]').remove()}catch(err){alert(err.message)}})}
}
initChat().catch(()=>{});initAdmin().catch(()=>{});
