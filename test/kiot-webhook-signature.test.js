'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createHmac}=require('node:crypto');
const {verifyKiotSignature,parseVerifiedKiotWebhook}=require('../lib/kiot-webhook-signature');
const secret=Buffer.from('sample-secret-kiot');
const encoded=secret.toString('base64');
const body=Buffer.from('{"Id":"evt1","Notifications":[]}');
const signature=createHmac('sha256',secret).update(body).digest('hex');
test('validates signed raw body and parses only after verification',()=>{
 assert.equal(verifyKiotSignature(body,signature,encoded),true);
 assert.deepEqual(parseVerifiedKiotWebhook(body,signature,encoded),{Id:'evt1',Notifications:[]});
});
test('rejects tampering, malformed secret, oversized payload and invalid signature',()=>{
 assert.equal(verifyKiotSignature(Buffer.from(' '+body),signature,encoded),false);
 assert.equal(verifyKiotSignature(body,'abc',encoded),false);
 assert.equal(verifyKiotSignature(body,signature,'invalid!'),false);
 assert.equal(verifyKiotSignature(Buffer.alloc(1048577),signature,encoded),false);
 assert.throws(()=>parseVerifiedKiotWebhook(body,'bad',encoded),/SIGNATURE/);
});
