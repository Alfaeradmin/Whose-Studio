'use strict';
// Standalone Whose KiotViet Retail ingress. Dedicated Vercel project only.
// Signed source event -> idempotent Supabase inbox; never directly mutate stock.
const {createHmac,createHash,timingSafeEqual}=require('node:crypto');
module.exports.config={api:{bodyParser:false}};
const DOMAIN={product:'products',order:'orders',invoice:'invoices',branch:'branches',
 purchaseorder:'purchaseorders',return:'returns',transfer:'transfers'};
function config(env=process.env){
 const secret64=env.KIOTVIET_WEBHOOK_SECRET_BASE64||'';
 const retailer=env.KIOTVIET_RETAILER||'',key=env.WHOSE_CONNECTOR_SERVICE_ROLE_KEY||'';
 if(!/^[A-Za-z0-9+/]+={0,2}$/.test(secret64)||!secret64)return null;
 const secret=Buffer.from(secret64,'base64');
 if(secret.length<32||secret.toString('base64')!==secret64)return null;
 if(!/^[A-Za-z0-9:_./-]{1,120}$/.test(retailer))return null;
 if(!key.startsWith('sb_secret_')&&!key.startsWith('eyJ'))return null;
 let host;
 try{host=new URL(env.SUPABASE_URL);}catch{return null}
 if(host.origin!=='https://fjauxxunyxxboduyxjyr.supabase.co'||host.pathname!=='/'||
   host.search||host.hash||host.username||host.password)return null;
 return {secret,retailer,key,base:host.origin};
}
function verified(raw,sig,secret){
 if(!Buffer.isBuffer(raw)||!raw.length||raw.length>1048576||typeof sig!=='string')return false;
 const input=sig.trim().replace(/^sha256=/i,'');
 if(!/^[0-9a-f]{64}$/i.test(input))return false;
 return timingSafeEqual(Buffer.from(input,'hex'),createHmac('sha256',secret).update(raw).digest());
}
async function readRaw(req){
 const chunks=[];let len=0;
 for await(const part of req){
  const item=Buffer.isBuffer(part)?part:Buffer.from(part);len+=item.length;
  if(len>1048576)throw Error('PAYLOAD_TOO_LARGE');
  chunks.push(item);
 }
 return Buffer.concat(chunks,len);
}
const hash=x=>createHash('sha256').update(x).digest('hex');
function hints(payload,retailer){
 if(!payload||typeof payload!=='object'||Array.isArray(payload)||
   !/^[A-Za-z0-9:_./-]{1,160}$/.test(String(payload.Id??''))||
   !Array.isArray(payload.Notifications)||payload.Notifications.length>50)throw Error('BAD_ENVELOPE');
 const rows=[];
 for(const [idx,notice] of payload.Notifications.entries()){
  const action=typeof notice?.Action==='string'?notice.Action.toLowerCase():'';
  const domain=action==='stock.update'?'stock':DOMAIN[action.split('.')[0]];
  if(!domain)continue;
  const values=Array.isArray(notice.Data)?notice.Data:
   Array.isArray(notice.RemoveId)?notice.RemoveId.map(id=>({Id:id})):[];
  if(values.length>200)throw Error('TOO_MANY_ENTITIES');
  for(const row of values){
   const p=domain==='stock'?row?.ProductId??row?.productId:row?.Id??row?.id;
   const b=domain==='stock'?row?.BranchId??row?.branchId:null;
   if(!/^[1-9][0-9]{0,14}$/.test(String(p??'')))continue;
   if(domain==='stock'&&!/^[1-9][0-9]{0,14}$/.test(String(b??'')))continue;
   const entity=domain==='stock'?p+':'+b:String(p);
   const eid=String(payload.Id)+':'+idx+':'+(domain==='stock'?p+':'+b:p);
   const identity=[retailer,domain,entity,eid].map(x=>String(x).length+':'+x).join('|');
   rows.push({retailer,domain,entity_key:entity,event_key:hash(identity),
    payload_digest:hash(JSON.stringify([retailer,domain,entity,eid,null]))});
  }
 }
 if(rows.length>500)throw Error('TOO_MANY_HINTS');
 return rows;
}
async function persist(rows,cfg,fetcher=fetch){
 const response=await fetcher(cfg.base+'/rest/v1/rpc/whose_connector_ingest_hints',{
  method:'POST',headers:{apikey:cfg.key,...(cfg.key.startsWith('sb_secret_')?{}:{Authorization:'Bearer '+cfg.key}),
   'Content-Type':'application/json','Accept':'application/json'},
  body:JSON.stringify({p_rows:rows}),signal:AbortSignal.timeout(3500)
 });
 if(!response.ok)throw Error('INBOX_FAILED');
 const data=await response.json();
 if(data?.received!==rows.length||data.inserted+data.duplicates!==rows.length)
  throw Error('INBOX_ACK_INVALID');
 return data;
}
async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST')return res.status(405).json({error:'POST_ONLY'});
 const cfg=config();
 if(!cfg)return res.status(503).json({error:'INGRESS_NOT_CONFIGURED'});
 let body;
 try{
  const raw=await readRaw(req);
  if(!verified(raw,req.headers?.['x-hub-signature'],cfg.secret))
   return res.status(401).json({error:'INVALID_SIGNATURE'});
  body=JSON.parse(raw.toString('utf8'));
 }catch(e){return res.status(e.message==='PAYLOAD_TOO_LARGE'?413:401).json({error:'INVALID_WEBHOOK'});}
 let records;
 try{records=hints(body,cfg.retailer);
  if(!records.length)return res.status(422).json({error:'NO_SUPPORTED_NOTIFICATIONS'});
 }catch{return res.status(422).json({error:'INVALID_NOTIFICATION'});}
 try{
  const out=await persist(records,cfg);
  return res.status(200).json({ok:true,received:out.received,duplicates:out.duplicates});
 }catch{return res.status(503).json({error:'INBOX_UNAVAILABLE'});}
}
module.exports=handler;
module.exports._test={config,verified,hints,persist,readRaw};
