'use strict';
// Server-only persistence gateway. No KiotViet writes. Configuration is optional and fails closed.
const WHOSE_HOST='fjauxxunyxxboduyxjyr.supabase.co';
function getConfig(env=process.env){
  const raw=env.SUPABASE_URL, key=env.WHOSE_CONNECTOR_SERVICE_ROLE_KEY;
  if(typeof raw!=='string'||typeof key!=='string'||key.length<40)return null;
  let url;
  try{url=new URL(raw);}catch{return null;}
  if(url.protocol!=='https:'||url.hostname!==WHOSE_HOST||url.port||url.pathname!=='/'||
     url.username||url.password||url.search||url.hash)return null;
  return {base:url.origin,key};
}
async function persistVerifiedHints(hints,{env=process.env,fetchImpl=fetch}={}){
  if(!Array.isArray(hints)||hints.length>500)throw new TypeError('INVALID_HINT_BATCH');
  if(hints.length===0)return {received:0,inserted:0,duplicates:0};
  const cfg=getConfig(env);
  if(!cfg)throw new Error('CONNECTOR_STORAGE_NOT_CONFIGURED');
  const res=await fetchImpl(cfg.base+'/rest/v1/rpc/whose_connector_ingest_hints',{
    method:'POST',headers:{apikey:cfg.key,Authorization:'Bearer '+cfg.key,
    'Content-Type':'application/json',Accept:'application/json'},
    body:JSON.stringify({p_rows:hints}),signal:AbortSignal.timeout(3500)
  });
  if(!res.ok)throw new Error('CONNECTOR_INBOX_PERSIST_FAILED_'+res.status);
  const body=await res.json();
  if(!body||body.received!==hints.length||!Number.isInteger(body.inserted)||
     !Number.isInteger(body.duplicates)||body.inserted+body.duplicates!==hints.length)
    throw new Error('CONNECTOR_INBOX_ACK_INVALID');
  return body;
}
module.exports={getConfig,persistVerifiedHints};
