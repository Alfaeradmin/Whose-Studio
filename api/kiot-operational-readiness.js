'use strict';
// Provider-only read probes. This endpoint never stores orders or stock and never issues Kiot writes.
// No customer names, addresses, line items, payments or quantities are returned to the browser.
const {validateStaffBearer}=require('../lib/whose-auth');
const {accessToken}=require('../lib/whose-backend');
const {safeRead}=require('../lib/kiotviet');
const {assessPage}=require('../lib/kiot-operational-page');
module.exports=async function handler(req,res){
 res.setHeader('Cache-Control','private,no-store');
 if(req.method!=='GET')return res.status(405).json({error:'GET_ONLY'});
 const staff=await validateStaffBearer(accessToken(req));
 if(!staff.ok)return res.status(staff.status).json({error:'STAFF_AUTH_REQUIRED'});
 if(staff.is_global_admin!==true)return res.status(403).json({error:'ADMIN_REQUIRED'});
 const result={mode:'read_only',kiotWritesEnabled:false,mutatesWhose:false,autoSyncEnabled:false};
 // Probe one bounded page per domain without consuming or persisting business records.
 for(const [key,resource] of [['orders','orders'],['invoices','invoices'],['stock','productOnHands']]){
   const r=await safeRead(resource,{pageSize:1,currentItem:0});
   const total=r.ok?Number(r.data?.total):NaN;
   const checked=r.ok?assessPage(r.data,{pageSize:1,resource}):{ok:false,code:'PROVIDER_READ_FAILED'};
   result[key]={readable:r.ok,validPage:checked.ok,diagnostic:checked.ok?null:checked.code,
     latencyMs:r.ms,recordsReturned:checked.ok?checked.returned:null,
     total:checked.ok?checked.total:null};
 }
 return res.status(200).json(result);
};
