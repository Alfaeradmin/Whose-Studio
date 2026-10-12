'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {evaluateOutbound,evaluateBatch}=require('../lib/kiot-outbox-dry-run');
const row={id:1,domain:'inventory',state:'approved',approved_by:'admin',approved_at:'2026-10-12',idempotency_key:'unique-1',expected_source_version:'v1'};
test('dry-run blocks even approved inventory transactions',()=>{
 assert.equal(evaluateOutbound(row).allowed,false);
 assert.equal(evaluateOutbound(row).code,'DRY_RUN_ONLY');
});
test('production flag cannot enable write without a verified transport',()=>{
 assert.equal(evaluateOutbound(row,{dryRun:false}).code,'KIOT_WRITE_TRANSPORT_DISABLED');
});
test('unapproved and duplicated uncertainty fail closed',()=>{
 assert.equal(evaluateOutbound({...row,state:'pending_approval'}).code,'APPROVAL_REQUIRED');
 assert.equal(evaluateOutbound({...row,idempotency_key:''}).code,'IDEMPOTENCY_REQUIRED');
 assert.equal(evaluateBatch([row])[0].allowed,false);
});
