const crypto = require('node:crypto');
const releases = require('./client-releases');
const platforms = ['android','ios','mac','windows','linux','other'];
function architecture(fileName) { return /arm64/i.test(fileName)?'arm64':/x64|x86_64|amd64/i.test(fileName)?'x64':'universal'; }
function view(state, resource) {
 const file=state.driveFiles.find(item=>item.id===resource.fileId&&item.scope==='public');if(!file)return null;
 const status=resource.category==='client'?(state.clientReleases || []).find(item=>item.version===resource.version)?.status || 'testing':null;
 return {...resource,architecture:resource.architecture || architecture(file.originalName),releaseStatus:status,fileName:file.originalName,size:file.size,downloadUrl:status&& !['stable','testing'].includes(status)?null:`/api/downloads/${resource.id}/content`};
}
function publish(state, data, adminId) {
 const file=state.driveFiles.find(item=>item.id===data.fileId&&item.scope==='public');if(!file)throw new Error('请先将文件上传至公共网盘，再选择公开发布');
 const title=String(data.title||'').trim();if(!title||title.length>120)throw new Error('资源标题需为 1–120 字');if(!platforms.includes(data.platform))throw new Error('请选择平台');
 const category=data.category==='client'?'client':'resource',version=String(data.version||'').slice(0,40);
 if(category==='client'&&!releases.VERSION.test(version))throw new Error('客户端需填写有效版本号，例如 0.3.2');
 const item={id:crypto.randomUUID(),fileId:file.id,title,description:String(data.description||'').slice(0,2000),platform:data.platform,category,version,sha256:String(data.sha256||'').match(/^[a-f0-9]{64}$/)?.[0]||null,createdAt:new Date().toISOString(),publishedBy:adminId};
 state.resourceDownloads||=[];state.resourceDownloads.push(item);
 if(category==='client'&&!(state.clientReleases||[]).some(release=>release.version===version))releases.update(state,version,{status:'testing',notes:'已发布试用安装包。'});
 return view(state,item);
}
module.exports={view,publish,platforms,architecture};
