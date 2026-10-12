'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {handleOnce}=require('../lib/kiot-inbox-worker');
const env={SUPABASE_URL:'https://fjauxxunyxxboduyxjyr.supabase.co/',WHOSE_CONNECTOR_SERVICE_ROLE_KEY:'a'.repeat(60)};
test('worker makes only read calls and does not falsely complete an unimplemented sync',async()=>{
 const calls=[];
 const fetchImpl=async(url,opt)=>{
  calls.push({url,body:JSON.parse(opt.body)});
  if(url.endsWith('claim_inbox'))return {ok:true,json:async()=>[{id:1,domain:'products',entity_key:'3',lease_token:'00000000-0000-4000-8000-000000000001'}]};
  return {ok:true,json:async()=>true};
 };
 const r=await handleOnce({env,fetchImpl,providerRead:async()=>({ok:true,data:{id:3}})});
 assert.deepEqual(r,{claimed:1,processed:0,retry:1});
 assert.equal(calls[1].body.p_success,false);
 assert.equal(calls[1].body.p_error_code,'CANONICAL_PERSIST_NOT_IMPLEMENTED');
});
