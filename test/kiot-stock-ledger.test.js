'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {notificationHints}=require('../lib/kiot-webhook-hints');
const {canonicalDocument}=require('../lib/kiot-canonical-document');
const {handleOnce}=require('../lib/kiot-inbox-worker');
const env={SUPABASE_URL:'https://fjauxxunyxxboduyxjyr.supabase.co/',
 WHOSE_CONNECTOR_SERVICE_ROLE_KEY:'a'.repeat(60)};
const lease='00000000-0000-4000-8000-000000000001';
function fakeFetch(job,calls){
 return async(url,opts)=>{
  const name=url.split('/').pop(),body=JSON.parse(opts.body);
  calls.push({name,body});
  const data=name==='whose_connector_claim_inbox'?[job]:
   name==='whose_connector_record_stock'?{stored:true,status:'changed'}:
   name==='whose_connector_record_document'?{stored:true,duplicate:false}:true;
  return {ok:true,json:async()=>data};
 };
}
test('signed stock event maps product/branch and deduplicates by provider envelope',()=>{
 const payload={Id:'stock-100',Notifications:[{Action:'stock.update',Data:[
  {ProductId:12,BranchId:345,OnHand:2,Reserved:1}
 ]}]};
 const rows=notificationHints(payload,'whose');
 assert.equal(rows.length,1);
 assert.equal(rows[0].domain,'stock');
 assert.equal(rows[0].entity_key,'12:345');
 assert.deepEqual(rows,notificationHints(payload,'whose'));
});
test('stock worker re-fetches Kiot canonical stock instead of trusting webhook quantities',async()=>{
 const calls=[],reads=[];
 const job={id:7,domain:'stock',entity_key:'12:345',lease_token:lease};
 const result=await handleOnce({env,fetchImpl:fakeFetch(job,calls),
  providerRead:async(path)=>{reads.push(path);return {ok:true,data:{
   id:12,inventories:[{branchId:345,onHand:7,reserved:2}]
  }};}});
 assert.deepEqual(reads,['products/12']);
 assert.equal(result.processed,1);
 assert.equal(calls[1].name,'whose_connector_record_stock');
 assert.equal(calls[1].body.p_on_hand,7);
 assert.equal(calls[1].body.p_reserved,2);
 assert.equal(calls.at(-1).body.p_success,true);
});
test('missing branch stock never commits a fabricated zero',async()=>{
 const calls=[];const job={id:8,domain:'stock',entity_key:'12:345',lease_token:lease};
 const result=await handleOnce({env,fetchImpl:fakeFetch(job,calls),
  providerRead:async()=>({ok:true,data:{id:12,inventories:[]}})});
 assert.equal(result.retry,1);
 assert.ok(!calls.some(x=>x.name==='whose_connector_record_stock'));
 assert.equal(calls.at(-1).body.p_success,false);
});
test('document history excludes customer PII and requires exact identity and lines',async()=>{
 const source={id:999,code:'HD999',branchId:345,status:1,
  invoiceDetails:[{productId:12,quantity:1}],
  customerName:'do not persist',contactNumber:'private'};
 const safe=canonicalDocument('invoices',source,'999');
 assert.equal(safe.id,'999');
 assert.deepEqual(safe.lines,[{productId:'12',quantity:1}]);
 assert.ok(!JSON.stringify(safe).includes('private'));
 assert.throws(()=>canonicalDocument('invoices',{...source,id:998},'999'),/MISMATCH/);
 assert.throws(()=>canonicalDocument('invoices',{...source,invoiceDetails:null},'999'),/LINES/);
});
test('invoice worker stores source-specific canonical document, no inferred stock delta',async()=>{
 const calls=[];
 const job={id:9,domain:'invoices',entity_key:'999',lease_token:lease};
 const result=await handleOnce({env,fetchImpl:fakeFetch(job,calls),
  providerRead:async()=>({ok:true,data:{id:999,code:'HD999',branchId:345,invoiceDetails:[{productId:12,quantity:1}],customerName:'Private'}})});
 assert.equal(result.processed,1);
 const body=calls.find(x=>x.name==='whose_connector_record_document').body;
 assert.equal(body.p_document.code,'HD999');
 assert.equal(body.p_document.lines[0].productId,'12');
 assert.equal(JSON.stringify(body).includes('Private'),false);
});
