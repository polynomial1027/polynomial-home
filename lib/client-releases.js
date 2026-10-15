const VERSION = /^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/;
const statuses = ['planned', 'building', 'testing', 'stable', 'withdrawn'];
function compare(a,b) { const parts=value=>value.split('-')[0].split('.').map(Number);const aa=parts(a),bb=parts(b);for(let i=0;i<3;i++)if(aa[i]!==bb[i])return aa[i]-bb[i];if(a.includes('-')!==b.includes('-'))return a.includes('-')?-1:1;return a.localeCompare(b,undefined,{numeric:true}); }
function manifest(state) {
 const files=state.driveFiles || [];
 const available=(state.resourceDownloads || []).filter(item=>item.category==='client'&&files.some(file=>file.id===item.fileId&&file.scope==='public'));
 const releases=(state.clientReleases || []).map(release=>({...release,platforms:[...new Set(available.filter(item=>item.version===release.version).map(item=>item.platform))],fileCount:available.filter(item=>item.version===release.version).length})).sort((a,b)=>compare(b.version,a.version));
 const ready=releases.filter(item=>item.fileCount>0&&['stable','testing'].includes(item.status));
 const recommendation=ready.find(item=>item.version===state.settings.clientRecommendedVersion)||ready.find(item=>item.status==='stable')||ready[0];
 const recommendedByPlatform=Object.fromEntries(['android','ios','mac','windows','linux'].map(platform=>{const candidates=ready.filter(item=>item.platforms.includes(platform));const chosen=candidates.find(item=>item.version===state.settings.clientRecommendedVersion)||candidates.find(item=>item.status==='stable')||candidates[0];return [platform,chosen?.version||null];}));
 return {recommendedVersion:recommendation?.version || null,recommendedByPlatform,minimumByPlatform:state.settings.clientMinimumVersions || {},releases,updatedAt:releases.reduce((latest,item)=>item.updatedAt>latest?item.updatedAt:latest,'') || null};
}
function update(state, version, data) {
 if(!VERSION.test(version))throw new Error('版本号格式应为 1.2.3，可附加 -beta 等预发布标记');
 if(!statuses.includes(data.status))throw new Error('无效的发布状态');
 if(data.minimumVersion!==undefined&&(!['android','mac','windows','linux'].includes(data.minimumPlatform)||!VERSION.test(data.minimumVersion)))throw new Error('请选择最低兼容版本的平台和有效版本号');
 if(data.minimumVersion!==undefined&&!(state.resourceDownloads||[]).some(item=>item.category==='client'&&item.version===data.minimumVersion&&item.platform===data.minimumPlatform&&(state.driveFiles||[]).some(file=>file.id===item.fileId&&file.scope==='public')))throw new Error('最低兼容版本必须已经有该平台安装包');
 if(data.recommended===true&&!['stable','testing'].includes(data.status))throw new Error('只能推荐已发布的稳定版或试用版');
 if(data.recommended===true&&!(state.resourceDownloads||[]).some(item=>item.category==='client'&&item.version===version&&(state.driveFiles||[]).some(file=>file.id===item.fileId&&file.scope==='public')))throw new Error('请先发布至少一个该版本安装包');
 state.clientReleases ||= [];
 let release=state.clientReleases.find(item=>item.version===version);
 if(!release){release={version,createdAt:new Date().toISOString()};state.clientReleases.push(release);}
 release.status=data.status;release.notes=String(data.notes===undefined?release.notes||'':data.notes||'').slice(0,5000);release.updatedAt=new Date().toISOString();
 if(data.recommended===true){if(!['stable','testing'].includes(data.status))throw new Error('只能推荐已发布的稳定版或试用版');state.settings.clientRecommendedVersion=version;}
 if(data.recommended===false&&state.settings.clientRecommendedVersion===version)state.settings.clientRecommendedVersion=null;
 if(data.status==='withdrawn'&&state.settings.clientRecommendedVersion===version)state.settings.clientRecommendedVersion=null;
 if(data.minimumVersion!==undefined){state.settings.clientMinimumVersions ||= {};state.settings.clientMinimumVersions[data.minimumPlatform]=data.minimumVersion;}
 return release;
}
function checkUpdate(state, params) {
 const platform=params.get('platform'), arch=params.get('arch'), installed=params.get('installed');
 if(!['android','mac','windows','linux'].includes(platform)||!['arm64','x64','universal'].includes(arch)||!VERSION.test(installed||''))throw new Error('无效的客户端版本或设备信息');
 const current=manifest(state),minimum=current.minimumByPlatform[platform] || null;
 const available=(state.resourceDownloads||[]).filter(item=>item.category==='client'&&item.platform===platform&&(item.architecture===arch||!item.architecture&&require('./resources').architecture((state.driveFiles||[]).find(file=>file.id===item.fileId)?.originalName||'')===arch||item.architecture==='universal'||require('./resources').architecture((state.driveFiles||[]).find(file=>file.id===item.fileId)?.originalName||'')==='universal')&&(state.driveFiles||[]).some(file=>file.id===item.fileId&&file.scope==='public')&&['stable','testing'].includes(current.releases.find(release=>release.version===item.version)?.status));
 const recommended=available.find(item=>item.version===current.recommendedByPlatform[platform])||available.sort((a,b)=>compare(b.version,a.version))[0];
 const release=current.releases.find(row=>row.version===recommended?.version),status=current.releases.find(row=>row.version===installed)?.status;
 return {platform,arch,installed,recommendedVersion:recommended?.version||null,minimumVersion:minimum,required:status==='withdrawn'||Boolean(minimum&&compare(installed,minimum)<0),updateAvailable:Boolean(recommended&&compare(recommended.version,installed)>0),notes:release?.notes||'',status:release?.status||null,resources:available.filter(item=>item.version===recommended?.version).map(item=>require('./resources').view(state,item))};
}
module.exports={VERSION,statuses,compare,manifest,update,checkUpdate};
