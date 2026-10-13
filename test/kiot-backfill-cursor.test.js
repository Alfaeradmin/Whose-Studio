'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {getCursor,advanceCursor,normalizeCursor}=require('../lib/kiot-backfill-cursor');
const env={SUPABASE_URL:'https://fjauxxunyxxboduyxjyr.supabase.co/',
 WHOSE_CONNECTOR_SERVICE_ROLE_KEY:'sb_secret_'+'x'.repeat(50)};
const retailer='whose';
const domain='invoices';
function mock(reply,requests){
 return async(url,options)=>{
  requests.push({url,headers:options.headers,payload:JSON.parse(options.body)});
  return {ok:true,json:async()=>reply};
 };
}
test('missing checkpoint returns a durable zero-page start',async()=>{
 const requests=[];
 const cursor=await getCursor(retailer,domain,{env,fetchImpl:mock({
  nextPage:0,complete:false,lastTotal:null,lastRows:null,updatedAt:null
 },requests)});
 assert.equal(cursor.nextPage,0);
 assert.equal(cursor.complete,false);
 assert.equal(requests.length,1);
 assert.match(requests[0].url,/\/rpc\/whose_connector_backfill_cursor_status$/);
 assert.equal(requests[0].payload.p_domain,domain);
 assert.equal(requests[0].headers.apikey,env.WHOSE_CONNECTOR_SERVICE_ROLE_KEY);
 assert.equal(requests[0].headers.Authorization,undefined);
});
test('advance requires exact provider page size and expected server checkpoint',async()=>{
 const requests=[];
 const next=await advanceCursor(retailer,domain,0,53,50,{
  env,fetchImpl:mock({advanced:true,nextPage:1,complete:false},requests)});
 assert.deepEqual(next,{nextPage:1,complete:false,lastTotal:53,lastRows:50});
 assert.equal(requests[0].payload.p_expected_page,0);
 assert.equal(requests[0].payload.p_total,53);
 assert.equal(requests[0].payload.p_rows,50);
 assert.equal(requests[0].payload.p_complete,false);
 const last=await advanceCursor(retailer,domain,1,53,3,{
  env,fetchImpl:mock({advanced:true,nextPage:2,complete:true},requests)});
 assert.equal(last.complete,true);
 assert.equal(requests[1].payload.p_complete,true);
});
test('racing admins cannot acknowledge a stale checkpoint as success',async()=>{
 await assert.rejects(advanceCursor(retailer,domain,0,50,50,{
  env,fetchImpl:mock({advanced:false,reason:'STALE_OR_COMPLETE'},[])
 }),/BACKFILL_CURSOR_CONFLICT/);
});
test('malformed reply never appears as successful checkpoint',async()=>{
 await assert.rejects(getCursor(retailer,domain,{
  env,fetchImpl:mock({nextPage:'2',complete:false},[])
 }),/INVALID_CURSOR_REPLY/);
 await assert.rejects(advanceCursor(retailer,domain,0,50,50,{
  env,fetchImpl:mock({advanced:true,nextPage:99,complete:false},[])
 }),/INVALID_ADVANCE_ACK/);
 assert.throws(()=>normalizeCursor({nextPage:-1,complete:false}),/INVALID_CURSOR_REPLY/);
});
test('invalid cursor and public credentials are rejected without network calls',async()=>{
 const forbidden={...env,WHOSE_CONNECTOR_SERVICE_ROLE_KEY:'sb_publishable_'+'x'.repeat(45)};
 let calls=0;const fetchImpl=()=>{calls++;throw Error('Network should never run');};
 await assert.rejects(getCursor(retailer,domain,{env:forbidden,fetchImpl}),/CURSOR_STORAGE_NOT_CONFIGURED/);
 await assert.rejects(getCursor(retailer,'unknown',{env,fetchImpl}),/INVALID_BACKFILL_SCOPE/);
 await assert.rejects(advanceCursor(retailer,domain,1,53,50,{env,fetchImpl}),/INVALID_ADVANCE_ARGUMENTS/);
 await assert.rejects(advanceCursor(retailer,domain,0,50,49,{env,fetchImpl}),/INVALID_ADVANCE_ARGUMENTS/);
 assert.equal(calls,0);
});
test('service rejects database failure rather than fabricating progress',async()=>{
 await assert.rejects(getCursor(retailer,domain,{env,
  fetchImpl:async()=>({ok:false,status:503})
 }),/CURSOR_RPC_FAILED_503/);
});
test('backfill source always confirms inbox before checkpoint advance',()=>{
 const src=fs.readFileSync(path.join(__dirname,'../api/kiot-document-backfill.js'),'utf8');
 assert.ok(src.indexOf('await persistVerifiedHints(hints)')>=0);
 assert.ok(src.indexOf('await persistVerifiedHints(hints)')<
   src.indexOf('await advanceCursor(retailer,domain,page,total,records.length)'));
 assert.match(src,/CLIENT_CURSOR_NOT_ALLOWED/);
 assert.doesNotMatch(src,/sessionStorage/);
});
test('migration is service-role-only and does not change Whose stock',()=>{
 const sql=fs.readFileSync(path.join(__dirname,
  '../supabase/migrations/20261013140000_whose_kiot_backfill_checkpoints.sql'),'utf8');
 assert.match(sql,/SECURITY DEFINER SET search_path = ''/);
 assert.match(sql,/FROM PUBLIC,anon,authenticated/);
 assert.match(sql,/TO service_role/);
 assert.match(sql,/STALE_OR_COMPLETE/);
 assert.doesNotMatch(sql,/UPDATE\s+(?:public\.)?whose_inventory_snapshots/i);
});
