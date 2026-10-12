'use strict';
// Read-only KiotViet connectivity probe. Authenticated Whose Global Admin only.
// Response contains statuses and counts, never credentials or provider records.
const {validateStaffBearer}=require('../lib/whose-auth');
const {accessToken}=require('../lib/whose-backend');
const {safeRead}=require('../lib/kiotviet');
module.exports=async function handler(req,res){
 res.setHeader('Cache-Control','private,no-store');
 if(req.method!=='GET')return res.status(405).json({error:'GET_ONLY'});
 const staff=await validateStaffBearer(accessToken(req));
 if(!staff.ok)return res.status(staff.status).json({error:'STAFF_AUTH_REQUIRED'});
 if(staff.is_global_admin!==true)return res.status(403).json({error:'ADMIN_REQUIRED'});
 const out={mode:'read_only',kiotWritesEnabled:false};
 for(const [key,resource] of [['branches','branches'],['products','products']]){
  const result=await safeRead(resource,{pageSize:1,currentItem:0});
  out[key]={ok:result.ok,elapsedMs:result.ms};
  if(result.ok && Number.isSafeInteger(Number(result.data?.total)) &&
     Number(result.data.total)>=0)out[key].total=Number(result.data.total);
  else if(!result.ok)out[key].status='READ_FAILED';
 }
 return res.status(out.branches.ok&&out.products.ok?200:502).json(out);
};
