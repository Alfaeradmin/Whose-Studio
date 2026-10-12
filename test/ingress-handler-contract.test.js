'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {Readable}=require('node:stream');
const {createHmac,randomBytes}=require('node:crypto');
const handler=require('../webhook-ingress/api/webhook');
const key=randomBytes(32).toString('base64');
function request(body,signature){const req=Readable.from([body]);req.method='POST';req.headers={'x-hub-signature':signature};return req;}
function response(){return {statusCode:200,headers:{},body:null,setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;return this;},json(o){this.body=o;return this;}};}
test('webhook refuses invalid signatures without storage writes',async()=>{
 const originalEnv=process.env,origFetch=global.fetch;
 process.env={...originalEnv,KIOTVIET_WEBHOOK_SECRET_BASE64:key,WHOSE_CONNECTOR_SERVICE_ROLE_KEY:'sb_secret_'+'a'.repeat(45),KIOTVIET_RETAILER:'whose',SUPABASE_URL:'https://fjauxxunyxxboduyxjyr.supabase.co'};
 let calls=0;global.fetch=async()=>{calls++;throw Error('must not call');};
 try {const res=response();await handler(request(Buffer.from('{}'),'wrong'),res);assert.equal(res.statusCode,401);assert.equal(calls,0);}
 finally{process.env=originalEnv;global.fetch=origFetch;}
});
test('signed webhook persists before 200 and replay remains idempotent',async()=>{
 const origEnv=process.env,origFetch=global.fetch;
 process.env={...origEnv,KIOTVIET_WEBHOOK_SECRET_BASE64:key,WHOSE_CONNECTOR_SERVICE_ROLE_KEY:'sb_secret_'+'a'.repeat(45),KIOTVIET_RETAILER:'whose',SUPABASE_URL:'https://fjauxxunyxxboduyxjyr.supabase.co'};
 const body=Buffer.from(JSON.stringify({Id:'staging-validation',Notifications:[{Action:'product.update',Data:[{Id:14423124}]}]}));
 const signature=createHmac('sha256',Buffer.from(key,'base64')).update(body).digest('hex');
 let stored=false,called=0;
 global.fetch=async(_url,opts)=>{called++;assert.equal(opts.method,'POST');assert.ok(opts.headers.apikey.startsWith('sb_secret_'));const rows=JSON.parse(opts.body).p_rows;assert.equal(rows.length,1);assert.equal(rows[0].entity_key,'14423124');return {ok:true,json:async()=>{stored=true;return {received:1,inserted:called===1?1:0,duplicates:called===1?0:1};}}};
 try{for(let i=0;i<2;i++){const res=response();await handler(request(body,signature),res);assert.equal(res.statusCode,200);assert.equal(stored,true);assert.equal(res.body.duplicates,i);}assert.equal(called,2);}
 finally{process.env=origEnv;global.fetch=origFetch;}
});
test('database failure cannot be acknowledged',async()=>{
 const origEnv=process.env,origFetch=global.fetch;
 process.env={...origEnv,KIOTVIET_WEBHOOK_SECRET_BASE64:key,WHOSE_CONNECTOR_SERVICE_ROLE_KEY:'sb_secret_'+'a'.repeat(45),KIOTVIET_RETAILER:'whose',SUPABASE_URL:'https://fjauxxunyxxboduyxjyr.supabase.co'};
 const body=Buffer.from(JSON.stringify({Id:'failure-validation',Notifications:[{Action:'product.update',Data:[{Id:14423124}]}]}));
 const signature=createHmac('sha256',Buffer.from(key,'base64')).update(body).digest('hex');
 global.fetch=async()=>({ok:false,status:503});
 try{const res=response();await handler(request(body,signature),res);assert.equal(res.statusCode,503);}
 finally{process.env=origEnv;global.fetch=origFetch;}
});
