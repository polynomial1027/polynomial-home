const profiles = require('./profiles');
function canRead(state, user, id) { return user?.active && (user.role === 'admin' || user.permissions?.accessChat === true) && (id === 'lobby' || state.conversations.some(c=>c.id===id&&(user.role==='admin'||c.memberIds.includes(user.id)))); }
function inbox(state, user, cursor) {
  const messages = state.messages.filter(m=>canRead(state,user,m.conversationId)), grouped = new Map();
  for(const m of messages) { if(!grouped.has(m.conversationId)) grouped.set(m.conversationId,[]); grouped.get(m.conversationId).push(m); }
  const rooms = [{ id:'lobby',title:'聊天大厅',type:'lobby',memberIds:[] }, ...state.conversations.filter(c=>canRead(state,user,c.id))];
  const conversations = rooms.map(c=>{ const all=grouped.get(c.id)||[], read=all.findIndex(m=>m.id===user.chatRead?.[c.id]), latest=all.at(-1), peer=c.type==='direct'?state.users.find(u=>u.id!==user.id&&c.memberIds.includes(u.id)):null;
    return { id:c.id,type:c.type,title:peer?.displayName||c.title,memberIds:c.memberIds,createdBy:c.createdBy,createdAt:c.createdAt,avatarUrl:peer?profiles.view(peer).avatarUrl:null,emoji:peer?profiles.view(peer).emoji:'',unread:all.slice(read+1).filter(m=>m.userId!==user.id).length,latest:latest?{id:latest.id,text:latest.text?.slice(0,90)||'[附件]',at:latest.createdAt,displayName:latest.displayName}:null }; });
  const index=cursor?messages.findIndex(m=>m.id===cursor):-1;
  // An unknown cursor may have been pruned; return retained recent events once.
  const events=cursor?messages.slice(index<0?-100:index+1,index<0?undefined:index+101):[];
  return { conversations, unreadTotal:conversations.reduce((n,c)=>n+c.unread,0), events, cursor:events.at(-1)?.id||messages.at(-1)?.id||null };
}
function read(state,user,id,messageId) {
  if(!canRead(state,user,id)) throw Object.assign(new Error('无权访问该聊天'),{status:403});
  const all=state.messages.filter(m=>m.conversationId===id), index=all.findIndex(m=>m.id===messageId);
  if(index<0) throw new Error('消息不存在');
  user.chatRead ||= {}; const previous=all.findIndex(m=>m.id===user.chatRead[id]);
  if(index<=previous)return false; user.chatRead[id]=messageId; return true;
}
function duplicate(state,user,input) { return input.clientId && state.messages.find(m=>m.userId===user.id&&m.clientId===input.clientId); }
async function push({state,save,message,online=()=>false,send=require('web-push').sendNotification}) {
  for(const sub of [...(state.pushSubscriptions||[])]) {
    const user=state.users.find(u=>u.id===sub.userId), prefs=user&&profiles.view(user);
    if(!canRead(state,user,message.conversationId)||user.id===message.userId||!prefs.messageNotifications||online(user.id))continue;
    try { await send({endpoint:sub.endpoint,keys:sub.keys},JSON.stringify({type:'chat',title:'新消息',body:prefs.messagePreview?`${message.displayName}：${message.text||'[附件]'}`.slice(0,120):'你收到一条新消息',messageId:message.id,url:`/chat.html#room=${message.conversationId}`}),{TTL:3600,urgency:'high',timeout:5000}); }
    catch(error) { if([404,410].includes(error.statusCode)){state.pushSubscriptions=state.pushSubscriptions.filter(s=>s.endpoint!==sub.endpoint);save(state);} }
  }
}
module.exports={canRead,inbox,read,duplicate,push};
