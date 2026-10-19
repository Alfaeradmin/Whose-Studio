'use strict';
// Read-only candidate assessment. NEVER post stock movement or mark a request sold
// until confirmed and uniquely linked in the source-verified transactional ledger.
const sku=value=>String(value||'').normalize('NFC').trim().toUpperCase();
const positiveInt=value=>Number.isSafeInteger(Number(value))&&Number(value)>0?Number(value):null;
const validId=value=>Number.isSafeInteger(Number(value))&&Number(value)>0?Number(value):null;
const activeStatuses=new Set(['received','return_requested']);
function normalizeInvoice(raw){
 if(!raw||typeof raw!=='object')return {valid:false,reason:'invoice_missing'};
 const id=validId(raw.id??raw.Id),branchId=validId(raw.branchId??raw.BranchId);
 const code=String(raw.code??raw.Code??'').trim();
 const status=Number(raw.status??raw.Status);
 const statusLabel=String(raw.statusValue??raw.StatusValue??'').toLowerCase();
 // KiotViet Retail invoices: 1 completed, 2 canceled (different from orders).
 if(!id||!branchId||!code)return {valid:false,reason:'invoice_identity_missing'};
 if(status!==1||/hủy|huỷ|cancel|delete|đang xử lý/.test(statusLabel))
  return {valid:false,reason:'invoice_not_completed',id,code,branchId,status};
 const rawLines=raw.invoiceDetails??raw.InvoiceDetails;
 if(!Array.isArray(rawLines)||!rawLines.length)return {valid:false,reason:'invoice_lines_missing',id,code,branchId,status};
 const lines=rawLines.map((line,index)=>({
  index,
  detailId:validId(line.id??line.Id??line.detailId??line.DetailId),
  productId:validId(line.productId??line.ProductId),
  code:sku(line.productCode??line.ProductCode??line.sku??line.Sku),
  qty:positiveInt(line.quantity??line.Quantity)
 }));
 if(lines.some(line=>!line.productId||!line.code||!line.qty))
  return {valid:false,reason:'invoice_line_unverifiable',id,code,branchId,status};
 return {valid:true,id,code,branchId,status,
  purchasedAt:String(raw.purchaseDate??raw.PurchaseDate??''),
  modifiedAt:String(raw.modifiedDate??raw.ModifiedDate??''),
  lines};
}
function assess(invoiceRaw,requestLines,branchKiotId){
 const invoice=normalizeInvoice(invoiceRaw);
 const branch=validId(branchKiotId);
 if(!invoice.valid)return {kind:'blocked',reason:invoice.reason,invoice,lines:[]};
 if(!branch||invoice.branchId!==branch)return {kind:'blocked',reason:'wrong_branch',invoice,lines:[]};
 if(!Array.isArray(requestLines))return {kind:'blocked',reason:'request_source_missing',invoice,lines:[]};
 const grouped=new Map();
 for(const l of requestLines){
  if(!l||!activeStatuses.has(l.chat_status))continue;
  const id=String(l.id||''),chatId=String(l.chat_id||''),branchId=String(l.branch_id||'');
  const remaining=Number(l.qty_received)-Number(l.qty_returned);
  if(!id||!chatId||!branchId||!Number.isInteger(remaining)||remaining<=0)continue;
  const productId=validId(l.kiot_product_id);
  const item={id,chatId,sku:sku(l.sku),productId,remaining,branchId};
  if(!item.sku)continue;
  if(!grouped.has(item.sku))grouped.set(item.sku,[]);
  grouped.get(item.sku).push(item);
 }
 const totals=new Map();
 for(const line of invoice.lines)totals.set(line.code,(totals.get(line.code)||0)+line.qty);
 const lines=invoice.lines.map(line=>{
  const candidates=(grouped.get(line.code)||[]).filter(c=>!c.productId||c.productId===line.productId);
  if(!candidates.length)return {...line,kind:'unmatched',reason:'no_received_source'};
  if(candidates.length>1)return {...line,kind:'review',reason:'multiple_request_sources',candidates:candidates.map(c=>({chatId:c.chatId,lineId:c.id}))};
  const c=candidates[0];
  if(!c.productId)return {...line,kind:'review',reason:'product_identity_unverified',candidates:[{chatId:c.chatId,lineId:c.id}]};
  if(totals.get(line.code)>c.remaining)return {...line,kind:'review',reason:'insufficient_received_custody',remaining:c.remaining,candidates:[{chatId:c.chatId,lineId:c.id}]};
  return {...line,kind:'candidate',reason:'unique_verified_source',chatId:c.chatId,lineId:c.id,remaining:c.remaining};
 });
 const kinds=new Set(lines.map(x=>x.kind));
 return {kind:kinds.has('review')?'review':kinds.has('candidate')?'candidates':'unmatched',
  reason:kinds.has('review')?'manual_review_required':null,invoice,lines,
  proposedLines:lines.filter(x=>x.kind==='candidate').length,
  reviewedLines:lines.filter(x=>x.kind==='review').length,
  unmatchedLines:lines.filter(x=>x.kind==='unmatched').length,
  applied:false};
}
module.exports={normalizeInvoice,assess};
