(() => {
  if(window.PolynomialMessaging)return;
  const listeners=new Set(), seen=new Set(); let socket, stopped=false, reconnect, startupRetry, failures=0, syncPending=null, cursor=null, user=null, unread=0, lastSignal=Date.now(), polling;
  const emit=(type,data={})=>{for(const fn of listeners)try{fn({type,...data});}catch(e){console.warn('Message view:',e);}};
  const api=async(path,options={})=>{const res=await fetch(path,{...options,credentials:'same-origin',signal:AbortSignal.timeout(10000),headers:{'Content-Type':'application/json'}});if(res.status===401||res.status===403){stop();throw new Error('请重新登录或检查聊天权限');}const data=await res.json();if(!res.ok)throw new Error(data.error||'消息同步失败');return data;};
  function badge(){document.querySelectorAll('a[href="/chat.html"]').forEach(a=>{let b=a.querySelector('.message-unread-badge');if(!b){b=document.createElement('span');b.className='message-unread-badge';a.append(b);}b.textContent=unread>99?'99+':unread;b.hidden=!unread;});}
  function toast(message){let box=document.querySelector('#incomingMessage');if(!box){box=document.createElement('a');box.id='incomingMessage';box.className='incoming-message';box.setAttribute('role','status');document.body.append(box);}box.href=`/chat.html#room=${message.conversationId}`;box.textContent=user.profile?.messagePreview===false?'你收到一条新消息':`${message.displayName}：${message.text||'[附件]'}`;box.hidden=false;setTimeout(()=>{box.hidden=true;},6000);}
  async function notify(message){
    if(!user||message.userId===user.id||user.profile?.messageNotifications===false)return;
    const active=location.pathname==='/chat.html' && !document.hidden && document.hasFocus() && new URLSearchParams(location.hash.slice(1)).get('room')===message.conversationId;
    if(active)return;toast(message);
    const body=user.profile?.messagePreview===false?'你收到一条新消息':`${message.displayName}：${message.text||'[附件]'}`.slice(0,120),url=`/chat.html#room=${message.conversationId}`;
    try {
      if(typeof window.PolynomialReminders?.notifyMessage==='function'){window.PolynomialReminders.notifyMessage(JSON.stringify({title:'新消息',body,id:message.id,conversationId:message.conversationId}));}
      else if(window.__TAURI__?.notification && await window.__TAURI__.notification.isPermissionGranted()){window.__TAURI__.notification.sendNotification({title:'新消息',body});}
      else if('Notification'in window&&Notification.permission==='granted'){const reg=await navigator.serviceWorker?.getRegistration();if(reg)await reg.showNotification('新消息',{body,tag:`chat-${message.id}`,data:{url}});else new Notification('新消息',{body,tag:`chat-${message.id}`});}
      if(user.profile?.messageSound){const Audio=window.AudioContext||window.webkitAudioContext;if(Audio){const a=new Audio(),o=a.createOscillator(),g=a.createGain();o.connect(g);g.connect(a.destination);g.gain.value=.05;o.frequency.value=660;o.start();o.stop(a.currentTime+.12);o.onended=()=>a.close();}}
    } catch(e){console.warn('Message notification:',e);}
  }
  function incoming(message){if(seen.has(message.id))return;seen.add(message.id);if(seen.size>500)seen.delete(seen.values().next().value);emit('message',{message});notify(message);}
  function sync(){
    if(stopped)return Promise.resolve();if(syncPending)return syncPending;
    syncPending=api('/api/chat/inbox'+(cursor?`?after=${encodeURIComponent(cursor)}`:'')).then(data=>{cursor=data.cursor||'empty';unread=data.unreadTotal;badge();data.events.forEach(incoming);emit('inbox',{inbox:data});return data;}).finally(()=>{syncPending=null;});return syncPending;
  }
  function connect(){
    if(stopped||!navigator.onLine)return;clearTimeout(reconnect);if(socket&&socket.readyState<2)return;
    emit('connection',{status:'正在连接…'});socket=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}/chat-socket`);
    const current=socket, timeout=setTimeout(()=>{if(current.readyState===0)current.close();},7000);
    current.onopen=()=>{clearTimeout(timeout);failures=0;lastSignal=Date.now();emit('connection',{status:'实时连接已就绪'});sync().catch(()=>{});};
    current.onmessage=event=>{lastSignal=Date.now();try{const data=JSON.parse(event.data);if(data.type==='message'){incoming(data.message);sync().catch(()=>{});}else if(!['ready','pong'].includes(data.type)){emit(data.type,data);sync().catch(()=>{});}}catch{}};
    current.onerror=()=>current.close();current.onclose=()=>{clearTimeout(timeout);if(stopped||current!==socket)return;emit('connection',{status:'连接中断 · 自动重连，定时补收'});reconnect=setTimeout(connect,Math.min(15000,1000*2**Math.min(failures++,4)));};
  }
  function stop(){stopped=true;clearTimeout(reconnect);clearTimeout(startupRetry);clearInterval(polling);socket?.close();}
  async function start(){try{user=(await api('/api/me')).user;if(!user||user.role!=='admin'&&!user.permissions?.accessChat)return;document.body.dataset.compact=String(user.profile?.compact===true);await sync();connect();polling=setInterval(()=>{if(stopped||!navigator.onLine)return;sync().catch(()=>{});if(socket?.readyState===1){if(Date.now()-lastSignal>45000)socket.close();else socket.send(JSON.stringify({type:'ping'}));}},5000);emit('ready',{user});}catch(error){emit('connection',{status:error.message});if(!stopped)startupRetry=setTimeout(start,5000);}}
  window.PolynomialMessaging={subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},sync,read:async(id,messageId)=>{await api('/api/chat/read',{method:'POST',body:JSON.stringify({conversationId:id,messageId})});return sync();},user:()=>user};
  window.addEventListener('online',()=>{socket?.close();connect();sync().catch(()=>{});});document.addEventListener('visibilitychange',()=>{if(!document.hidden){connect();sync().catch(()=>{});}});window.addEventListener('focus',()=>sync().catch(()=>{}));window.addEventListener('pagehide',stop);window.addEventListener('pageshow',event=>{if(event.persisted){stopped=false;start();}});
  document.body.dataset.android=String(/PolynomialClient.*android/.test(navigator.userAgent));
  document.addEventListener('polynomial-profile-saved',event=>{user=event.detail;document.body.dataset.compact=String(user.profile?.compact===true);});
  start();
})();
