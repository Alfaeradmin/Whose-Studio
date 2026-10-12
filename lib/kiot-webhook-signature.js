'use strict';
// KiotViet Retail webhook verifier: HMAC-SHA256 over raw HTTP body.
// The configured secret is the base64 value registered with KiotViet.
// No writes, no implicit trust in any parsed JSON field.
const {createHmac,timingSafeEqual}=require('node:crypto');
function verifyKiotSignature(rawBody,header,secretBase64){
 if(!Buffer.isBuffer(rawBody)||rawBody.length===0||rawBody.length>1048576)return false;
 if(typeof header!=='string'||typeof secretBase64!=='string')return false;
 const signature=header.trim().replace(/^sha256=/i,'');
 if(!/^[a-f0-9]{64}$/i.test(signature))return false;
 if(!/^[A-Za-z0-9+/]+={0,2}$/.test(secretBase64)||secretBase64.length>1024)return false;
 const secret=Buffer.from(secretBase64,'base64');
 if(secret.length<8||secret.toString('base64')!==secretBase64)return false;
 const expected=createHmac('sha256',secret).update(rawBody).digest();
 return timingSafeEqual(expected,Buffer.from(signature,'hex'));
}
function parseVerifiedKiotWebhook(rawBody,header,secret){
 if(!verifyKiotSignature(rawBody,header,secret))throw new Error('INVALID_KIOT_WEBHOOK_SIGNATURE');
 let payload;
 try{payload=JSON.parse(rawBody.toString('utf8'));}catch{throw new Error('INVALID_KIOT_WEBHOOK_JSON');}
 if(!payload||typeof payload!=='object'||Array.isArray(payload))
   throw new Error('INVALID_KIOT_WEBHOOK_BODY');
 return payload;
}
module.exports={verifyKiotSignature,parseVerifiedKiotWebhook};
