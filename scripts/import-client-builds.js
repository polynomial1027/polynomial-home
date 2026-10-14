// Offline deployment tool: stop the application before running this importer.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {dataDir,save}=require('../lib/store'),resources=require('../lib/resources');
if(process.env.POLYNOMIAL_OFFLINE_IMPORT!=='1')throw new Error('请停止服务并设置 POLYNOMIAL_OFFLINE_IMPORT=1 后导入，避免覆盖在线状态');
const root=path.resolve(process.argv[2]||'');if(!process.argv[2]||!fs.statSync(root).isDirectory())throw new Error('需要安装包目录');
const state=JSON.parse(fs.readFileSync(path.join(dataDir,'store.json'),'utf8'));
const admin=state.users.find(user=>user.role==='admin'&&user.active);if(!admin)throw new Error('没有可用管理员');
const dir=path.join(dataDir,'drive');fs.mkdirSync(dir,{recursive:true});
function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?files(path.join(dir,entry.name)):[path.join(dir,entry.name)]);}
let added=0;
for(const source of files(root)){
 const name=path.basename(source);if(!/\.(apk|dmg|exe|AppImage|deb|zip)$/.test(name))continue;
 const platform=/\.apk$/.test(name)?'android':/-mac-/.test(name)?'mac':/-win-/.test(name)?'windows':/-linux-/.test(name)?'linux':null;if(!platform)continue;
 const sha256=crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex');if(state.resourceDownloads?.some(item=>item.sha256===sha256))continue;
 const id=crypto.randomUUID();fs.copyFileSync(source,path.join(dir,id));fs.chmodSync(path.join(dir,id),0o600);const size=fs.statSync(source).size;
 const displayName=platform==='android'?'Polynomial-0.3.0-android-test.apk':name;
 state.driveFiles.push({id,storedName:id,originalName:displayName,mimeType:'application/octet-stream',size,ownerId:admin.id,scope:'public',createdAt:new Date().toISOString()});
 const arch=name.includes('arm64')?'ARM64':name.includes('x64')?'x64':'';
 resources.publish(state,{fileId:id,title:`Polynomial · ${platform==='mac'?'macOS':platform==='windows'?'Windows':platform==='linux'?'Linux':'Android'} ${arch}`,platform,category:'client',version:'0.3.0',sha256,description:platform==='android'?'Android 10 及以上 · 测试签名 APK，可直接安装试用。正式版升级签名将在发布前配置。':`${arch} 试用客户端 · ${name.endsWith('.zip')?'解压后打开应用':name.endsWith('.dmg')?'打开镜像并将应用拖入 Applications':name.endsWith('.AppImage')?'赋予执行权限后运行':name.endsWith('.deb')?'适用于 Debian / Ubuntu':'运行安装程序'}。桌面版本尚未配置发布者签名。`},admin.id);added++;
}
save(state);console.log(`已向公共网盘和下载中心发布 ${added} 个安装包（不重复占用文件空间）`);
