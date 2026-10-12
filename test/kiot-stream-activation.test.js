'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {authorized}=require('../api/connector-schedule');
const {webhookPage,checkIngress,registerOne}=require('../api/kiot-event-register')._test;
test('cron cannot run without a valid secret and exact bearer header',()=>{
 const secret='abcdefghijklmnopqrstuvwxyz987654';
 assert.equal(authorized('Bearer '+secret,secret),true);
 assert.equal(authorized('Bearer '+secret.slice(0,-1),secret),false);
 assert.equal(authorized(null,secret),false);
 assert.equal(authorized('Bearer a','short'),false);
});
test('webhook subscription discovery fails closed on incomplete pages',()=>{
 assert.deepEqual(webhookPage({total:0}),[]);
 assert.equal(webhookPage({total:1,data:[{type:'product.update'}]}).length,1);
 assert.throws(()=>webhookPage({total:2,data:[{}]}),/INCOMPLETE/);
});
test('ingress version/capability check blocks unsafe stock subscription',async()=>{
 const respond=payload=>async()=>({ok:true,json:async()=>payload});
 await assert.rejects(()=>checkIngress('stock.update',{fetchImpl:respond({
  protocol:'old',enabled:true,capabilities:['stock.update']})}),/VERSION_NOT_READY/);
 await assert.rejects(()=>checkIngress('stock.update',{fetchImpl:respond({
  protocol:'whose-kiot-events-v2',enabled:false,capabilities:['stock.update']})}),/VERSION_NOT_READY/);
 await checkIngress('stock.update',{fetchImpl:respond({
  protocol:'whose-kiot-events-v2',enabled:true,capabilities:['stock.update']})});
});
test('unlisted provider webhook actions cannot be registered',async()=>{
 await assert.rejects(()=>registerOne('transfer.update'),/UNSUPPORTED_TYPE/);
});
