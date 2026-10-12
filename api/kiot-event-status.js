'use strict';
const {validateStaffBearer}=require('../lib/whose-auth');
const {accessToken,rest}=require('../lib/whose-backend');
const {safeRead}=require('../lib/kiotviet');
const EXPECTED='https://whose-kiot-webhook-ingress.vercel.app/api/webhook';
const TYPES=['product.update','stock.update','invoice.update','order.update'];
module.exports=async function handler(req,res){
 res.setHeader('Cache-Control','private,no-store');
 if(req.method!=='GET')return res.status(405).json({error:'GET_ONLY'});
 const bearer=accessToken(req),staff=await validateStaffBearer(bearer);
 if(!staff.ok)return res.status(staff.status).json({error:'STAFF_AUTH_REQUIRED'});
 if(!staff.is_global_admin)return res.status(403).json({error:'ADMIN_REQUIRED'});
 const [provider,health]=await Promise.all([
  safeRead('webhooks',{pageSize:100,currentItem:0}),
  rest('rpc/whose_kiot_audit_health',{method:'POST',bearer,body:{}})
 ]);
 const body={kiotWritesEnabled:false,hasCronSecret:Boolean(process.env.CRON_SECRET),
  inboxWorkerConfigured:Boolean(process.env.WHOSE_CONNECTOR_SERVICE_ROLE_KEY),
  eventTypes:Object.fromEntries(TYPES.map(type=>[type,{registered:false,active:false}])),
  providerReadable:false,listComplete:false,audit:health.ok?health.data:null};
 if(provider.ok){
  const total=Number(provider.data?.total);
  const rows=provider.data?.data;
  if(Number.isSafeInteger(total)&&total>=0&&total<=100&&
    (Array.isArray(rows)&&rows.length===total || total===0&&rows==null)){
   body.providerReadable=true;body.listComplete=true;
   for(const type of TYPES){
    const matching=(rows||[]).filter(x=>String(x.type).toLowerCase()===type);
    body.eventTypes[type]={
     registered:matching.length>0,
     active:matching.some(x=>x.url===EXPECTED&&x.isActive===true),
     duplicateSubscriptions:matching.length>1,
     requiresReview:matching.some(x=>x.url!==EXPECTED)
    };
   }
  }
 }
 return res.status(200).json(body);
};
