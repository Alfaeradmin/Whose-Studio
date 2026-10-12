'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {handleOnce}=require('../lib/kiot-inbox-worker');
const env={SUPABASE_URL:'https://fjauxxunyxxboduyxjyr.supabase.co/',WHOSE_CONNECTOR_SERVICE_ROLE_KEY:'a'.repeat(60)};
const job={id:1,domain:'products',entity_key:'3',lease_token:'00000000-0000-4000-8000-000000000001'};
test('acknowledges only after validated product is persisted',async()=>{
 const calls=[];
 const fetchImpl=async(url,opt)=>{
  const name=url.split('/').pop();const body=JSON.parse(opt.body);calls.push({name,body});
  return {ok:true,json:async()=>name==='whose_connector_claim_inbox'?[job]:name==='whose_connector_store_product'?true:true};
 };
 const reads=[];
 const result=await handleOnce({env,fetchImpl,providerRead:async(path)=>{reads.push(path);return {ok:true,data:{id:3,code:'SKU3',name:'Product 3'}};}});
 assert.deepEqual(reads,['products/3']);
 assert.deepEqual(result,{claimed:1,processed:1,retry:0});
 assert.deepEqual(calls.map(x=>x.name),['whose_connector_claim_inbox','whose_connector_store_product','whose_connector_finish_inbox']);
 assert.equal(calls.at(-1).body.p_success,true);
});
test('never acknowledges wrong product ID',async()=>{
 const calls=[];
 const fetchImpl=async(url,opt)=>{
  const name=url.split('/').pop();calls.push({name,body:JSON.parse(opt.body)});
  return {ok:true,json:async()=>name==='whose_connector_claim_inbox'?[job]:true};
 };
 const result=await handleOnce({env,fetchImpl,providerRead:async()=>({ok:true,data:{id:4,code:'SKU4',name:'Wrong'}})});
 assert.deepEqual(result,{claimed:1,processed:0,retry:1});
 assert.equal(calls.some(c=>c.name==='whose_connector_store_product'),false);
 assert.equal(calls.at(-1).body.p_success,false);
});
