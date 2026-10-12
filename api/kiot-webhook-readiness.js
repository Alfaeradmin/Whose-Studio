'use strict';
// Admin-only read-only provider webhook readiness. Never registers subscriptions.
const {validateStaffBearer}=require('../lib/whose-auth');
const {accessToken}=require('../lib/whose-backend');
const {safeRead}=require('../lib/kiotviet');
module.exports=async function handler(req,res){
 res.setHeader('Cache-Control','private,no-store');
 if(req.method!=='GET')return res.status(405).json({error:'GET_ONLY'});
 const staff=await validateStaffBearer(accessToken(req));
 if(!staff.ok)return res.status(staff.status).json({error:'STAFF_AUTH_REQUIRED'});
 if(staff.is_global_admin!==true)return res.status(403).json({error:'ADMIN_REQUIRED'});
 const configured=Boolean(process.env.KIOTVIET_WEBHOOK_SECRET_BASE64);
 const r=await safeRead('webhooks',{pageSize:100,currentItem:0});
 if(!r.ok)return res.status(502).json({webhookSecretConfigured:configured,registeredListReadable:false,kiotWritesEnabled:false});
 const rawTotal=r.data?.total;
 const total=(typeof rawTotal==='number'&&Number.isSafeInteger(rawTotal)&&rawTotal>=0)
  ?rawTotal:(typeof rawTotal==='string'&&/^[0-9]+$/.test(rawTotal)&&Number.isSafeInteger(Number(rawTotal)))?Number(rawTotal):null;
 const data=Array.isArray(r.data?.data)?r.data.data:[];
 const emptyConfirmed=total===0&&(r.data?.data==null||Array.isArray(r.data.data)&&r.data.data.length===0);
 const complete=total!==null&&(emptyConfirmed||Array.isArray(r.data?.data)&&data.length===total);
 const targetHost='whose-kiot-webhook-ingress.vercel.app';
 const matches=complete?data.filter(x=>{
  try {const u=new URL(x.url);return u.protocol==='https:'&&u.hostname.toLowerCase()===targetHost&&u.pathname==='/api/webhook';}
  catch{return false;}
 }):[];
 return res.status(200).json({webhookSecretConfigured:configured,registeredListReadable:true,
  registeredTotal:total,listComplete:complete,registrationSafeToConsider:complete&&matches.length===0,
  matchingCurrentDeployment:complete?matches.length:null,
  activeMatchingCurrentDeployment:complete?matches.filter(x=>x.isActive===true).length:null,
  diagnostic:complete?null:'PROVIDER_WEBHOOK_LIST_INCOMPLETE',kiotWritesEnabled:false});
};
