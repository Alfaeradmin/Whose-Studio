'use strict';
// Read-only, bounded KiotViet invoice investigation by verified branch and SKU.
// No customer fields, no automatic match, no stock changes and no false full-history claim.
const {accessToken,rest}=require('../lib/whose-backend');
const {validateStaffBearer}=require('../lib/whose-auth');
const {safeRead}=require('../lib/kiotviet');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SKU=/^[A-Za-z0-9._-]{1,100}$/;
function normalizeInvoice(doc,sku,branchKiot){
 if(!doc||String(doc.branchId)!==String(branchKiot)||!Array.isArray(doc.invoiceDetails))throw Error('UNVERIFIED_INVOICE_DETAIL');
 if(!/^[1-9][0-9]{0,14}$/.test(String(doc.id))||typeof doc.code!=='string')throw Error('UNVERIFIED_INVOICE_ID');
 const lines=doc.invoiceDetails.filter(x=>String(x.productCode||'').toUpperCase()===sku.toUpperCase())
  .map(x=>({sku,qty:Number(x.quantity)}));
 if(lines.some(x=>!Number.isSafeInteger(x.qty)||x.qty<=0))throw Error('UNVERIFIED_INVOICE_QUANTITY');
 const count=lines.reduce((sum,x)=>sum+x.qty,0);
 if(!count)return null;
 return {id:String(doc.id),code:doc.code.slice(0,80),
  purchasedAt:typeof doc.purchaseDate==='string'?doc.purchaseDate:null,
  branchId:String(doc.branchId),sku,qty:count,
  statusValue:String(doc.statusValue||'').slice(0,80),
  rawStatus:Number.isSafeInteger(Number(doc.status))?Number(doc.status):null,
  // 'verified' means document/detail identity checked; does NOT mean sold or matched.
  documentVerified:true,finalSaleVerified:false,matchedCallId:null,hasCustomerPII:false};
}
function validFilters(req){
 const branch=req.query?.branch,sku=req.query?.sku,page=Number(req.query?.page??0);
 const after=req.query?.since;
 if(typeof branch!=='string'||!UUID.test(branch)||typeof sku!=='string'||!SKU.test(sku)||
   !Number.isSafeInteger(page)||page<0||page>30||
   typeof after!=='string'||!/^\d{4}-\d{2}-\d{2}T/.test(after)||
   !Number.isFinite(Date.parse(after))||
   Date.parse(after)>Date.now()+3600000||
   Date.parse(after)<Date.now()-31*86400000)return null;
 return {branch,sku:sku.toUpperCase(),page,since:new Date(after).toISOString()};
}
async function handler(req,res){
 res.setHeader('Cache-Control','private,no-store');
 if(req.method!=='GET')return res.status(405).json({error:'GET_ONLY'});
 const staff=await validateStaffBearer(accessToken(req));
 if(!staff.ok)return res.status(staff.status).json({error:'STAFF_AUTH_REQUIRED'});
 const q=validFilters(req);
 if(!q)return res.status(400).json({error:'INVALID_INVOICE_FILTER'});
 if(!staff.is_global_admin&&!staff.memberships.some(x=>x.branch_id===q.branch))
  return res.status(403).json({error:'BRANCH_ACCESS_DENIED'});
 const rows=await rest('whose_branches?select=id,kiot_branch_id&is_active=eq.true&id=eq.'+q.branch+
  '&limit=1',{bearer:accessToken(req)});
 const branch=rows.ok&&Array.isArray(rows.data)?rows.data[0]:null;
 if(!/^[1-9][0-9]{0,14}$/.test(String(branch?.kiot_branch_id||'')))
  return res.status(503).json({error:'KIOT_BRANCH_UNMAPPED'});
 const size=10,start=q.page*size;
 const r=await safeRead('invoices',{branchIds:[branch.kiot_branch_id],
  fromPurchaseDate:q.since,pageSize:size,currentItem:start,
  orderBy:'purchaseDate',orderDirection:'Desc'});
 if(!r.ok)return res.status(502).json({error:'KIOT_INVOICE_SOURCE_UNAVAILABLE',incomplete:true});
 const total=Number(r.data?.total),items=r.data?.data;
 if(!Number.isSafeInteger(total)||total<0||!Array.isArray(items)||
  items.length!==Math.min(size,Math.max(0,total-start)))
  return res.status(502).json({error:'KIOT_INVOICE_PAGE_INCOMPLETE',incomplete:true});
 const result=Array(items.length);let cursor=0;
 try{
  await Promise.all(Array.from({length:Math.min(3,items.length)},async()=>{
   while(cursor<items.length){
    const index=cursor++,id=String(items[index]?.id||'');
    if(!/^[1-9][0-9]{0,14}$/.test(id))throw Error('INVALID_SOURCE_ID');
    const fetched=await safeRead('invoices/'+id);
    if(!fetched.ok)throw Error('SOURCE_DETAIL_FAILED');
    if(String(fetched.data?.id)!==id)throw Error('SOURCE_ID_MISMATCH');
    result[index]=normalizeInvoice(fetched.data,q.sku,branch.kiot_branch_id);
   }
  }));
 }catch(e){console.warn('[Whose/invoice-probe]',e.message);
  return res.status(502).json({error:'INVOICE_DETAIL_UNVERIFIED',incomplete:true})}
 return res.status(200).json({rows:result.filter(Boolean),source:'direct_kiotviet_invoice_detail',
  scanned:items.length,totalDocuments:total,page:q.page,
  hasMore:start+items.length<total,scope:'one_page_only',
  status:'unlinked_source_candidates',stockPoolVerification:'not_inferred_from_branch',
  noSaleMatchClaims:true,readOnly:true});
}
module.exports=handler;
module.exports._test={normalizeInvoice,validFilters};
