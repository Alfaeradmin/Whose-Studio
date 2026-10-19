'use strict';
// Only Whose global admins can inspect source-side synchronization diagnostics.
const {accessToken,rest}=require('../lib/whose-backend');
const {validateStaffBearer}=require('../lib/whose-auth');
const {summarize}=require('../lib/whose-sync-health');
module.exports=async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store');
 if(req.method!=='GET')return res.status(405).json({error:'GET only'});
 const bearer=accessToken(req);
 const staff=await validateStaffBearer(bearer);
 if(!staff.ok)return res.status(staff.status||401).json({error:'Whose staff login required'});
 if(staff.is_global_admin!==true)return res.status(403).json({error:'Global Admin required'});
 const paths=['rpc/whose_connector_health','rpc/whose_kiot_audit_health','rpc/whose_kiot_product_catalog_stats'];
 const results=await Promise.all(paths.map(path=>rest(path,{method:'POST',bearer,body:{}})));
 if(results.some(r=>!r.ok||!r.data||typeof r.data!=='object'||Array.isArray(r.data)))
  return res.status(503).json({error:'Whose synchronization health is unavailable; no healthy status is assumed'});
 try{
  return res.status(200).json(summarize({
   connector:results[0].data,audit:results[1].data,catalog:results[2].data
  }));
 }catch{
  return res.status(503).json({error:'Cannot verify synchronization diagnostics'});
 }
};
