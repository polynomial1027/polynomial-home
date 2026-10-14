const test = require('node:test');
const assert = require('node:assert/strict');
const { sendChat } = require('../lib/chat-service');
const records = require('../lib/ai-records');
const assistant = require('../lib/assistant');
const { priceWindow } = require('../lib/pricing');

const settings = { assistantMaxOutputTokens: 128, assistantDailyTokens: 1000000, assistantMonthlyTokens: 1000000, assistantDailyRequests: 1000, assistantMonthlyRequests: 1000, assistantDefaultUserDailyTokens: 1000000, assistantDefaultUserMonthlyTokens: 1000000, assistantDefaultUserDailyRequests: 1000, assistantDefaultUserMonthlyRequests: 1000 };
const user = { id: 'alice', username: 'alice', displayName: 'Alice' };
const fixture = () => ({ users:[user,{id:'bob'}],settings,assistantChats:[],assistantUsage:[],plannerItems:[] });
const usage = { totalTokens:110, inputTokens:100, outputTokens:10, cacheHitTokens:80, cacheMissTokens:20, reasoningTokens:4 };

test('chat records exact context, provider usage and response, without API credentials',async()=>{
  const state=fixture();state.assistantChats.push({userId:'alice',role:'user',content:'previous question'},{userId:'alice',role:'assistant',content:'previous reply'});
  let actual;
  await sendChat({state,save:()=>{},user,value:'hello',key:'secret-key',model:'deepseek-flash',complete:async args=>{actual=args.messages;return {content:'answer',rawContent:'answer',tokens:110,usage};}});
  const r=state.assistantUsage[0];assert.deepEqual(r.detail.messages,actual);assert.equal(r.detail.response,'answer');assert.equal(r.detail.displayedResponse,'answer');assert.equal(r.tokenBasis,'provider');assert.equal(r.tokens,110);assert.equal(state.assistantChats.at(-1).usageRecordId,r.id);assert.ok(!JSON.stringify(r).includes('secret-key'));
  const result=records.list(state,new URLSearchParams({date:assistant.dayKey(),userId:'alice'}));
  assert.equal(result.summary.providerTokens,110);assert.equal(result.summary.inputTokens,100);assert.equal(result.summary.outputTokens,10);
  assert.equal(result.records[0].detail,undefined);assert.equal(records.detail(state,r.id).detail.response,'answer');
});

test('failures retain reservations and unknown cost while recording attempted prompt',async()=>{
  const state=fixture();await assert.rejects(sendChat({state,save:()=>{},user,value:'hello',key:'secret',model:'deepseek-flash',complete:async()=>{throw new Error('HTTP 503');}}));
  const r=state.assistantUsage[0];assert.equal(r.status,'failed');assert.equal(r.tokens,r.reservedTokens);assert.equal(r.tokenBasis,'reservation');assert.equal(r.detail.error,'HTTP 503');assert.equal(records.cost(r),null);
});

test('zero provider tokens remain zero, and missing usage is never called actual billing',async()=>{
  const state=fixture();await sendChat({state,save:()=>{},user,value:'hello',key:'x',model:'deepseek-flash',complete:async()=>({content:'answer',tokens:0,usage:{...usage,totalTokens:0,inputTokens:0,outputTokens:0,cacheHitTokens:0,cacheMissTokens:0}})});
  assert.equal(state.assistantUsage[0].tokens,0);assert.equal(state.assistantUsage[0].tokenBasis,'provider');
  await sendChat({state,save:()=>{},user,value:'hello',key:'x',model:'deepseek-flash',complete:async()=>({content:'answer',tokens:null,usage:{totalTokens:null}})});
  assert.equal(state.assistantUsage[1].tokens,state.assistantUsage[1].reservedTokens);assert.equal(state.assistantUsage[1].tokenBasis,'reservation');
});

test('cost uses stored peak snapshot and never invents missing cache counts',()=>{
  const r={detail:{usage,pricing:priceWindow(new Date('2026-10-14T09:00:00+08:00'),'deepseek-flash')}};
  assert.ok(Math.abs(records.cost(r).total-(80*.04+20*2+10*8)/1e6)<1e-12);
  r.detail.usage={...usage,cacheMissTokens:null};assert.equal(records.cost(r),null);
});

test('Beijing day bounds, pagination and legacy chat retrieval never confuse users or days',()=>{
  const state=fixture();
  for(let i=0;i<27;i++)state.assistantUsage.push({id:String(i),userId:'alice',day:'2026-10-14',tokens:3,at:'2026-10-13T16:00:00Z',status:'completed'});
  state.assistantUsage.push({id:'other',userId:'bob',day:'2026-10-14',tokens:100,at:'2026-10-14T01:00:00Z'});
  state.assistantChats=[{userId:'alice',at:'2026-10-13T16:00:00Z',role:'user',content:'legacy'},{userId:'alice',at:'2026-10-14T16:00:00Z',content:'tomorrow'},{userId:'bob',at:'2026-10-14T01:00:00Z',content:'bob'}];
  const r=records.list(state,new URLSearchParams({date:'2026-10-14',userId:'alice',page:'2'}));assert.equal(r.records.length,2);assert.equal(r.total,27);assert.equal(r.summary.quotaTokens,81);assert.equal(r.summary.unknownCostRequests,27);assert.equal(r.legacyChatCount,1);assert.equal(r.windowStart,'2026-10-13T16:00:00.000Z');assert.equal(r.windowEndExclusive,'2026-10-14T16:00:00.000Z');
  assert.throws(()=>records.list(state,new URLSearchParams({date:'2026-02-30'})));assert.throws(()=>records.list(state,new URLSearchParams({userId:'unknown'})));assert.throws(()=>records.list(state,new URLSearchParams({page:'-1'})));
});
