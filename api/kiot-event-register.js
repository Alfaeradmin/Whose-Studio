'use strict';
// Explicitly consented admin-only registration for read-only incoming events.
// Refuse provider webhook mutation until the stable ingress proves v2 capability.
const {createHmac,randomUUID}=require('node:crypto');
const {validateStaffBearer,verifyOrigin}=require('../lib/whose-auth');
const {accessToken}=require('../lib/whose-backend');
const {safeRead,getAccessToken}=require('../lib/kiotviet');
const {handleOnce}=require('../lib/kiot-inbox-worker');
const HOST='https://whose-kiot-webhook-ingress.vercel.app';
const TARGET=HOST+'/api/webhook';
const TYPES=new Set(['stock.update','invoice.update','order.update']);
function webhookPage(data){
 const raw=data?.total;
 const total=typeof raw==='number'?raw:typeof raw==='string'&&/^\d+$/.test(raw)?Number(raw):NaN;
 const rows=Array.isArray(data?.data)?data.data:[];
 if(!Number.isSafeInteger(total)||total<0||total>100||rows.length!==total)
  throw Error('INCOMPLETE_WEBHOOK_LIST');
 return rows;
}
async function checkIngress(type,{fetchImpl=fetch}={}){
 const response=await fetchImpl(HOST+'/api/health',{cache:'no-store',signal:AbortSignal.timeout(6000)});
 if(!response.ok)throw Error('INGRESS_UNAVAILABLE');
 const health=await response.json();
 if(health?.protocol!=='whose-kiot-events-v2'||!health.enabled||
   !Array.isArray(health.capabilities)||!health.capabilities.includes(type))
  throw Error('INGRESS_VERSION_NOT_READY');
}
async function registerOne(type,{reader=safeRead,fetchImpl=fetch,getToken=getAccessToken}={}){
 if(!TYPES.has(type))throw Error('UNSUPPORTED_TYPE');
 const secret=process.env.KIOTVIET_WEBHOOK_SECRET_BASE64||'';
 if(!/^[A-Za-z0-9+/]+={0,2}$/.test(secret)||Buffer.from(secret,'base64').length<32)
  throw Error('SIGNING_SECRET_NOT_CONFIGURED');
 await checkIngress(type,{fetchImpl});
 const found=await reader('webhooks',{pageSize:100,currentItem:0});
 if(!found.ok)throw Error('PROVIDER_WEBHOOK_LIST_UNAVAILABLE');
 const current=webhookPage(found.data);
 // An existing active subscription to another URL is a migration decision,
 // never silently replace, or duplicate it.
 const matches=current.filter(x=>String(x.type).toLowerCase()===type);
 if(matches.length){
  const matching=matches.filter(x=>x.url===TARGET&&x.isActive===true);
  if(matching.length===1&&matches.length===1)return {alreadyActive:true,type,id:matching[0].id};
  throw Error('WEBHOOK_ALREADY_EXISTS_REVIEW_REQUIRED');
 }
 // Verify shared ingress signer and durable inbox before creating provider subscription.
 const sample=await reader('products',{pageSize:1,currentItem:0});
 const id=sample.ok&&Array.isArray(sample.data?.data)?sample.data.data[0]?.id:null;
 if(!/^[1-9][0-9]{0,14}$/.test(String(id??'')))throw Error('PRODUCT_SMOKE_ID_UNAVAILABLE');
 const raw=JSON.stringify({Id:'whose-event-smoke-'+randomUUID(),Attempt:1,
  Notifications:[{Action:'product.update',Data:[{Id:Number(id)}]}]});
 const sig=createHmac('sha256',Buffer.from(secret,'base64')).update(raw).digest('hex');
 const probe=async signature=>{
  const r=await fetchImpl(TARGET,{method:'POST',headers:{'Content-Type':'application/json','X-Hub-Signature':signature},
   body:raw,signal:AbortSignal.timeout(7000)});
  return {status:r.status,data:await r.json().catch(()=>null)};
 };
 const invalid=await probe('0'.repeat(64));
 if(invalid.status!==401)throw Error('INGRESS_REJECT_TEST_FAILED');
 const valid=await probe(sig);
 if(valid.status!==200||valid.data?.received!==1||valid.data?.duplicates!==0)
  throw Error('INGRESS_SIGNING_OR_PERSIST_FAILED');
 const replay=await probe(sig);
 if(replay.status!==200||replay.data?.duplicates!==1)
  throw Error('INGRESS_REPLAY_FAILED');
 const processed=await handleOnce();
 if(processed.processed<1||processed.retry!==0)throw Error('WORKER_CANONICAL_PERSIST_FAILED');
 const bearer=await getToken();
 const provider=await fetchImpl('https://public.kiotapi.com/webhooks',{
  method:'POST',headers:{Retailer:process.env.KIOTVIET_RETAILER,Authorization:'Bearer '+bearer,
   'Content-Type':'application/json',Accept:'application/json'},
  body:JSON.stringify({Webhook:{Type:type,Url:TARGET,IsActive:true,
   Description:'Whose KiotViet inbound event audit '+type,Secret:secret}}),
  signal:AbortSignal.timeout(8000)
 });
 if(!provider.ok)throw Error('PROVIDER_REGISTRATION_HTTP_'+provider.status);
 const data=await provider.json();
 if(String(data.type).toLowerCase()!==type||data.url!==TARGET||data.isActive!==true)
  throw Error('PROVIDER_REGISTRATION_VERIFY_REQUIRED');
 return {registered:true,type,id:data.id};
}
async function handler(req,res){
 res.setHeader('Cache-Control','private,no-store');
 if(req.method!=='POST')return res.status(405).json({error:'POST_ONLY'});
 const staff=await validateStaffBearer(accessToken(req));
 if(!staff.ok)return res.status(staff.status).json({error:'STAFF_AUTH_REQUIRED'});
 if(!staff.is_global_admin)return res.status(403).json({error:'ADMIN_REQUIRED'});
 if(!verifyOrigin(req))return res.status(403).json({error:'INVALID_ORIGIN'});
 const type=req.body?.type;
 if(!TYPES.has(type)||req.body?.confirm!=='REGISTER_KIOT_'+type.toUpperCase())
  return res.status(400).json({error:'EXPLICIT_CONFIRM_REQUIRED'});
 try{
  const value=await registerOne(type);
  return res.status(200).json({ok:true,...value,kiotStockWritesEnabled:false});
 }catch(e){
  const error=e?.message||'REGISTRATION_FAILED';
  const code=/^[A-Z0-9_]{3,80}$/.test(error)?error:'REGISTRATION_UNCERTAIN_CHECK_WEBHOOKS';
  console.warn('[Whose/Kiot/register]',type,code);
  return res.status(409).json({error:code});
 }
}
module.exports=handler;
module.exports._test={TYPES,webhookPage,checkIngress,registerOne};
