// Temporary, hash-pinned installer delivery. Disabled unless a private deployment manifest exists.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
function createDelivery(dataDir) {
 const manifestPath=path.join(dataDir,'client-delivery.json'),staging=path.join(dataDir,'client-staging'),active=new Set();
 return async function deliver(req,name) {
  let manifest;try{manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));}catch{return {status:404,error:'上传通道未开放'};}
  if(!Number.isFinite(Date.parse(manifest.expiresAt))||Date.now()>Date.parse(manifest.expiresAt))return {status:404,error:'上传通道已关闭'};
  const supplied=crypto.createHash('sha256').update(String(req.headers.authorization||'').replace(/^Bearer /,'')).digest('hex');
  if(!/^[a-f0-9]{64}$/.test(manifest.tokenHash||'')||!crypto.timingSafeEqual(Buffer.from(supplied,'hex'),Buffer.from(manifest.tokenHash,'hex')))return {status:401,error:'上传凭据无效'};
  const file=manifest.files?.find(item=>item.name===name);
  if(!file||!/^Polynomial-\d+\.\d+\.\d+-[A-Za-z0-9_.-]+$/.test(name)||!/^[a-f0-9]{64}$/.test(file.sha256)||!Number.isSafeInteger(file.size)||file.size<=0||file.size>500*1048576)return {status:404,error:'此文件未获准上传'};
  if(active.has(name))return {status:409,error:'此文件正在上传'};
  if(req.headers['content-length']&&Number(req.headers['content-length'])!==file.size)return {status:400,error:'文件大小不匹配'};
  active.add(name);fs.mkdirSync(staging,{recursive:true});const temp=path.join(staging,crypto.randomUUID()+'.partial');let output;
  try{
   output=fs.openSync(temp,'wx',0o600);const hash=crypto.createHash('sha256');let count=0;
   for await(const chunk of req){count+=chunk.length;if(count>file.size)return {status:413,error:'文件大小超出允许值'};hash.update(chunk);let offset=0;while(offset<chunk.length){const written=fs.writeSync(output,chunk,offset,chunk.length-offset);if(!written)throw new Error("short write");offset+=written;}}
   fs.closeSync(output);output=null;
   if(count!==file.size||hash.digest('hex')!==file.sha256)return {status:422,error:'文件校验不通过'};
   fs.renameSync(temp,path.join(staging,name));return {status:200,verified:true,name};
  }catch{return {status:400,error:'上传中断，请重试'};}
  finally{if(output!==undefined&&output!==null)try{fs.closeSync(output);}catch{}try{fs.unlinkSync(temp);}catch{}active.delete(name);}
 };
}
module.exports={createDelivery};
