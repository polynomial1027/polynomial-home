const base=require('@playwright/test');
const test=base.test.extend({
  buttonAudit:[async({context},use,info)=>{
    const actions=[];
    await context.exposeBinding('__recordButton',(_,entry)=>actions.push(entry));
    await context.addInitScript(()=>{
      document.addEventListener('click',event=>{const node=event.target.closest('button,summary,a,input[type=submit]');if(!node)return;window.__recordButton({page:location.pathname,id:node.id||null,tag:node.tagName,label:(node.getAttribute('aria-label')||node.textContent||'').trim().slice(0,90),data:Object.fromEntries(Object.entries(node.dataset).filter(([key])=>!key.startsWith('i18n'))),href:node.getAttribute('href')||null});},true);
    });
    await use(actions);await info.attach('button-actions',{body:JSON.stringify({test:info.title,status:info.status,actions},null,2),contentType:'application/json'});
    require('node:fs').writeFileSync(info.outputPath('button-actions.json'),JSON.stringify({test:info.title,status:info.status,actions},null,2));
  },{auto:true}]
});
module.exports={test,expect:base.expect};
