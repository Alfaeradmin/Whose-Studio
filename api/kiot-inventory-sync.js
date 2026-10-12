'use strict';
// Admin-triggered, strictly inbound inventory snapshots. Never writes to KiotViet.
const {validateStaffBearer,verifyOrigin}=require('../lib/whose-auth');
const {accessToken}=require('../lib/whose-backend');
const {safeRead}=require('../lib/kiotviet');
const HOST='https://fjauxxunyxxboduyxjyr.supabase.co';
async function service(path,method='GET',body){
 const key=process.env.WHOSE_CONNECTOR_SERVICE_ROLE_KEY;
 if(!key||!(key.startsWith('sb_secret_')||key.startsWith('eyJ')))throw Error('SERVICE_NOT_CONFIGURED');
 const headers={apikey:key,Accept:'application/json',...(key.startsWith('sb_secret_')?{}:{Authorization:'Bearer '+key})};
 if(body!==undefined)headers['Content-Type']='application/json';
 const res=await fetch(HOST+'/rest/v1/'+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(12000)});
 if(!res.ok)throw Error('SUPABASE_'+res.status);
 return res.json();
}
function parse(page){
 if(!page||!Array.isArray(page.data)||!Number.isSafeInteger(Number(page.total)))throw Error('INVALID_PROVIDER_PAGE');
 const result=[],seen=new Set();
 for(const product of page.data){
  if(!/^[1-9][0-9]{0,14}$/.test(String(product.id??'')))throw Error('INVALID_PRODUCT_ID');
  if(!Array.isArray(product.inventories))throw Error('INVENTORIES_NOT_INCLUDED');
  for(const inv of product.inventories){
   const branch=String(inv.branchId??'');
   if(!/^[1-9][0-9]{0,14}$/.test(branch))throw Error('INVALID_BRANCH_ID');
   const key=product.id+':'+branch;
   if(seen.has(key))throw Error('DUPLICATE_INVENTORY');seen.add(key);
   const hand=inv.onHand??inv.onhand,reserved=inv.reserved??0;
   if(!Number.isFinite(Number(hand))||!Number.isFinite(Number(reserved)))throw Error('INVALID_QUANTITY');
   result.push({productId:String(product.id),branchId:branch,onHand:String(hand),reserved:String(reserved)});
  }
 }
 return result;
}
module.exports=async function handler(req,res){
 res.setHeader('Cache-Control','private,no-store');
 if(!['GET','POST'].includes(req.method))return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
 const staff=await validateStaffBearer(accessToken(req));
 if(!staff.ok)return res.status(staff.status).json({error:'STAFF_AUTH_REQUIRED'});
 if(staff.is_global_admin!==true)return res.status(403).json({error:'ADMIN_REQUIRED'});
 if(req.method==='POST'&&!verifyOrigin(req))return res.status(403).json({error:'INVALID_ORIGIN'});
 const page=Number(req.method==='GET'?req.query?.page:req.body?.page);
 if(!Number.isSafeInteger(page)||page<0||page>999)return res.status(400).json({error:'INVALID_PAGE'});
 if(req.method==='POST'&&req.body?.confirm!=='IMPORT_KIOT_INVENTORY')return res.status(400).json({error:'CONFIRM_REQUIRED'});
 try{
  const r=await safeRead('products',{pageSize:100,currentItem:page*100,includeInventory:true});
  if(!r.ok)return res.status(502).json({error:'KIOT_READ_FAILED'});
  const total=Number(r.data?.total);
  if(!Number.isSafeInteger(total)||total<0||!Array.isArray(r.data?.data)||r.data.data.length!==Math.min(100,Math.max(0,total-page*100)))
   return res.status(502).json({error:'INCOMPLETE_PROVIDER_PAGE'});
  const rows=parse(r.data);
  const branches=await service('whose_branches?select=kiot_branch_id&kiot_branch_id=not.is.null');
  const allowed=new Set(branches.map(b=>String(b.kiot_branch_id)));
  const mapped=rows.filter(x=>allowed.has(x.branchId));
  // Preserve unmapped records as a diagnostic; never silently assign them.
  const unmapped=rows.length-mapped.length;
  if(req.method==='GET')return res.status(200).json({page,total,productRows:r.data.data.length,inventoryRows:mapped.length,unmappedBranchRows:unmapped,mode:'preview'});
  const result=mapped.length?await service('rpc/whose_sync_kiot_inventory_page','POST',{p_rows:mapped}):{stored:0};
  if(result.stored!==mapped.length)throw Error('INCOMPLETE_SAVE');
  return res.status(200).json({page,total,productRows:r.data.data.length,stored:result.stored,unmappedBranchRows:unmapped,hasMore:(page+1)*100<total});
 }catch(e){
  console.warn('[whose/inventory-sync]',e.message);
  return res.status(503).json({error:'INVENTORY_SYNC_NOT_COMPLETED',code:e.message});
 }
};