// Loaded only by the isolated browser fixture process, never production.
const original=globalThis.fetch;
globalThis.fetch=async(input,options={})=>{
 const url=new URL(typeof input==='string'?input:input.url||String(input));
 if(url.hostname!=='api.deepseek.com')return original(input,options);
 if(url.pathname!=='/chat/completions')throw new Error('Unexpected fixture provider endpoint');
 const request=JSON.parse(options.body),last=request.messages.filter(m=>m.role==='user').at(-1)?.content||'';
 const content=request.messages[0]?.content.includes('巡检')?JSON.stringify({summary:'模拟巡检完成',risk:'normal',actions:[]}):request.response_format?.type==='json_object'?JSON.stringify({reply:'模拟模型已整理安排',plans:[{title:'模拟计划任务',dueAt:new Date(Date.now()+86400000).toISOString()}]}):`模拟模型回复：${last.slice(0,180)}。公式：$a^2+b^2=c^2$。`;
 return new Response(JSON.stringify({choices:[{message:{content}}],usage:{total_tokens:42,prompt_tokens:30,completion_tokens:12,prompt_cache_hit_tokens:0,prompt_cache_miss_tokens:30}}),{status:200,headers:{'Content-Type':'application/json'}});
};
