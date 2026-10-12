'use strict';
// Explicit Global Admin action only. Registers one provider product subscription.
// Never changes provider products, inventory, orders or financial records.
const {accessToken}=require('../lib/whose-backend');
const {validateStaffBearer,verifyOrigin}=require('../lib/whose-auth');
const {getAccessToken,safeRead}=require('../lib/kiotviet');
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
   url:body.url===TARGET?TARGET:null,kiotProductWritesEnabled:false});
 }catch{return res.status(503).json({error:'PROVIDER_REGISTRATION_UNCERTAIN_CHECK_LIST_BEFORE_RETRY'});}
};
