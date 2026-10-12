'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {normalizeInboundEvent}=require('../lib/kiot-inbound-event');
const sample={authenticated:true,retailer:'whose-shop',domain:'products',entityKey:'123',providerEventId:'evt:001',version:'v2'};
test('rejects unauthenticated and malformed events',()=>{
 assert.throws(()=>normalizeInboundEvent({...sample,authenticated:false}),/UNVERIFIED_PROVIDER/);
 assert.throws(()=>normalizeInboundEvent({...sample,entityKey:'!'}),/INVALID_EVENT_IDENTITY/);
 assert.throws(()=>normalizeInboundEvent({...sample,domain:'unknown'}),/INVALID_EVENT_IDENTITY/);
});
test('same event is deduplicatable and different version is distinguishable',()=>{
 const a=normalizeInboundEvent(sample),b=normalizeInboundEvent(sample);
 assert.deepEqual(a,b);
 assert.match(a.event_key,/^[a-f0-9]{64}$/);
 assert.match(a.payload_digest,/^[a-f0-9]{64}$/);
 assert.notEqual(a.event_key,normalizeInboundEvent({...sample,entityKey:'456'}).event_key);
 assert.notEqual(a.payload_digest,normalizeInboundEvent({...sample,version:'v3'}).payload_digest);
});
