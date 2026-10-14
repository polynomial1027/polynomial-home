const DEFAULT_SERVER = 'https://polynomial-server.tail722ac8.ts.net';
function origin(value) { const url = new URL(value); if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('请输入不含账号、路径和参数的 HTTPS 服务器地址');return url.origin; }
function sameServer(value, base) { try {return new URL(value).origin===base;} catch{return false;} }
module.exports={DEFAULT_SERVER,origin,sameServer};
