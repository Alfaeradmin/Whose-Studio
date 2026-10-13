'use strict';
// Bounded, read-only KiotViet transaction-document scan by exact product identity.
// Document lines prove participation, NOT stock deltas or causality.
const DOMAINS=Object.freeze({
 invoices:'invoiceDetails',orders:'orderDetails',purchaseorders:'purchaseOrderDetails',
 transfers:'transferDetails',returns:'returnDetails'
});
const ID=/^[1-9][0-9]{0,14}$/;
const PAGE_SIZE=8,MAX_PAGE=9999;
function numeric(v){
 if(v===null||v===undefined||v==='' ||
  !/^-?[0-9]{1,10}(?:\.[0-9]{1,4})?$/.test(String(v)))throw Error('INVALID_SOURCE_LINE_QUANTITY');
 const n=Number(v);
 if(!Number.isFinite(n))throw Error('INVALID_SOURCE_LINE_QUANTITY');
 return n;
}
function validatedDocument(domain,raw,expectedId,productId){
 if(!Object.hasOwn(DOMAINS,domain))throw Error('UNSUPPORTED_DOCUMENT_DOMAIN');
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||!ID.test(String(raw.id))||
   String(raw.id)!==String(expectedId))throw Error('SOURCE_DOCUMENT_ID_MISMATCH');
 const detail=[raw[DOMAINS[domain]],raw.details,raw.items].find(Array.isArray);
 if(!detail||detail.length>250)throw Error('SOURCE_DOCUMENT_LINES_UNAVAILABLE');
 const matched=[];
 for(const row of detail){
  if(!row||!ID.test(String(row.productId??row.ProductId??'')))
   throw Error('SOURCE_DOCUMENT_LINE_ID_UNVERIFIED');
  if(String(row.productId??row.ProductId)!==String(productId))continue;
  // Transfers can have different dispatched and received amounts. Never conflate them.
  if(domain==='transfers'){
   const sent=numeric(row.transferredQuantity??row.sendQuantity??row.quantity);
   const received=row.receivedQuantity??row.recivedQuantity??null;
   matched.push({quantity:sent,receivedQuantity:received==null?null:numeric(received)});
  }else{
   matched.push({quantity:numeric(row.quantity??row.Quantity),receivedQuantity:null});
  }
 }
 if(!matched.length)return null;
 const date=raw.modifiedDate??raw.purchaseDate??raw.transferredDate??
   raw.transferDate??raw.returnDate??raw.createdDate??null;
 const time=typeof date==='string'&&Number.isFinite(Date.parse(date))
   ?new Date(date).toISOString():null;
 const from=raw.fromBranchId, to=raw.toBranchId, branch=raw.branchId;
 return {domain,id:String(raw.id),code:typeof raw.code==='string'?raw.code.slice(0,100):null,
  status:String(raw.statusValue??raw.status??'unknown').slice(0,80),
  time,branchId:ID.test(String(branch??''))?String(branch):null,
  fromBranchId:ID.test(String(from??''))?String(from):null,
  toBranchId:ID.test(String(to??''))?String(to):null,
  lines:matched,sourceEvidence:'direct_kiotviet_document_detail',stockDeltaVerified:false};
}
async function scanPage({domain,page,sku,providerRead,concurrency=3}){
 if(!Object.hasOwn(DOMAINS,domain)||!Number.isSafeInteger(page)||page<0||page>MAX_PAGE||
  !/^[A-Za-z0-9][A-Za-z0-9._-]{0,59}$/.test(sku||''))
  throw Error('INVALID_TRACE_INPUT');
 if(typeof providerRead!=='function'||!Number.isInteger(concurrency)||concurrency<1||concurrency>4)
  throw Error('INVALID_TRACE_CONFIG');
 const prod=await providerRead('products/code/'+sku,{includeInventory:false});
 if(!prod.ok)throw Error('SOURCE_PRODUCT_LOOKUP_FAILED');
 const product=prod.data;
 if(!ID.test(String(product?.id??''))||String(product?.code).toUpperCase()!==sku.toUpperCase())
  throw Error('SOURCE_PRODUCT_IDENTITY_MISMATCH');
 const offset=page*PAGE_SIZE;
 const listing=await providerRead(domain,{pageSize:PAGE_SIZE,currentItem:offset});
 if(!listing.ok)throw Error('SOURCE_DOCUMENT_LIST_FAILED');
 const total=Number(listing.data?.total),rows=listing.data?.data;
 if(!Number.isSafeInteger(total)||total<0||!Array.isArray(rows)||
    rows.length!==Math.min(PAGE_SIZE,Math.max(0,total-offset)))
  throw Error('INCOMPLETE_SOURCE_DOCUMENT_PAGE');
 const ids=rows.map(x=>String(x?.id??''));
 if(ids.some(x=>!ID.test(x))||new Set(ids).size!==ids.length)
  throw Error('UNVERIFIED_SOURCE_DOCUMENT_IDS');
 const results=new Array(ids.length);
 let cursor=0;
 const count=Math.min(concurrency,ids.length);
 await Promise.all(Array.from({length:count},async()=>{
  while(cursor<ids.length){
   const index=cursor++;
   const detail=await providerRead(domain+'/'+ids[index]);
   if(!detail.ok)throw Error('SOURCE_DOCUMENT_DETAIL_FAILED');
   results[index]=validatedDocument(domain,detail.data,ids[index],product.id);
  }
 }));
 return {sku:product.code,productId:String(product.id),domain,page,pageSize:PAGE_SIZE,
  totalDocuments:total,checkedDocuments:ids.length,matchedDocuments:results.filter(Boolean),
  hasMore:offset+ids.length<total,partialHistory:offset+ids.length<total||page>0,
  source:'kiotviet_direct_read',stockDeltaVerified:false,
  guarantee:'only_scanned_document_pages_checked',piiExcluded:true};
}
module.exports={DOMAINS,PAGE_SIZE,MAX_PAGE,validatedDocument,scanPage};
