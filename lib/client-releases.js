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
 return {recommendedVersion:recommendation?.version || null,recommendedByPlatform,releases,updatedAt:releases.reduce((latest,item)=>item.updatedAt>latest?item.updatedAt:latest,'') || null};
}
function update(state, version, data) {
 if(!VERSION.test(version))throw new Error('版本号格式应为 1.2.3，可附加 -beta 等预发布标记');
 if(!statuses.includes(data.status))throw new Error('无效的发布状态');
 if(data.recommended===true&&!['stable','testing'].includes(data.status))throw new Error('只能推荐已发布的稳定版或试用版');
 if(data.recommended===true&&!(state.resourceDownloads||[]).some(item=>item.category==='client'&&item.version===version&&(state.driveFiles||[]).some(file=>file.id===item.fileId&&file.scope==='public')))throw new Error('请先发布至少一个该版本安装包');
 state.clientReleases ||= [];
 let release=state.clientReleases.find(item=>item.version===version);
 if(!release){release={version,createdAt:new Date().toISOString()};state.clientReleases.push(release);}
 release.status=data.status;release.notes=String(data.notes===undefined?release.notes||'':data.notes||'').slice(0,5000);release.updatedAt=new Date().toISOString();
 if(data.recommended===true){if(!['stable','testing'].includes(data.status))throw new Error('只能推荐已发布的稳定版或试用版');state.settings.clientRecommendedVersion=version;}
 if(data.recommended===false&&state.settings.clientRecommendedVersion===version)state.settings.clientRecommendedVersion=null;
 if(data.status==='withdrawn'&&state.settings.clientRecommendedVersion===version)state.settings.clientRecommendedVersion=null;
 return release;
}
module.exports={VERSION,statuses,compare,manifest,update};
