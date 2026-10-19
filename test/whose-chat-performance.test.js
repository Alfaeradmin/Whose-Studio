const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const chatHandler=require('../api/whose-chat');

const branch='123e4567-e89b-42d3-a456-426614174000';
const otherBranch='123e4567-e89b-42d3-a456-426614174009';
const id='123e4567-e89b-42d3-a456-426614174001';
function response(){
 return {headers:{},statusCode:null,body:null,
  setHeader(name,value){this.headers[name.toLowerCase()]=value;return this},
  status(code){this.statusCode=code;return this},
  json(data){this.body=data;return this}};
}
function providerFixture(admin=true){
 const requested=[],active={total:0,auth:0,read:0},peak={auth:0,read:0};
 const respond=async(url,options)=>{
  const u=new URL(url),s=u.pathname,auth=s.startsWith('/auth/v1/');
  const phase=auth||s.includes('whose_staff_memberships')||s.includes('whose_my_global_admin')||s.includes('whose_branches')?'auth':'read';
  requested.push(s);active[phase]++;peak[phase]=Math.max(peak[phase],active[phase]);active.total++;
  await new Promise(resolve=>setImmediate(resolve));
  active[phase]--;active.total--;
  let data=[];
  if(auth)data={id:'123e4567-e89b-42d3-a456-426614174010',email:'staff@example.test'};
  else if(s.includes('whose_staff_memberships'))data=[];
  else if(s.includes('whose_my_global_admin'))data=admin;
  else if(s.includes('whose_branches'))data=[{id:branch,is_active:true,code:'LVS',name:'WHOSE STUDIO LVS'}];
  else if(s.includes('whose_department_chat_lines'))data=[{id:'line',chat_id:id,sku:'AA',qty_requested:1}];
  else if(s.includes('whose_department_chat_events'))data=[{id:1,chat_id:id,event_type:'created',body:'Call',created_at:'2026-10-19T01:00:00Z'}];
  else if(s.includes('whose_department_chats')){
   const query=u.searchParams.get('id');
   data=[{id,branch_id:query?.endsWith(otherBranch)?otherBranch:branch,status:'submitted',purpose:'Khách thử',updated_at:'2026-10-19T01:00:00Z'}];
  }else throw Error('Unexpected backend lookup '+s);
  return {ok:true,status:200,text:async()=>JSON.stringify(data)};
 };
 return {respond,requested,peak};
}
async function runFixture(admin,query){
 const oldFetch=global.fetch,url=process.env.SUPABASE_URL,key=process.env.SUPABASE_PUBLISHABLE_KEY;
 const fixture=providerFixture(admin);
 try{
  process.env.SUPABASE_URL='https://fjauxxunyxxboduyxjyr.supabase.co/';
  process.env.SUPABASE_PUBLISHABLE_KEY='sb_publishable_fixture';
  global.fetch=fixture.respond;
  const res=response();
  await chatHandler({method:'GET',headers:{authorization:'Bearer fixture-token'},query},res);
  return {res,fixture};
 }finally{
  global.fetch=oldFetch;
  if(url===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=url;
  if(key===undefined)delete process.env.SUPABASE_PUBLISHABLE_KEY;else process.env.SUPABASE_PUBLISHABLE_KEY=key;
 }
}
test('detail loads authorized thread, lines and history in ONE query wave after auth',async()=>{
 const {res,fixture}=await runFixture(true,{chat_id:id});
 assert.equal(res.statusCode,200);
 assert.equal(res.body.thread.id,id);
 assert.equal(res.body.lines.length,1);
 assert.equal(res.body.events.length,1);
 assert.equal(fixture.peak.auth,4,'4 independent auth lookups run together');
 assert.equal(fixture.peak.read,3,'authorized chat read uses one parallel wave');
 assert.match(res.headers['server-timing'],/^auth;dur=\d+(?:\.\d+)?,read;dur=\d+(?:\.\d+)?$/);
});
test('unauthorized staff has no access to branch list or another branch details',async()=>{
 const denied=await runFixture(false,{branch_id:branch});
 assert.equal(denied.res.statusCode,403);
 const other=await runFixture(true,{chat_id:otherBranch});
 assert.equal(other.res.statusCode,404);
 assert.equal(other.res.body.events,undefined);
 assert.equal(other.res.body.lines,undefined);
});
test('list includes timing metrics, private no-store and branch-only data',async()=>{
 const {res}=await runFixture(true,{branch_id:branch});
 assert.equal(res.statusCode,200);
 assert.ok(Array.isArray(res.body.rows));
 assert.match(res.headers['server-timing'],/^auth;dur=.*read;dur=/);
 assert.equal(res.headers['cache-control'],'private, no-store');
});
test('client cache respects staff branch scope and invalidates across changes',()=>{
 const browser=fs.readFileSync(path.join(__dirname,'..','calling-chat-box.js'),'utf8');
 assert.match(browser,/const cacheKey=id=>scopeKey\(\)\+':'\+id/);
 assert.match(browser,/const CACHE_FRESH_MS=9000/);
 assert.match(browser,/detailCache\.get\(cacheKey\(id\)\)/);
 assert.match(browser,/currentRow\.updated_at===cached\.data\.thread\.updated_at/);
 assert.match(browser,/detailCache\.delete\(cacheKey\(before\)\);inboxFetchedAt=0/);
 assert.match(browser,/detailCache\.clear\(\);historyExpanded\.clear\(\)/);
 assert.match(browser,/if\(ticket!==refreshTicket\|\|epoch!==authEpoch\|\|branch\(\)\?\.id!==b\.id\)return/);
 assert.doesNotMatch(browser,/localStorage\.setItem\(.*chat/i);
});
