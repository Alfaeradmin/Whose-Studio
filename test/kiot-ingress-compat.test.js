'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createHmac}=require('node:crypto');
const ingress=require('../ops/kiot-ingress/api/webhook');
const {normalizeInboundEvent}=require('../lib/kiot-inbound-event');
const {verified,hints,persist}=ingress._test;
test('isolated ingress preserves existing product webhook dedupe format',()=>{
 const event={Id:'fixture-1',Notifications:[{Action:'product.update',Data:[{Id:123}]}]};
 const values=hints(event,'whose');
 const prev=normalizeInboundEvent({authenticated:true,retailer:'whose',domain:'products',entityKey:'123',providerEventId:'fixture-1:0:123',version:null});
 assert.deepEqual(values,[prev]);
});
test('stock and invoice notices are accepted as durable event hints',()=>{
 const payload={Id:'evt-1',Notifications:[
  {Action:'stock.update',Data:[{ProductId:123,BranchId:987,OnHand:6,Reserved:0}]},
  {Action:'invoice.update',Data:[{Id:321}]}]};
 const records=hints(payload,'whose');
 assert.deepEqual(records.map(x=>x.domain),['stock','invoices']);
 assert.deepEqual(records.map(x=>x.entity_key),['123:987','321']);
 assert.deepEqual(records,hints(payload,'whose'));
});
test('raw body must be authenticated before storing notifications',()=>{
 const secret=Buffer.alloc(32,17),raw=Buffer.from('{"Id":"x"}');
 const hmac=createHmac('sha256',secret).update(raw).digest('hex');
 assert.equal(verified(raw,hmac,secret),true);
 assert.equal(verified(Buffer.from('tampered'),hmac,secret),false);
 assert.equal(verified(raw,'0'.repeat(64),secret),false);
});
test('ingress only acknowledges an exact durable batch response',async()=>{
 const cfg={base:'https://fjauxxunyxxboduyxjyr.supabase.co',key:'sb_secret_test'};
 const rows=hints({Id:'evt',Notifications:[{Action:'product.update',Data:[{Id:1}]}]},'whose');
 const good=await persist(rows,cfg,async()=>({ok:true,json:async()=>({received:1,inserted:1,duplicates:0})}));
 assert.equal(good.inserted,1);
 await assert.rejects(()=>persist(rows,cfg,async()=>({ok:true,json:async()=>({received:1,inserted:0,duplicates:0})})),/ACK_INVALID/);
});
