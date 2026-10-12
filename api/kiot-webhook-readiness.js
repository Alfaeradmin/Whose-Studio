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
 const data=Array.isArray(r.data?.data)?r.data.data:[];
 const shape=Array.isArray(r.data)?'array':r.data===null?'null':typeof r.data;
 const envelopeKeys=r.data&&typeof r.data==='object'&&!Array.isArray(r.data)?Object.keys(r.data).filter(k=>/^[A-Za-z][A-Za-z0-9]{0,40}$/.test(k)).slice(0,12):[];
 const innerShape=Array.isArray(r.data?.data)?'array':r.data?.data===null?'null':typeof r.data?.data;
 const ownHost=String(process.env.VERCEL_URL||'').toLowerCase();
 const matches=data.filter(x=>{
  try {const u=new URL(x.url);return u.protocol==='https:'&&u.hostname.toLowerCase()===ownHost&&u.pathname==='/api/kiot-webhook';}
  catch{return false;}
 });
 return res.status(200).json({webhookSecretConfigured:configured,registeredListReadable:true,registeredTotal:/^[0-9]+$/.test(String(r.data?.total??''))?Number(r.data.total):data.length,listShapeValid:Array.isArray(r.data?.data),responseShape:shape,responseKeys:envelopeKeys,itemsShape:innerShape,totalReported:r.data?.total!=null,matchingCurrentDeployment:matches.length,activeMatchingCurrentDeployment:matches.filter(x=>x.isActive===true).length,kiotWritesEnabled:false});
};
