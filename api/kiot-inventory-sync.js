'use strict';
// Admin-triggered, strictly inbound inventory snapshots. Never writes to KiotViet.
const {validateStaffBearer,verifyOrigin}=require('../lib/whose-auth');
const {accessToken,rest}=require('../lib/whose-backend');
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
 // Read-only inventory is scoped to active branch memberships by the database.
 // Mutating imports and raw Kiot provider previews remain Global Admin-only.
 // Inventory reads are full-dataset, role-checked database functions.
 const branch=typeof req.query?.branch==='string'?req.query.branch.trim():'';
 if(req.method==='GET'&&['summary','stored'].includes(req.query?.view)){
  if(branch.length>128)return res.status(400).json({error:'INVALID_BRANCH'});
  if(req.query.view==='summary'){
   const found=await rest('rpc/whose_inventory_summary_filtered',{method:'POST',bearer:accessToken(req),body:{p_branch:branch}});
   if(!found.ok||!found.data)return res.status(502).json({error:'INVENTORY_SUMMARY_UNAVAILABLE'});
   return res.status(200).json(found.data);
  }
  const offset=Number(req.query?.offset??0);
  const query=typeof req.query?.q==='string'?req.query.q.normalize('NFC').trim():'';
  if(!Number.isSafeInteger(offset)||offset<0||offset>100000||query.length>80)
   return res.status(400).json({error:'INVALID_INVENTORY_FILTER'});
  const found=await rest('rpc/whose_inventory_search_page',{method:'POST',bearer:accessToken(req),
   body:{p_limit:100,p_offset:offset,p_query:query,p_branch:branch}});
  if(!found.ok||!found.data)return res.status(502).json({error:'SNAPSHOT_READ_FAILED'});
  return res.status(200).json(found.data);
 }
 if(staff.is_global_admin!==true)return res.status(403).json({error:'ADMIN_REQUIRED'});
 if(req.method==='POST'&&!verifyOrigin(req))return res.status(403).json({error:'INVALID_ORIGIN'});
 const page=Number(req.method==='GET'?req.query?.page:req.body?.page);
 if(!Number.isSafeInteger(page)||page<0||page>999)return res.status(400).json({error:'INVALID_PAGE'});
 if(req.method==='POST'&&req.body?.confirm!=='IMPORT_KIOT_INVENTORY')return res.status(400).json({error:'CONFIRM_REQUIRED'});
 try{
  let r,lastStatus=null;
  for(let attempt=0;attempt<3;attempt++){
   r=await safeRead('products',{pageSize:100,currentItem:page*100,includeInventory:true});
   if(r.ok)break;
   const m=/KiotViet GET \/products failed \((\d{3})\)/.exec(r.error||'');
   lastStatus=m?Number(m[1]):null;
   if(lastStatus&&![408,429,500,502,503,504].includes(lastStatus))break;
   if(attempt<2)await new Promise(resolve=>setTimeout(resolve,400*(attempt+1)));
  }
  if(!r.ok){
   console.warn('[whose/inventory-sync] provider read unavailable',page,lastStatus);
   return res.status(502).json({error:'KIOT_READ_FAILED',page,upstreamStatus:lastStatus,retryable:lastStatus===null||[408,429,500,502,503,504].includes(lastStatus)});
  }
  const total=Number(r.data?.total);
  const actual=Array.isArray(r.data?.data)?r.data.data.length:null;
  const expected=Number.isSafeInteger(total)&&total>=0?Math.min(100,Math.max(0,total-page*100)):null;
  if(expected===null||actual!==expected){
   console.warn('[whose/inventory-sync] incomplete page',page,'actual',actual,'expected',expected);
   return res.status(502).json({error:'INCOMPLETE_PROVIDER_PAGE',page,received:actual,expected,retryable:true});
  }
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