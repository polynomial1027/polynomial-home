const {contextBridge,ipcRenderer}=require('electron');
// The remote server receives no native bridge. Only the bundled connection screen can access these two calls.
if(location.protocol==='file:')contextBridge.exposeInMainWorld('polynomialConnection',{get:()=>ipcRenderer.invoke('get-server'),connect:value=>ipcRenderer.invoke('connect-server',value)});
