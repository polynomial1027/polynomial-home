// Loaded only by the isolated browser fixture process, never production.
const original=globalThis.fetch;
globalThis.fetch=async(input,options={})=>{
 const url=new URL(typeof input==='string'?input:input.url||String(input));
 if(url.hostname!=='api.deepseek.com')return original(input,options);
 if(url.pathname==='/v1/tools/search')return Response.json({results:[{url:'https://library.keqingmains.com/combat-mechanics/damage/damage-formula',title:'模拟机制资料',content:'测试资料：攻击力、增伤、暴击、防御与抗性共同影响伤害。'}]});
 if(url.pathname==='/v1/tools/fetch')return Response.json({content:'测试资料：攻击力、增伤、暴击、防御与抗性共同影响伤害。'});
 if(url.pathname!=='/chat/completions')throw new Error('Unexpected fixture provider endpoint');
 const request=JSON.parse(options.body),last=request.messages.filter(m=>m.role==='user').at(-1)?.content||'';
 if(request.messages[0]?.content.includes('原神专业资料检索测试助手')){const sources=JSON.parse(last).sources,source=sources.find(s=>s.id==='server-calculation')||sources.find(s=>s.title==='浏览器测试手册')||sources[0];return Response.json({choices:[{message:{content:JSON.stringify({claims:[{text:'根据导入资料核对机制。',sourceId:source.id,quote:source.content}],missing:['角色与技能具体数据仍待补充']})}}],usage:{total_tokens:42,prompt_tokens:30,completion_tokens:12}});}
 const content=request.messages[0]?.content.includes('巡检')?JSON.stringify({summary:'模拟巡检完成',risk:'normal',actions:[]}):request.response_format?.type==='json_object'?JSON.stringify({reply:'模拟模型已整理安排',plans:[{title:'模拟计划任务',dueAt:new Date(Date.now()+86400000).toISOString()}]}):`模拟模型回复：${last.slice(0,180)}。公式：$a^2+b^2=c^2$。`;
 return new Response(JSON.stringify({choices:[{message:{content}}],usage:{total_tokens:42,prompt_tokens:30,completion_tokens:12,prompt_cache_hit_tokens:0,prompt_cache_miss_tokens:30}}),{status:200,headers:{'Content-Type':'application/json'}});
};
