'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createHmac}=require('node:crypto');

async function withFakes({validSignature=true,workerSuccess=true}={}){
 const dep={
  '../lib/whose-backend':{accessToken:()=> 'Bearer fake'},
  '../lib/whose-auth':{validateStaffBearer:async()=>({ok:true,is_global_admin:true}),verifyOrigin:()=>true},
  '../lib/kiotviet':{
   getAccessToken:async()=> 'stubbed',
   safeRead:async(resource)=>resource==='webhooks'
    ?{ok:true,data:{total:0}}:{ok:true,data:{data:[{id:14425074}]}}
  },
  '../lib/kiot-inbox-worker':{handleOnce:async()=>workerSuccess?{claimed:1,processed:1,retry:0}:{claimed:1,processed:0,retry:1}}
 };
 const original=new Map();
 for(const [rel,mod] of Object.entries(dep)){
  const id=require.resolve(rel);original.set(id,require.cache[id]);
  require.cache[id]={id,filename:id,loaded:true,exports:mod};
 }
 const handlerId=require.resolve('../api/kiot-webhook-register');
 original.set(handlerId,require.cache[handlerId]);delete require.cache[handlerId];
 const handler=require('../api/kiot-webhook-register');
 const envBefore={KIOTVIET_WEBHOOK_SECRET_BASE64:process.env.KIOTVIET_WEBHOOK_SECRET_BASE64,
  KIOTVIET_RETAILER:process.env.KIOTVIET_RETAILER};
 const secret=Buffer.alloc(32,1).toString('base64');
 process.env.KIOTVIET_WEBHOOK_SECRET_BASE64=secret;
 process.env.KIOTVIET_RETAILER='testshop';
 const previousFetch=global.fetch;
 const calls=[];let count=0;
 global.fetch=async(url,opts)=>{
  calls.push({url,opts});
  if(url.includes('whose-kiot-webhook-ingress')){
   const expected=createHmac('sha256',Buffer.from(secret,'base64')).update(opts.body).digest('hex');
   const ok=opts.headers['X-Hub-Signature']===expected&&validSignature;
   if(!ok)return {status:401,ok:false,json:async()=>({error:'INVALID_SIGNATURE'})};
   count++;
   return {status:200,ok:true,json:async()=>({received:1,duplicates:count===1?0:1})};
  }
  if(url==='https://public.kiotapi.com/webhooks')
   return {status:200,ok:true,json:async()=>({id:900,type:'product.update',isActive:true,url:'https://whose-kiot-webhook-ingress.vercel.app/api/webhook'})};
  throw Error('unexpected request');
 };
 const res={statusCode:200,setHeader(){return this},status(n){this.statusCode=n;return this},json(payload){this.payload=payload;return this}};
 try{await handler({method:'POST',body:{confirm:'REGISTER_PRODUCT_UPDATE'},headers:{}},res);}
 finally {
  global.fetch=previousFetch;
  for(const [k,v] of Object.entries(envBefore))v===undefined?delete process.env[k]:process.env[k]=v;
  for(const [id,prev] of original){if(prev===undefined)delete require.cache[id];else require.cache[id]=prev;}
 }
 return {res,calls};
}

test('registration requires signed event, replay and Worker successful before provider POST',async()=>{
 const {res,calls}=await withFakes();
 assert.equal(res.statusCode,201);
 assert.equal(res.payload.smoke.invalidSignatureRejected,true);
 assert.equal(res.payload.smoke.validSignatureAccepted,true);
 assert.equal(res.payload.smoke.replayDeduplicated,true);
 assert.equal(res.payload.smoke.workerProcessed,1);
 assert.equal(calls.filter(c=>c.url==='https://public.kiotapi.com/webhooks').length,1);
 const post=JSON.parse(calls.at(-1).opts.body).Webhook;
 assert.deepEqual([post.Type,post.IsActive,post.Url],['product.update',true,'https://whose-kiot-webhook-ingress.vercel.app/api/webhook']);
});
test('different signing secrets block provider registration',async()=>{
 const {res,calls}=await withFakes({validSignature:false});
 assert.equal(res.statusCode,503);
 assert.equal(res.payload.error,'INGRESS_SIGNING_KEYS_DIFFER');
 assert.equal(calls.some(x=>x.url==='https://public.kiotapi.com/webhooks'),false);
});
test('Worker persistence failure blocks provider registration',async()=>{
 const {res,calls}=await withFakes({workerSuccess:false});
 assert.equal(res.statusCode,503);
 assert.equal(res.payload.error,'WORKER_PERSIST_TEST_FAILED');
 assert.equal(calls.some(x=>x.url==='https://public.kiotapi.com/webhooks'),false);
});
