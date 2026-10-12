'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createHmac}=require('node:crypto');
const {parseVerifiedKiotWebhook}=require('../lib/kiot-webhook-signature');
const {notificationHints}=require('../lib/kiot-webhook-hints');
const {persistVerifiedHints}=require('../lib/kiot-inbox-store');
const env={SUPABASE_URL:'https://fjauxxunyxxboduyxjyr.supabase.co/',WHOSE_CONNECTOR_SERVICE_ROLE_KEY:'x'.repeat(64)};
const secret=Buffer.from('integration-test-only-secret');
const payload={Id:'evt-verify-001',Notifications:[{Action:'product.update',Data:[{Id:33}]}]};
const raw=Buffer.from(JSON.stringify(payload));
const signature=createHmac('sha256',secret).update(raw).digest('hex');
test('signed webhook -> deterministic hint -> durable inbox acknowledgement',async()=>{
 const verified=parseVerifiedKiotWebhook(raw,signature,secret.toString('base64'));
 const hints=notificationHints(verified,'whose');
 assert.equal(hints.length,1);
 let persisted=null;
 const fetchImpl=async(url,request)=>{
  assert.match(url,/\/rpc\/whose_connector_ingest_hints$/);
  persisted=JSON.parse(request.body).p_rows;
  return {ok:true,json:async()=>({received:1,inserted:1,duplicates:0})};
 };
 const result=await persistVerifiedHints(hints,{env,fetchImpl});
 assert.deepEqual(result,{received:1,inserted:1,duplicates:0});
 assert.deepEqual(persisted,hints);
});
test('replay produces identical dedupe key',()=>{
 const first=notificationHints(parseVerifiedKiotWebhook(raw,signature,secret.toString('base64')),'whose');
 const again=notificationHints(parseVerifiedKiotWebhook(raw,signature,secret.toString('base64')),'whose');
 assert.equal(first[0].event_key,again[0].event_key);
});
test('wrong signed content is never accepted',()=>{
 const changed=Buffer.from(JSON.stringify({...payload,Id:'evt-modified'}));
 assert.throws(()=>parseVerifiedKiotWebhook(changed,signature,secret.toString('base64')),/SIGNATURE/);
});
