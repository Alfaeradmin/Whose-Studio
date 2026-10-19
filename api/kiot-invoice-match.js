'use strict';
// Invoice matcher Preview. Does not create, modify or settle a Whose or Kiot event.
// Every read uses the caller's bearer and branch permissions (Supabase RLS).
const {accessToken,isUuid,rest}=require('../lib/whose-backend');
const {validateStaffBearer}=require('../lib/whose-auth');
const {safeReadInvoiceByCode,safeRead}=require('../lib/kiotviet');
const {assess}=require('../lib/whose-invoice-matcher');
const codeRe=/^[A-Za-z0-9][A-Za-z0-9_-]{0,47}$/;
module.exports=async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store');
 if(req.method!=='GET')return res.status(405).json({error:'Read-only GET required'});
 const branchId=String(req.query?.branch_id||'');
 const billCode=String(req.query?.bill_code||'');
 const recent=req.query?.recent==='1';
 if(!isUuid(branchId)||(!recent&&!codeRe.test(billCode))||(recent&&billCode))
  return res.status(400).json({error:'Invalid branch or bill lookup'});
 const bearer=accessToken(req);
 const staff=await validateStaffBearer(bearer);
 if(!staff.ok)return res.status(staff.status||401).json({error:'Authorized staff session required'});
 const b=(staff.branches||[]).find(x=>x.id===branchId&&x.is_active===true&&Number.isSafeInteger(Number(x.kiot_branch_id)));
 if(!b||(!staff.is_global_admin&&!(staff.memberships||[]).some(x=>x.branch_id===b.id)))
  return res.status(403).json({error:'No access to this Kiot branch'});
 let invoices=[],sourceWarnings=[];
 if(recent){
  // Explicit user-initiated bounded scan: never add blocking work to chat navigation.
  const listing=await safeRead('invoices',{branchIds:[Number(b.kiot_branch_id)],
   pageSize:8,currentItem:0,orderBy:'modifiedDate',orderDirection:'Desc'});
  if(!listing.ok||!Array.isArray(listing.data?.data))
   return res.status(503).json({error:'Cannot list verified Kiot invoices'});
  const candidates=listing.data.data.filter(x=>Number(x.branchId??x.BranchId)===Number(b.kiot_branch_id)).slice(0,8);
  // Re-fetch details by immutable bill code; list payload is not authoritative
  // evidence of the current invoice status or product variant.
  const details=await Promise.all(candidates.map(async x=>{
   const code=String(x.code??x.Code??'');
   if(!codeRe.test(code))return null;
   const read=await safeReadInvoiceByCode(code);
   return read.ok?read.data:null;
  }));
  invoices=details.filter(item=>item&&Number(item.branchId??item.BranchId)===Number(b.kiot_branch_id));
  if(invoices.length<candidates.length)sourceWarnings.push('Chưa xác minh được tất cả 8 bill gần đây; không coi đây là đồng bộ đầy đủ.');
 }else{
  const kiot=await safeReadInvoiceByCode(billCode);
  if(!kiot.ok)return res.status(kiot.status===404?404:503).json({error:'Verified KiotViet invoice could not be read'});
  const raw=kiot.data;
  if(Number(raw?.branchId??raw?.BranchId)!==Number(b.kiot_branch_id))
   return res.status(404).json({error:'Invoice unavailable for this branch'});
  invoices=[raw];
 }
 const q='whose_department_chats?select=id,branch_id,status,updated_at&branch_id=eq.'+branchId+
  '&status=in.(received,return_requested)&order=updated_at.desc&limit=101';
 const chats=await rest(q,{bearer});
 if(!chats.ok||!Array.isArray(chats.data))return res.status(502).json({error:'Cannot verify store requests'});
 if(chats.data.length>100)return res.status(409).json({error:'Review required: active request search cap exceeded'});
 const list=chats.data||[];
 let lines=[];
 if(list.length){
  const ids=list.map(c=>c.id);
  const ql='whose_department_chat_lines?select=id,chat_id,sku,qty_received,qty_returned,product:product_id(kiot_product_id)&chat_id=in.('+
   ids.join(',')+')&limit=501';
  const rows=await rest(ql,{bearer});
  if(!rows.ok||!Array.isArray(rows.data))return res.status(502).json({error:'Cannot verify request lines'});
  if(rows.data.length>500)return res.status(409).json({error:'Review required: request line search cap exceeded'});
  const map=new Map(list.map(c=>[c.id,c]));
  lines=rows.data.filter(r=>map.has(r.chat_id)).map(r=>({
   id:r.id,chat_id:r.chat_id,branch_id:branchId,chat_status:map.get(r.chat_id).status,
   sku:r.sku,qty_received:r.qty_received,qty_returned:r.qty_returned,
   kiot_product_id:r.product?.kiot_product_id??null
  }));
 }
 const matches=invoices.map(raw=>assess(raw,lines,b.kiot_branch_id));
 // Scan results must never propose allocating one received unit to multiple
 // bills. Within the scanned window, mark every competing line for review.
 if(recent){
  const grouped=new Map();
  for(const result of matches)for(const line of result.lines){
   if(line.kind!=='candidate')continue;
   const key=line.chatId+':'+line.lineId;
   const entry=grouped.get(key)||{total:0,capacity:line.remaining,lines:[]};
   entry.total+=line.qty;entry.lines.push({result,line});grouped.set(key,entry);
  }
  for(const entry of grouped.values())if(entry.total>entry.capacity){
   for(const {result,line} of entry.lines){
    line.kind='review';line.reason='multiple_invoice_claims';
    delete line.chatId;delete line.lineId;
    result.proposedLines--;result.reviewedLines++;
    result.kind='review';result.reason='manual_review_required';
   }
  }
 }
 const serialize=(match)=>({
  bill:{id:match.invoice.id||null,code:match.invoice.code||billCode,
   branchId:match.invoice.branchId||null,status:match.invoice.status??null,
   purchasedAt:match.invoice.purchasedAt||null},
  result:{kind:match.kind,reason:match.reason||null,
   proposedLines:match.proposedLines||0,reviewedLines:match.reviewedLines||0,
   unmatchedLines:match.unmatchedLines||0,lines:match.lines||[],applied:false}
 });
 if(recent)return res.status(200).json({
  recent:true,scanned:invoices.length,limitedTo:8,sourceWarnings,
  results:matches.map(serialize),source:'KiotViet recent verified read-only',
  saved:false});
 const entry=serialize(matches[0]);
 return res.status(200).json({...entry,source:'KiotViet live read-only',saved:false});
};
