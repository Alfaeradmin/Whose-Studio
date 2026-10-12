'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {verify,eventHints,validateConfig}=require('../webhook-ingress/api/webhook');
const secret=crypto.randomBytes(32);
test('isolated ingress rejects invalid signature and accepts HMAC raw body',()=>{
 const raw=Buffer.from('{"Id":"test-1","Notifications":[]}');
 const sign=crypto.createHmac('sha256',secret).update(raw).digest('hex');
 assert.equal(verify(raw,sign,secret),true);
 assert.equal(verify(raw,'sha256='+sign,secret),true);
 assert.equal(verify(Buffer.from(raw+' '),sign,secret),false);
 assert.equal(verify(raw,'00'.repeat(32),secret),false);
});
test('ingress refuses missing and publishable credentials',()=>{
 assert.equal(validateConfig({}),null);
 assert.equal(validateConfig({KIOTVIET_WEBHOOK_SECRET_BASE64:secret.toString('base64'),KIOTVIET_RETAILER:'test',SUPABASE_URL:'https://fjauxxunyxxboduyxjyr.supabase.co/',WHOSE_CONNECTOR_SERVICE_ROLE_KEY:'sb_publishable_wrong'}),null);
});
test('supported notifications are product-only, deterministic, and deduplicatable',()=>{
 const input={Id:'webhook-A',Notifications:[{Action:'product.update',Data:[{Id:123},{Id:456}]},{Action:'order.update',Data:[{Id:10}]}]};
 const a=eventHints(input,'whose');const b=eventHints(input,'whose');
 assert.deepEqual(a,b);assert.equal(a.length,2);
 assert.equal(a[0].domain,'products');
 assert.match(a[0].event_key,/^[a-f0-9]{64}$/);
});
