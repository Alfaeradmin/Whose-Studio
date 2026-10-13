'use strict';
// Authenticated, admin-only investigation. Reads limited Kiot document pages
// without storing customer data, mutating stock or claiming a complete ledger.
const {validateStaffBearer}=require('../lib/whose-auth');
const {accessToken}=require('../lib/whose-backend');
const {safeRead}=require('../lib/kiotviet');
const {DOMAINS,MAX_PAGE,scanPage}=require('../lib/kiot-source-document-trace');
module.exports=async function handler(req,res){
 res.setHeader('Cache-Control','private,no-store');
 if(req.method!=='GET')return res.status(405).json({error:'GET_ONLY'});
 const bearer=accessToken(req);
 const staff=await validateStaffBearer(bearer);
 if(!staff.ok)return res.status(staff.status).json({error:'STAFF_AUTH_REQUIRED'});
 if(staff.is_global_admin!==true)return res.status(403).json({error:'ADMIN_REQUIRED'});
 const sku=typeof req.query?.sku==='string'?req.query.sku.trim().toUpperCase():'';
 const domain=typeof req.query?.domain==='string'?req.query.domain:'';
 const rawPage=String(req.query?.page??'0');
 if(!/^[A-Z0-9][A-Z0-9._-]{0,59}$/.test(sku)||!Object.hasOwn(DOMAINS,domain)||
  !/^(0|[1-9][0-9]{0,3})$/.test(rawPage)||Number(rawPage)>MAX_PAGE)
  return res.status(400).json({error:'INVALID_TRACE_FILTER'});
 try{
  const result=await scanPage({sku,domain,page:Number(rawPage),providerRead:safeRead});
  return res.status(200).json({...result,checkedAt:new Date().toISOString(),readOnly:true,
    kiotWritesEnabled:false,mutatesWhose:false});
 }catch(e){
  const code=typeof e?.message==='string'&&
   /^(SOURCE_|INCOMPLETE_SOURCE_|UNVERIFIED_SOURCE_|INVALID_SOURCE_)/.test(e.message)
   ?e.message:'DOCUMENT_TRACE_UNAVAILABLE';
  console.warn('[Whose/Kiot/document-trace]',code,domain,rawPage);
  return res.status(502).json({error:code,readOnly:true,
    incomplete:true,disclaimer:'No transaction history verified for this page'});
 }
};
