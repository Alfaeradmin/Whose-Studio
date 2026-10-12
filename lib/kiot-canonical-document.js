'use strict';
// Canonical, PII-free Kiot document snapshot. Never infer inventory movement
// from a document's existence or status.
const TYPES={orders:'orderDetails',invoices:'invoiceDetails',purchaseorders:'purchaseOrderDetails',
  transfers:'transferDetails',returns:'returnDetails'};
function positiveId(value){return /^[1-9][0-9]{0,14}$/.test(String(value??''));}
function canonicalDocument(resource,raw,expectedId){
 if(!Object.hasOwn(TYPES,resource)||!raw||typeof raw!=='object'||Array.isArray(raw))
  throw Error('INVALID_DOCUMENT');
 if(!positiveId(raw.id)||String(raw.id)!==String(expectedId))throw Error('DOCUMENT_ID_MISMATCH');
 const key=TYPES[resource];
 const possible=[raw[key],raw.details,raw.items];
 const details=possible.find(Array.isArray);
 // Missing lines are never silently presented as a fully sourced transaction.
 if(!details)throw Error('DOCUMENT_LINES_NOT_AVAILABLE');
 if(details.length>200)throw Error('TOO_MANY_DOCUMENT_LINES');
 const lines=details.map(row=>{
  const productId=row?.productId??row?.ProductId;
  const quantity=row?.quantity??row?.Quantity;
  if(!positiveId(productId)||!Number.isFinite(Number(quantity))||Math.abs(Number(quantity))>1e9)
    throw Error('INVALID_DOCUMENT_LINE');
  return {productId:String(productId),quantity:Number(quantity)};
 });
 const branchId=raw.branchId??raw.fromBranchId??null;
 const time=raw.modifiedDate??raw.purchaseDate??raw.transferDate??raw.returnDate??raw.createdDate??null;
 return {id:String(raw.id),code:typeof raw.code==='string'?raw.code.slice(0,120):null,
   branchId:positiveId(branchId)?String(branchId):null,
   status:String(raw.statusValue??raw.status??'unknown').slice(0,80),
   time:typeof time==='string'&&Number.isFinite(Date.parse(time))?new Date(time).toISOString():null,
   lines};
}
module.exports={canonicalDocument};
