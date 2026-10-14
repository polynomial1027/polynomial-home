const { app, BrowserWindow, Menu, dialog, shell, ipcMain }=require('electron');
const fs=require('node:fs'),path=require('node:path');
const {DEFAULT_SERVER,origin,sameServer,connectionPage}=require('./policy.cjs');
let window,server=DEFAULT_SERVER;
function readServer(){try{server=origin(JSON.parse(fs.readFileSync(path.join(app.getPath('userData'),'server.json'),'utf8')).server);}catch{server=DEFAULT_SERVER;}}
function openApp(){window.loadURL(`${server}/app.html`);}
function connectScreen(){window.loadFile(path.join(__dirname,'connect.html'));}
app.whenReady().then(()=>{
 readServer();const installed=app.getVersion();const clientPlatform=process.platform==='darwin'?'mac':process.platform==='win32'?'windows':'linux';
 const updateUrl=()=>`${server}/download.html?installed=${encodeURIComponent(installed)}&platform=${clientPlatform}&arch=${process.arch}`;
 const {session}=require('electron');session.defaultSession.setUserAgent(session.defaultSession.getUserAgent()+` PolynomialClient/${installed} (${clientPlatform}; ${process.arch})`);
 window=new BrowserWindow({width:1280,height:850,minWidth:420,minHeight:600,title:'Polynomial',backgroundColor:'#f4f6fa',icon:path.join(__dirname,'icon.png'),webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,preload:path.join(__dirname,'preload.cjs')}});
 const safeExternal=url=>{try{if(['https:','mailto:'].includes(new URL(url).protocol))shell.openExternal(url);}catch{}};
 window.webContents.setWindowOpenHandler(({url})=>{if(sameServer(url,server))window.loadURL(url);else safeExternal(url);return {action:'deny'};});
 window.webContents.on('will-navigate',(event,url)=>{if(!sameServer(url,server)){event.preventDefault();safeExternal(url);}});
 window.webContents.session.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
 window.webContents.on('did-fail-load',(_event,code,_description,url,isMain)=>{if(isMain&&code!==-3&&sameServer(url,server))connectScreen();});
 window.webContents.session.on('will-download',(_event,item)=>{item.setSaveDialogOptions({title:'保存下载文件',defaultPath:path.join(app.getPath('downloads'),item.getFilename())});});
 ipcMain.handle('connect-server',(event,value)=>{if(event.sender!==window.webContents || !connectionPage(event.senderFrame.url,path.join(__dirname,'connect.html')))throw new Error('来源不允许');server=origin(value);fs.writeFileSync(path.join(app.getPath('userData'),'server.json'),JSON.stringify({server}),{mode:0o600});openApp();return true;});
 ipcMain.handle('get-server',event=>{if(event.sender!==window.webContents || !connectionPage(event.senderFrame.url,path.join(__dirname,'connect.html')))throw new Error('来源不允许');return server;});
 Menu.setApplicationMenu(Menu.buildFromTemplate([{label:'Polynomial',submenu:[{label:'个人空间',click:openApp},{label:'资源下载',click:()=>window.loadURL(`${server}/download.html`)},{label:'检查软件更新',click:()=>window.loadURL(updateUrl())},{label:`关于 Polynomial · ${installed}`,click:()=>dialog.showMessageBox(window,{type:'info',title:'Polynomial',message:`Polynomial ${installed}`,detail:`${clientPlatform} · ${process.arch}\n账号与数据连接至你的服务器。`,buttons:['确定','检查更新']}).then(result=>{if(result.response===1)window.loadURL(updateUrl());})},{label:'连接设置',click:connectScreen},{type:'separator'},{role:process.platform==='darwin'?'quit':'close'}]},{label:'导航',submenu:[{label:'返回',accelerator:'Alt+Left',click:()=>window.webContents.navigationHistory.goBack()},{role:'reload'},{role:'togglefullscreen'}]},{label:'编辑',submenu:[{role:'undo'},{role:'redo'},{role:'cut'},{role:'copy'},{role:'paste'},{role:'selectAll'}]}]));
 openApp();app.on('activate',()=>{if(window)window.show();});
});
app.on('window-all-closed',()=>app.quit());
