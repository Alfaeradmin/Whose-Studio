'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {getConfig,persistVerifiedHints}=require('../lib/kiot-inbox-store');
const env={SUPABASE_URL:'https://fjauxxunyxxboduyxjyr.supabase.co/',WHOSE_CONNECTOR_SERVICE_ROLE_KEY:'a'.repeat(60)};
const hint={retailer:'whose',domain:'products',entity_key:'1',event_key:'a'.repeat(64),payload_digest:'b'.repeat(64)};
test('private service credentials are required',async()=>{
 assert.equal(getConfig({}),null);
 assert.equal(getConfig({...env,SUPABASE_URL:'https://wrong.supabase.co/'}),null);
 await assert.rejects(persistVerifiedHints([hint],{env:{},fetchImpl:()=>{throw Error('network called');}}),/NOT_CONFIGURED/);
});
test('only reports persisted after valid database response',async()=>{
 let calls=0;
 const fetchImpl=async(url,opts)=>{
  calls++;
  assert.match(url,/\/rpc\/whose_connector_ingest_hints$/);
  assert.equal(opts.method,'POST');
  return {ok:true,json:async()=>({received:1,inserted:1,duplicates:0})};
 };
 assert.deepEqual(await persistVerifiedHints([hint],{env,fetchImpl}),{received:1,inserted:1,duplicates:0});
 assert.equal(calls,1);
 await assert.rejects(persistVerifiedHints([hint],{env,fetchImpl:async()=>({ok:false,status:503})}),/PERSIST_FAILED/);
});
