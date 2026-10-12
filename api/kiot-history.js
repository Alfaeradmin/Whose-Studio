'use strict';
// Scoped, PII-free timeline of KiotViet stock observations and document versions.
const {validateStaffBearer}=require('../lib/whose-auth');
const {rest,accessToken}=require('../lib/whose-backend');
module.exports=async function handler(req,res){
 res.setHeader('Cache-Control','private,no-store');
 if(req.method!=='GET')return res.status(405).json({error:'GET_ONLY'});
 const bearer=accessToken(req),staff=await validateStaffBearer(bearer);
 if(!staff.ok)return res.status(staff.status).json({error:'STAFF_AUTH_REQUIRED'});
 if(req.query?.type==='health'){
  if(staff.is_global_admin!==true)return res.status(403).json({error:'ADMIN_REQUIRED'});
  const r=await rest('rpc/whose_kiot_audit_health',{method:'POST',bearer,body:{}});
  if(!r.ok||!r.data)return res.status(503).json({error:'AUDIT_HEALTH_UNAVAILABLE'});
  return res.status(200).json({...r.data,sourceAttribution:'document_correlation_not_verified'});
 }
 const type=req.query?.type||'stock';
 const page=Number(req.query?.page??0);
 const query=typeof req.query?.q==='string'?req.query.q.trim():'';
 const branch=typeof req.query?.branch==='string'?req.query.branch.trim():'';
 if(!['stock','documents'].includes(type)||!Number.isSafeInteger(page)||page<0||page>1000||
    query.length>80||branch.length>128)return res.status(400).json({error:'INVALID_FILTER'});
 const name=type==='stock'?'whose_kiot_stock_history':'whose_kiot_document_history';
 const fetched=await rest('rpc/'+name,{method:'POST',bearer,body:{
  p_query:query,p_branch:branch,p_limit:50,p_offset:page*50
 }});
 if(!fetched.ok||!fetched.data)return res.status(502).json({error:'AUDIT_HISTORY_UNAVAILABLE'});
 return res.status(200).json({type,page,...fetched.data,sourceAttribution:'unverified_unless_explicit_document_ref'});
};
