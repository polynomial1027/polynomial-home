(() => {
 const $=id=>document.querySelector(id),esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const labels={planned:'计划中',building:'构建中',testing:'已发布 · 试用版',stable:'已发布 · 稳定版',withdrawn:'停止分发'};
 const platforms={android:'Android',ios:'iOS',mac:'macOS',windows:'Windows',linux:'Linux',other:'其他'};
 const fileSize=bytes=>bytes<1048576?`${Math.round(bytes/1024)} KB`:`${(bytes/1048576).toFixed(1)} MB`;
 const downloads=new Map();
 let resources=[],releases={releases:[]},admin=false,category='client';
 const query=new URLSearchParams(location.search),reported=navigator.userAgent.match(/PolynomialClient\/([\w.-]+) \((\w+); ([\w-]+)\)/);
 const installed=reported?.[1]||query.get('installed'),installedPlatform=reported?.[2]||query.get('platform'),installedArch=reported?.[3]||query.get('arch');
 const devicePlatform=/Android/i.test(navigator.userAgent)?'android':/iPhone|iPad|iPod/i.test(navigator.userAgent)||(/Macintosh/i.test(navigator.userAgent)&&navigator.maxTouchPoints>1)?'ios':/Windows/i.test(navigator.userAgent)?'windows':/Macintosh|Mac OS X/i.test(navigator.userAgent)?'mac':/Linux/i.test(navigator.userAgent)?'linux':null;
 if(devicePlatform)$('#resourcePlatform').value=devicePlatform;
 if(platforms[installedPlatform])$('#resourcePlatform').value=installedPlatform;
 if(['arm64','x64','universal'].includes(installedArch))$('#resourceArch').value=installedArch;
 function recommended(){return $('#resourcePlatform').value==='all'?releases.recommendedVersion:releases.recommendedByPlatform?.[$('#resourcePlatform').value] || null;}
 function overview(){
  const minimum=releases.minimumByPlatform?.[$('#resourcePlatform').value];
  const recommendation=releases.releases.find(item=>item.version===recommended()),current=releases.releases[0];
  let update='';
  if(installed){const known=releases.releases.find(item=>item.version===installed);update=`你报告的已安装版本：v${esc(installed)} · ${esc(platforms[installedPlatform]||'客户端')}${installedArch?' · '+esc(installedArch):''}。${known?.status==='withdrawn'?'此版本已停止分发，请升级。':recommended()===installed?'你正在使用当前推荐版本。':recommended()?'可查看推荐版本的说明，再选择是否下载安装。':'暂无已发布的推荐安装包。'}`;}
  else update=/Electron\//.test(navigator.userAgent)?'早期桌面客户端未报告安装版本，请在应用菜单查看；下方版本号表示可下载的软件版本。':'网页 / 主屏幕界面会联网更新；它的界面版本与原生安装包版本分别标记。';
  $('#releaseOverview').innerHTML=`<strong>${recommendation?`当前推荐：v${esc(recommendation.version)}`:'当前暂无可下载的推荐安装包'}</strong><p>${recommendation?esc(labels[recommendation.status])+' · 已提供 '+recommendation.platforms.map(p=>platforms[p]).join(' / '):'iPhone / iPad 可先使用上方主屏幕安装。'}${current?`<br>最新版本记录：v${esc(current.version)} · ${esc(labels[current.status])} · 更新于 ${esc(new Date(current.updatedAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'}))}（北京时间）`:''}</p><p class="installed">${update}</p>${minimum?`<p>此平台最低兼容版本：v${esc(minimum)}</p>`:''}<a href="/announcements.html">查看全站更新公告 ↗</a>`;
 }
 function render(){
  overview();
  const platform=$('#resourcePlatform').value,arch=$('#resourceArch').value,choice=$('#resourceRelease').value,version=choice==='recommended'?recommended():choice;
  const list=resources.filter(item=>(category==='all'||item.category===category)&&(platform==='all'||item.platform===platform)&&(item.category!=='client'||arch==='all'||item.architecture===arch||item.architecture==='universal')&&(item.category!=='client'||choice==='all'||item.version===version));
  $('#resourceHeading').textContent=category==='resource'?'共享资源':category==='all'?'全部下载':'客户端下载';$('.version-filters').hidden=category==='resource';
  const selected=releases.releases.find(item=>item.version===version);$('#releaseNotes').hidden=category==='resource'||!selected;$('#releaseNotes').textContent=selected?`v${selected.version} · ${labels[selected.status]}\n${selected.notes||'暂无补充说明。'}`:'';
  $('#resourceList').innerHTML=list.length?list.map(item=>`<article class="resource-card"><span class="resource-platform">${platforms[item.platform]||'其他'} · ${esc(item.architecture==='universal'?'通用':item.architecture)} · v${esc(item.version||'未标注')}</span>${item.releaseStatus?`<div><span class="release-badge ${esc(item.releaseStatus)}">${esc(labels[item.releaseStatus])}${item.version===recommended()?' · 当前推荐':' · 历史/可选版本'}</span></div>`:''}<h3>${esc(item.title)}</h3><p>${esc(item.description)}</p><div class="resource-meta">${esc(item.fileName)}<br>${fileSize(item.size)} · ${new Date(item.createdAt).toLocaleDateString('zh-CN')}</div>${item.sha256?`<code>SHA-256: ${esc(item.sha256)}</code>`:''}${item.downloadUrl?`<button class="button" data-download-resource="${item.id}">下载 ${item.category==='client'?'v'+esc(item.version):''} ↓</button><a class="download-direct" href="${esc(item.downloadUrl)}">使用系统下载 ↗</a>`:'<span class="download-disabled">此版本暂不提供下载，请选择推荐版本。</span>'}${admin?`<button class="unpublish" data-unpublish="${item.id}">从下载中心下架</button>`:''}</article>`).join(''):`<div class="resource-empty">${selected?`v${esc(selected.version)} 当前为“${esc(labels[selected.status])}”；此平台和芯片暂无可下载文件。`:'此筛选暂无资源。可切换版本、平台或芯片。'}iPhone / iPad 可按上方指引安装主屏幕应用。</div>`;
  syncButtons();
  document.querySelectorAll('[data-unpublish]').forEach(button=>button.onclick=async()=>{try{await request(`/api/downloads/${button.dataset.unpublish}`,{method:'DELETE'});await refresh();}catch(error){$('#downloadNotice').textContent=error.message;}});
 }
 function syncButtons(){document.querySelectorAll('[data-download-resource]').forEach(button=>{button.disabled=downloads.has(button.dataset.downloadResource);});}
 $('#downloadTasks').addEventListener('click',event=>{const cancel=event.target.closest('[data-cancel-download]');if(cancel)downloads.get(cancel.dataset.cancelDownload)?.abort();});
 $('#resourceList').addEventListener('click',async event=>{
  const cancel=event.target.closest('[data-cancel-download]');if(cancel){downloads.get(cancel.dataset.cancelDownload)?.abort();return;}
  const button=event.target.closest('[data-download-resource]');if(!button)return;
  const item=resources.find(row=>row.id===button.dataset.downloadResource);if(!item?.downloadUrl||downloads.has(item.id))return;
  $('#downloadTasks').hidden=false;
  let panel=$(`#download-${item.id}`);
  if(!panel){panel=document.createElement('article');panel.id=`download-${item.id}`;panel.className='download-progress';$('#downloadTaskList').prepend(panel);}
  panel.innerHTML=`<strong>${esc(item.title)} · ${esc(item.fileName)}</strong><progress max="100" value="0" aria-label="下载进度"></progress><span role="status"></span><button class="download-cancel" data-cancel-download="${item.id}" hidden>取消下载</button>`;
  const label=panel.querySelector('span'),progress=panel.querySelector('progress'),stop=panel.querySelector('button');
  if(reported||item.size>100*1048576){label.textContent='已交给系统下载。安装前可核对上方 SHA-256；账号数据保存在服务器。';location.href=item.downloadUrl;return;}
  const controller=new AbortController();downloads.set(item.id,controller);button.disabled=true;stop.hidden=false;
  try{
   label.textContent='正在连接下载…';const response=await fetch(item.downloadUrl,{signal:controller.signal});if(!response.ok)throw new Error('下载失败，请刷新版本状态后重试');
   const total=Number(response.headers.get('Content-Length'))||item.size;const chunks=[];let received=0;
   const reader=response.body.getReader();while(true){const {done,value}=await reader.read();if(done)break;chunks.push(value);received+=value.byteLength;if(received>100*1048576){controller.abort();throw new Error('文件超过页面下载容量，请使用系统下载');}progress.value=total?Math.min(100,received/total*100):0;label.textContent=`已下载 ${fileSize(received)} / ${fileSize(total)}`;}
   const blob=new Blob(chunks,{type:'application/octet-stream'});if(total&&received!==total)throw new Error('文件大小不匹配，请重新下载');
   if(item.sha256){label.textContent='正在校验安装包…';const bytes=await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()),actual=[...new Uint8Array(bytes)].map(byte=>byte.toString(16).padStart(2,'0')).join('');if(actual!==item.sha256)throw new Error('SHA-256 校验失败，已阻止保存，请重新下载');}
   const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=item.fileName;link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);progress.value=100;label.textContent=item.sha256?'下载完成 · SHA-256 校验通过，请打开保存的安装包。':'下载完成；此历史文件未提供校验值。';
  }catch(error){label.textContent=error.name==='AbortError'?'下载已取消，可重新开始。':error.message;}
  finally{downloads.delete(item.id);syncButtons();stop.hidden=true;}
 });
 async function refresh(){if(downloads.size)return;const result=await request('/api/downloads');resources=result.resources;releases=result.releases||{releases:[],recommendedVersion:null};const previous=$('#resourceRelease').value;$('#resourceRelease').innerHTML='<option value="recommended">当前推荐版本</option><option value="all">全部版本</option>'+releases.releases.map(item=>`<option value="${esc(item.version)}">v${esc(item.version)} · ${esc(labels[item.status])}</option>`).join('');if([...$('#resourceRelease').options].some(item=>item.value===previous))$('#resourceRelease').value=previous;overview();render();}
 document.querySelectorAll('[data-category]').forEach(button=>button.onclick=()=>{category=button.dataset.category;document.querySelectorAll('[data-category]').forEach(item=>item.classList.toggle('active',item===button));render();});
 ['#resourcePlatform','#resourceRelease','#resourceArch'].forEach(id=>$(id).onchange=render);
 $('#resourceForm').onsubmit=async event=>{event.preventDefault();const button=event.target.querySelector('button');button.disabled=true;try{await request('/api/downloads',{method:'POST',body:JSON.stringify({fileId:$('#resourceFile').value,title:$('#resourceTitle').value,description:$('#resourceDescription').value,platform:$('#publishPlatform').value,category:$('#resourceCategory').value,version:$('#resourceVersion').value})});$('#downloadNotice').textContent='资源已公开发布，历史版本保留。';await refresh();}catch(error){$('#downloadNotice').textContent=error.message;}finally{button.disabled=false;}};
 $('#releaseForm').onsubmit=async event=>{event.preventDefault();try{await request(`/api/client/releases/${encodeURIComponent($('#releaseVersion').value.trim())}`,{method:'PATCH',body:JSON.stringify({status:$('#releaseStatus').value,notes:$('#releaseChangeNotes').value,recommended:$('#releaseRecommended').checked,...($('#minimumClientVersion').value.trim()?{minimumVersion:$('#minimumClientVersion').value.trim(),minimumPlatform:$('#minimumClientPlatform').value}:{})})});$('#downloadNotice').textContent='版本状态与更新说明已保存。';await refresh();}catch(error){$('#downloadNotice').textContent=error.message;}};
 $('#minimumClientPlatform').onchange=()=>{$('#minimumClientVersion').value=releases.minimumByPlatform?.[$('#minimumClientPlatform').value]||'';};
 $('#releaseVersion').onchange=()=>{const release=releases.releases.find(item=>item.version===$('#releaseVersion').value.trim());if(release){$('#releaseStatus').value=release.status;$('#releaseChangeNotes').value=release.notes;$('#releaseRecommended').checked=release.version===releases.recommendedVersion;}};
 Promise.all([refresh(),request('/api/me')]).then(async([,account])=>{admin=account.user?.role==='admin';$('#resourceAdmin').hidden=!admin;if(admin){const drive=await request('/api/admin/drive');$('#resourceFile').innerHTML=drive.files.filter(file=>file.scope==='public').map(file=>`<option value="${file.id}">${esc(file.originalName)}</option>`).join('');render();}}).catch(error=>$('#downloadNotice').textContent=error.message);
 
 if('serviceWorker'in navigator)navigator.serviceWorker.register('/app-sw.js').catch(()=>{});setInterval(()=>{if(!document.hidden)refresh().catch(()=>{});},60000);
})();
