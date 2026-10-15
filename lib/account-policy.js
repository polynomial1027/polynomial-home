const guestPermissions={accessChat:false,createGroups:false,createDirect:false,postLobby:false,viewUsers:false,driveEnabled:true,viewPublicDrive:false,uploadPublicDrive:false,downloadPublicDrive:false,accessLearning:false,accessNotebook:false,accessGames:true,accessAssistant:true,accessPlanner:true,accessGo:false,goStudy:false,goPuzzles:false,goAi:false,goMultiplayer:false,goInvite:false,goShared:false,goSgfImport:false,goSgfExport:false};
const guestLimits={dailyTokens:10000,monthlyTokens:50000,dailyRequests:5,monthlyRequests:30};
const guestTools=['general','summary','translate','writing','study','planner'];
const isGuest=user=>user?.role==='guest';
function allowed(user,key){return user?.role==='admin'||Boolean(user?.permissions?.[key]===true&&(!isGuest(user)||guestPermissions[key]===true));}
function apply(user){if(isGuest(user)){user.permissions=Object.fromEntries(Object.entries(guestPermissions).map(([key,value])=>[key,value&&user.permissions?.[key]!==false]));user.driveQuotaMB=Math.min(32,Math.max(0,Number.isSafeInteger(Number(user.driveQuotaMB))?Number(user.driveQuotaMB):32));}return user;}
function denyRoute(user,url,method){
 if(!isGuest(user))return false;const p=url.pathname;
 if(['/api/messages','/api/conversations','/api/chat','/api/chat-config','/api/files','/api/upload','/api/go','/api/notebook','/api/learning','/api/admin','/api/users','/api/settings','/api/feedback','/api/client/delivery'].some(prefix=>p===prefix||p.startsWith(prefix+'/')))return true;
 if(p.startsWith('/api/account/ai/templates'))return true;
 return p.startsWith('/api/drive/files/')&&method==='POST';
}
function isolate(state,user){
 apply(user);if(!isGuest(user))return;
 state.driveShares=state.driveShares.filter(s=>s.recipientId!==user.id&&!state.driveFiles.some(f=>f.id===s.fileId&&f.ownerId===user.id));
 for(const file of state.driveFiles)if(file.ownerId===user.id)file.scope='private';
 for(const room of state.conversations){room.memberIds=room.memberIds.filter(id=>id!==user.id);if(room.createdBy===user.id)room.createdBy=null;}
 for(const invitation of state.goInvitations||[])if(invitation.status==='pending'&&(invitation.fromUserId===user.id||invitation.toUserId===user.id))invitation.status='cancelled';
}
module.exports={isGuest,allowed,apply,denyRoute,isolate,guestPermissions,guestLimits,guestTools};
