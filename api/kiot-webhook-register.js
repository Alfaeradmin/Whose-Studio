'use strict';
// Explicit Global Admin action only. Registers one provider product subscription.
// Never changes provider products, inventory, orders or financial records.
const {accessToken}=require('../lib/whose-backend');
const {validateStaffBearer,verifyOrigin}=require('../lib/whose-auth');
const {getAccessToken,safeRead}=require('../lib/kiotviet');
const {handleOnce}=require('../lib/kiot-inbox-worker');
const {createHmac,randomUUID}=require('node:crypto');
const TARGET='https://whose-kiot-webhook-ingress.vercel.app/api/webhook';
module.exports=async function handler(req,res){
 res.setHeader('Cache-Control','private,no-store');
 if(req.method!=='POST')return res.status(405).json({error:'POST_ONLY'});
 const staff=await validateStaffBearer(accessToken(req));
 if(!staff.ok)return res.status(staff.status).json({error:'STAFF_AUTH_REQUIRED'});
 if(staff.is_global_admin!==true)return res.status(403).json({error:'ADMIN_REQUIRED'});
 if(!verifyOrigin(req))return res.status(403).json({error:'INVALID_ORIGIN'});
 if(req.body?.confirm!=='REGISTER_PRODUCT_UPDATE')return res.status(400).json({error:'EXPLICIT_CONFIRMATION_REQUIRED'});
 const secret=process.env.KIOTVIET_WEBHOOK_SECRET_BASE64||'';
 if(!/^[A-Za-z0-9+/]+={0,2}$/.test(secret)||Buffer.from(secret,'base64').length<32)
   return res.status(503).json({error:'SIGNING_SECRET_NOT_CONFIGURED'});
 let current;
 try{
   const found=await safeRead('webhooks',{pageSize:100,currentItem:0});
   if(!found.ok)throw new Error('LIST_FAILED');
   const data=found.data;
   // KiotViet omits "data" when total=0. Accept only a proven empty list.
   const totalRaw=data?.total;
   const total=typeof totalRaw==='number'?totalRaw:
     typeof totalRaw==='string'&&/^[0-9]+$/.test(totalRaw)?Number(totalRaw):null;
   if(!Number.isSafeInteger(total)||total<0)
     return res.status(409).json({error:'WEBHOOK_TOTAL_UNRECOGNIZED'});
   if(total===0&&(data.data==null||Array.isArray(data.data)&&data.data.length===0))
     current=[];
   else if(Array.isArray(data.data)&&data.data.length===total)
     current=data.data;
   else return res.status(409).json({error:'WEBHOOK_LIST_INCOMPLETE',observedCount:Array.isArray(data.data)?data.data.length:0,totalKnown:true});
 }catch{return res.status(503).json({error:'WEBHOOK_LIST_UNAVAILABLE'});}
 const duplicates=current.filter(x=>String(x.type||'').toLowerCase()==='product.update');
 if(duplicates.length){
  return res.status(409).json({error:'PRODUCT_WEBHOOK_ALREADY_EXISTS',existingCount:duplicates.length,
    sameDestinationCount:duplicates.filter(x=>x.url===TARGET).length});
 }
 // Stop before any provider subscription until Whose and isolated ingress
 // have proved the SAME signing key and durable processing via a real product ID.
 // This is an explicit, supervised admin action. The fixture contains only a
 // product ID: the Worker re-fetches canonical data via read-only KiotViet GET.
 let smoke;
 try{
   const sample=await safeRead('products',{pageSize:1,currentItem:0});
   const productId=sample.ok&&Array.isArray(sample.data?.data)?sample.data.data[0]?.id:null;
   if(!/^[1-9][0-9]{0,14}$/.test(String(productId??'')))
     return res.status(503).json({error:'CANONICAL_SAMPLE_UNAVAILABLE'});
   const raw=JSON.stringify({Id:'whose-onboard-'+randomUUID(),Attempt:1,
     Notifications:[{Action:'product.update',Data:[{Id:Number(productId)}]}]});
   const sig=createHmac('sha256',Buffer.from(secret,'base64')).update(raw).digest('hex');
   const post=async signature=>{
     const response=await fetch(TARGET,{
       method:'POST',headers:{'Content-Type':'application/json','X-Hub-Signature':signature},
       body:raw,signal:AbortSignal.timeout(7000)
     });
     const data=await response.json().catch(()=>null);
     return {status:response.status,data};
   };
   const invalid=await post('00'.repeat(32));
   if(invalid.status!==401)
     return res.status(503).json({error:'INGRESS_REJECT_TEST_FAILED',upstreamStatus:invalid.status});
   const valid=await post(sig);
   if(valid.status!==200||valid.data?.received!==1||valid.data?.duplicates!==0)
     return res.status(503).json({error:valid.status===401?'INGRESS_SIGNING_KEYS_DIFFER':'INGRESS_ACCEPT_TEST_FAILED',upstreamStatus:valid.status});
   const replay=await post(sig);
   if(replay.status!==200||replay.data?.received!==1||replay.data?.duplicates!==1)
     return res.status(503).json({error:'INGRESS_REPLAY_TEST_FAILED',upstreamStatus:replay.status});
   const processed=await handleOnce();
   if(processed.processed<1||processed.retry>0)
     return res.status(503).json({error:'WORKER_PERSIST_TEST_FAILED',claimed:processed.claimed,processed:processed.processed,retry:processed.retry});
   smoke={invalidSignatureRejected:true,validSignatureAccepted:true,replayDeduplicated:true,
     workerProcessed:processed.processed};
 }catch{
   return res.status(503).json({error:'INGRESS_OR_WORKER_PREFLIGHT_UNAVAILABLE'});
 }
 try {
  const bearer=await getAccessToken();
  const response=await fetch('https://public.kiotapi.com/webhooks',{
   method:'POST',
   headers:{Retailer:process.env.KIOTVIET_RETAILER,Authorization:'Bearer '+bearer,'Content-Type':'application/json',Accept:'application/json'},
   body:JSON.stringify({Webhook:{Type:'product.update',Url:TARGET,IsActive:true,Description:'Whose Studio product catalog read-only inbound sync',Secret:secret}}),
   signal:AbortSignal.timeout(8000)
  });
  // Do not print provider raw body as it may contain sensitive details.
  if(!response.ok)return res.status(502).json({error:'PROVIDER_REGISTRATION_FAILED',upstreamStatus:response.status});
  const body=await response.json();
  return res.status(201).json({ok:true,id:body.id??null,type:body.type??null,isActive:body.isActive===true,
   url:body.url===TARGET?TARGET:null,kiotProductWritesEnabled:false,smoke});
 }catch{return res.status(503).json({error:'PROVIDER_REGISTRATION_UNCERTAIN_CHECK_LIST_BEFORE_RETRY'});}
};
