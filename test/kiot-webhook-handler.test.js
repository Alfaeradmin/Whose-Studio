'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {Readable}=require('node:stream');
const {createHmac}=require('node:crypto');
const handler=require('../api/kiot-webhook');
function req(body,signature){
 const stream=Readable.from([body]);
 stream.method='POST';stream.headers={'x-hub-signature':signature};
 return stream;
}
function response(){
 return {code:200,headers:{},setHeader(k,v){this.headers[k]=v;},
 status(n){this.code=n;return this;},json(data){this.data=data;return this;}};
}
test('without configuration webhook is disabled',async()=>{
 const saved=process.env.KIOTVIET_WEBHOOK_SECRET_BASE64;
 delete process.env.KIOTVIET_WEBHOOK_SECRET_BASE64;
 try{const out=response();await handler(req(Buffer.from('{}'),''),out);assert.equal(out.code,503);}
 finally{if(saved===undefined)delete process.env.KIOTVIET_WEBHOOK_SECRET_BASE64;else process.env.KIOTVIET_WEBHOOK_SECRET_BASE64=saved;}
});
test('invalid signature rejected before database work',async()=>{
 const oldSecret=process.env.KIOTVIET_WEBHOOK_SECRET_BASE64,oldRetailer=process.env.KIOTVIET_RETAILER;
 process.env.KIOTVIET_WEBHOOK_SECRET_BASE64=Buffer.from('sample-secret-kiot').toString('base64');
 process.env.KIOTVIET_RETAILER='whose';
 try{
  const out=response();await handler(req(Buffer.from('{}'),'invalid'),out);
  assert.equal(out.code,401);
 }finally{
  if(oldSecret===undefined)delete process.env.KIOTVIET_WEBHOOK_SECRET_BASE64;else process.env.KIOTVIET_WEBHOOK_SECRET_BASE64=oldSecret;
  if(oldRetailer===undefined)delete process.env.KIOTVIET_RETAILER;else process.env.KIOTVIET_RETAILER=oldRetailer;
 }
});
test('raw body limit is enforced',async()=>{
 const input=Readable.from([Buffer.alloc(1048577)]);
 await assert.rejects(handler.readRaw(input),/PAYLOAD_TOO_LARGE/);
});
