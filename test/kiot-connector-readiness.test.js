'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {connectorReadiness}=require('../lib/kiot-connector-readiness');
test('fail closed without secrets',()=>{const x=connectorReadiness({});assert.equal(x.canRunReadOnlyWorker,false);assert.equal(x.kiotWriteEnabled,false);});
test('declare readiness without returning any secret values',()=>{
 const input={KIOTVIET_CLIENT_ID:'id',KIOTVIET_CLIENT_SECRET:'private-secret',KIOTVIET_RETAILER:'whose',SUPABASE_URL:'url',WHOSE_CONNECTOR_SERVICE_ROLE_KEY:'service-key',KIOTVIET_WEBHOOK_SECRET_BASE64:'webhook-secret'};
 const x=connectorReadiness(input);
 assert.equal(x.webhookConfigured,true);assert.equal(x.kiotWriteEnabled,false);
 assert.equal(JSON.stringify(x).includes('private-secret'),false);
});
