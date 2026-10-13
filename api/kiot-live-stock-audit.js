'use strict';
// Admin-only live KiotViet read: SKU -> all provider inventories -> optional Whose comparison.
// Never writes KiotViet, modifies Whose, or attributes a delta to an unverified document.
const {validateStaffBearer}=require('../lib/whose-auth');
const {accessToken,rest}=require('../lib/whose-backend');
const {safeRead}=require('../lib/kiotviet');
const {inspect}=require('../lib/kiot-live-stock-audit');
const SKU=/^[A-Za-z0-9][A-Za-z0-9._-]{0,59}$/;
async function handler(req,res){
 res.setHeader('Cache-Control','private,no-store');
 if(req.method!=='GET')return res.status(405).json({error:'GET_ONLY'});
 const bearer=accessToken(req);
 const staff=await validateStaffBearer(bearer);
 if(!staff.ok)return res.status(staff.status).json({error:'STAFF_AUTH_REQUIRED'});
 if(staff.is_global_admin!==true)return res.status(403).json({error:'ADMIN_REQUIRED'});
 const sku=typeof req.query?.sku==='string'?req.query.sku.trim():'';
 if(!SKU.test(sku))return res.status(400).json({error:'INVALID_SKU'});
 const remote=await safeRead('products/code/'+sku,{includeInventory:true});
 if(!remote.ok)return res.status(502).json({error:'KIOT_PRODUCT_READ_FAILED',readOnly:true});
 let local=[],branches=[],snapshots=[],snapshotStatus='not_imported';
 const q=new URLSearchParams({select:'id,sku,kiot_product_id',sku:'eq.'+sku,limit:'2'});
 const matched=await rest('whose_products?'+q.toString(),{bearer});
 if(matched.ok&&Array.isArray(matched.data)&&matched.data.length===1){
  const row=matched.data[0];
  if(String(row.kiot_product_id)===String(remote.data?.id)){
   local=[row];snapshotStatus='unavailable';
   const filters=new URLSearchParams({select:'branch_id,on_hand,reserved,synced_at',product_id:'eq.'+row.id,limit:'200'});
   const results=await Promise.all([
    rest('whose_branches?select=id,kiot_branch_id,name&kiot_branch_id=not.is.null&limit=200',{bearer}),
    rest('whose_inventory_snapshots?'+filters.toString(),{bearer})
   ]);
   if(results.every(x=>x.ok&&Array.isArray(x.data))){
    branches=results[0].data;snapshots=results[1].data;snapshotStatus='available';
   }
  }else snapshotStatus='catalog_identity_mismatch';
 }else if(!matched.ok)snapshotStatus='catalog_unavailable';
 else if(Array.isArray(matched.data)&&matched.data.length>1)snapshotStatus='duplicate_local_sku';
 let result;
 try{result=inspect(remote.data,sku,snapshots,branches)}
 catch(e){
  const code=/^(?:INVALID_|PRODUCT_|PROVIDER_)/.test(e.message)?e.message:'UNVERIFIED_PROVIDER_DATA';
  return res.status(502).json({error:code,readOnly:true});
 }
 return res.status(200).json({
  ...result,checkedAt:new Date().toISOString(),source:'kiotviet_live_product_detail',
  sourceMethod:'GET /products/code/{sku}',snapshotStatus,
  readOnly:true,kiotWritesEnabled:false,mutatesWhose:false
 });
}
module.exports=handler;
