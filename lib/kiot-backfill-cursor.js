'use strict';
// Server-only, durable per-domain KiotViet document import checkpoint.
// A page advances only AFTER the durable inbox ACK. Never stores tokens or Kiot payloads.
const {getConfig}=require('./kiot-inbox-store');
const DOMAIN=new Set(['orders','invoices','purchaseorders','transfers','returns']);
const RETAILER=/^[A-Za-z0-9:_./-]{1,120}$/;
function validateScope(retailer,domain){
 if(typeof retailer!=='string'||!RETAILER.test(retailer)||!DOMAIN.has(domain))
  throw Error('INVALID_BACKFILL_SCOPE');
}
async function rpc(name,payload,{env=process.env,fetchImpl=fetch}={}){
 const cfg=getConfig(env);
 if(!cfg)throw Error('CURSOR_STORAGE_NOT_CONFIGURED');
 const response=await fetchImpl(cfg.base+'/rest/v1/rpc/'+name,{
  method:'POST',
  headers:{apikey:cfg.key,...(cfg.key.startsWith('sb_secret_')?{}:{Authorization:'Bearer '+cfg.key}),
   'Content-Type':'application/json',Accept:'application/json'},
  body:JSON.stringify(payload),signal:AbortSignal.timeout(9000)
 });
 if(!response.ok)throw Error('CURSOR_RPC_FAILED_'+response.status);
 return response.json();
}
function normalizeCursor(raw){
 if(!raw||!Number.isSafeInteger(raw.nextPage)||raw.nextPage<0||raw.nextPage>10000||
  typeof raw.complete!=='boolean'||
  (raw.lastTotal!==null&&raw.lastTotal!==undefined&&
   (!Number.isSafeInteger(raw.lastTotal)||raw.lastTotal<0)))
  throw Error('INVALID_CURSOR_REPLY');
 return {nextPage:raw.nextPage,complete:raw.complete,
  lastTotal:raw.lastTotal??null,lastRows:raw.lastRows??null,updatedAt:raw.updatedAt??null};
}
async function getCursor(retailer,domain,options={}){
 validateScope(retailer,domain);
 const raw=await rpc('whose_connector_backfill_cursor_status',{
  p_retailer:retailer,p_domain:domain
 },options);
 return normalizeCursor(raw);
}
async function advanceCursor(retailer,domain,expectedPage,total,rows,options={}){
 validateScope(retailer,domain);
 if(!Number.isSafeInteger(expectedPage)||expectedPage<0||expectedPage>9999||
  !Number.isSafeInteger(total)||total<0||total>500000||
  !Number.isSafeInteger(rows)||rows!==Math.min(50,Math.max(0,total-expectedPage*50)))
  throw Error('INVALID_ADVANCE_ARGUMENTS');
 const complete=(expectedPage+1)*50>=total;
 const r=await rpc('whose_connector_backfill_cursor_advance',{
  p_retailer:retailer,p_domain:domain,p_expected_page:expectedPage,
  p_total:total,p_rows:rows,p_complete:complete
 },options);
 if(r?.advanced!==true){
  if(r?.advanced===false&&r.reason==='STALE_OR_COMPLETE')throw Error('BACKFILL_CURSOR_CONFLICT');
  throw Error('INVALID_ADVANCE_ACK');
 }
 if(r.nextPage!==expectedPage+1||r.complete!==complete)throw Error('INVALID_ADVANCE_ACK');
 return {nextPage:r.nextPage,complete:r.complete,lastTotal:total,lastRows:rows};
}
module.exports={DOMAIN,validateScope,normalizeCursor,getCursor,advanceCursor};
