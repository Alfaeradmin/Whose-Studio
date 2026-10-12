'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {authorizeOutboundIntent}=require('../lib/kiot-outbound-policy');
const valid={
 method:'PUT',domain:'products',branchId:123,operationId:'op:whosestudio:12345',
 approved:true,approvedBy:'staff-001',persistedOutbox:true,conflictChecked:true,readbackRequired:true
};
const policy={masterWriteEnabled:true,enabledDomains:{products:true},enabledBranchIds:[123]};
test('outbound is denied by default',()=>{
 assert.equal(authorizeOutboundIntent(valid).reason,'GLOBAL_WRITE_DISABLED');
 assert.equal(authorizeOutboundIntent(valid,{}).reason,'GLOBAL_WRITE_DISABLED');
});
test('allow only a fully approved durable intent',()=>{
 assert.equal(authorizeOutboundIntent(valid,policy).ok,true);
 for(const [field,bad] of [['approved',false],['persistedOutbox',false],['conflictChecked',false],['readbackRequired',false],['operationId','short'],['branchId',999]]) {
   assert.equal(authorizeOutboundIntent({...valid,[field]:bad},policy).ok,false,field);
 }
});
test('deny stock embedded in product writes and unknown domains',()=>{
 assert.equal(authorizeOutboundIntent({...valid,stockFieldsIncluded:true},policy).reason,'STOCK_WRITE_NEEDS_SEPARATE_CAPABILITY');
 assert.equal(authorizeOutboundIntent({...valid,domain:'inventory'},policy).reason,'DOMAIN_NOT_ALLOWED');
});
test('per-domain and master switches cannot be bypassed',()=>{
 assert.equal(authorizeOutboundIntent(valid,{...policy,masterWriteEnabled:false}).ok,false);
 assert.equal(authorizeOutboundIntent(valid,{...policy,enabledDomains:{}}).ok,false);
});
