'use strict';
// Isolated, webhook-only ingress. This project must use webhook-ingress as its Vercel root.
// All request bodies are untrusted. No credentials or KiotViet writes are exposed.
const {createHmac,timingSafeEqual,createHash}=require('node:crypto');
const {URL}=require('node:url');
module.exports.config={api:{bodyParser:false}};
function validateConfig(env=process.env){
 const secret=env.KIOTVIET_WEBHOOK_SECRET_BASE64||'';
 const key=env.WHOSE_CONNECTOR_SERVICE_ROLE_KEY||'';
 const retailer=env.KIOTVIET_RETAILER||'';
 const url=env.SUPABASE_URL||'';
 if(!/^[A-Za-z0-9+/]+={0,2}$/.test(secret))return null;
 const bytes=Buffer.from(secret,'base64');
 if(bytes.length<32||bytes.toString('base64')!==secret)return null;
 if(!/^([A-Za-z0-9_-]{1,120})$/.test(retailer))return null;
 if(!(key.startsWith('sb_secret_')||key.startsWith('eyJ')))return null;
 try{const u=new URL(url);if(u.origin!=='https://fjauxxunyxxboduyxjyr.supabase.co'||u.pathname!=='/'||u.search||u.hash||u.username||u.password)return null;}
 catch{return null;}
 return {secret:bytes,key,retailer,base:'https://fjauxxunyxxboduyxjyr.supabase.co'};
}
function verify(raw,signature,secret){
 if(!Buffer.isBuffer(raw)||!raw.length||raw.length>1048576||typeof signature!=='string')return false;
 const sig=signature.trim().replace(/^sha256=/i,'');
 if(!/^[a-f0-9]{64}$/i.test(sig))return false;
 return timingSafeEqual(Buffer.from(sig,'hex'),createHmac('sha256',secret).update(raw).digest());
}
function eventHints(payload,retailer){
 if(!payload||typeof payload!=='object'||Array.isArray(payload)||!Array.isArray(payload.Notifications)||payload.Notifications.length>50)throw Error('BAD_EVENT');
 const envelope=String(payload.Id??'');
 if(!/^[A-Za-z0-9:_./-]{1,160}$/.test(envelope))throw Error('BAD_ID');
 const out=[];
 for(const [index,notification] of payload.Notifications.entries()){
  const action=notification?.Action;
  if(typeof action!=='string')throw Error('BAD_ACTION');
  // Only products are supported by the Worker now; other domains stay disabled.
  if(action.split('.')[0].toLowerCase()!=='product')continue;
  const rows=Array.isArray(notification.Data)?notification.Data:Array.isArray(notification.RemoveId)?notification.RemoveId.map(id=>({id})):[];
  if(rows.length>200)throw Error('TOO_MANY');
  for(const row of rows){
   const id=typeof row==='object'&&row!==null?(row.id??row.Id):row;
   if(!/^[1-9][0-9]{0,14}$/.test(String(id??'')))continue;
   const entity_key=String(id),domain='products',providerId=envelope+':'+index+':'+entity_key;
   const identity=[retailer,domain,entity_key,providerId].map(v=>v.length+':'+v).join('|');
   const event_key=createHash('sha256').update(identity).digest('hex');
   const payload_digest=createHash('sha256').update(JSON.stringify([retailer,domain,entity_key,providerId,null])).digest('hex');
   out.push({retailer,domain,entity_key,event_key,payload_digest});
  }
 }
 if(out.length>500)throw Error('TOO_MANY');
 return out;
}
async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method!=='POST')return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
 const cfg=validateConfig();
 if(!cfg)return res.status(503).json({error:'INGRESS_NOT_CONFIGURED'});
 let raw;
 try {
  const parts=[];let length=0;
  for await(const chunk of req){const b=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);length+=b.length;if(length>1048576)return res.status(413).json({error:'PAYLOAD_TOO_LARGE'});parts.push(b);}
  raw=Buffer.concat(parts,length);
 }catch{return res.status(400).json({error:'INVALID_BODY'});}
 if(!verify(raw,req.headers['x-hub-signature'],cfg.secret))return res.status(401).json({error:'INVALID_SIGNATURE'});
 let hints;
 try{hints=eventHints(JSON.parse(raw.toString('utf8')),cfg.retailer);}
 catch{return res.status(422).json({error:'INVALID_NOTIFICATION'});}
 if(!hints.length)return res.status(422).json({error:'NO_SUPPORTED_NOTIFICATIONS'});
 try{
  const headers={apikey:cfg.key,...(cfg.key.startsWith('sb_secret_')?{}:{Authorization:'Bearer '+cfg.key}),'Content-Type':'application/json',Accept:'application/json'};
  const response=await fetch(cfg.base+'/rest/v1/rpc/whose_connector_ingest_hints',{method:'POST',headers,body:JSON.stringify({p_rows:hints}),signal:AbortSignal.timeout(3500)});
  if(!response.ok)throw Error('STORAGE_FAILED');
  const body=await response.json();
  if(body.received!==hints.length||body.inserted+body.duplicates!==hints.length)throw Error('ACK_INVALID');
  return res.status(200).json({ok:true,received:body.received,duplicates:body.duplicates});
 }catch{return res.status(503).json({error:'INBOX_UNAVAILABLE'});}
}
module.exports=handler;
module.exports.validateConfig=validateConfig;
module.exports.verify=verify;
module.exports.eventHints=eventHints;
