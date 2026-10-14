/* Whose inventory custody / KiotViet invoice matching, shared pure logic.
 * Suggested match != confirmed sale. A matching SKU alone is never proof. */
(function(root,factory){
 const api=factory();if(typeof module!=='undefined'&&module.exports)module.exports=api;
 if(root)root.WhoseOpsBillMatch=api;
})(typeof window!=='undefined'?window:null,function(){
 'use strict';
 const nonneg=n=>Number.isSafeInteger(n)&&n>=0;
 const validSku=s=>typeof s==='string'&&/^[A-Za-z0-9._-]{1,100}$/.test(s);
 function key(c,sku){return c.id+'::'+sku.toUpperCase()}
 function normalizeInvoice(raw){
  if(!raw||typeof raw!=='object'||!/^[1-9][0-9]{0,14}$/.test(String(raw.id??''))||
    !['LVS','NVT'].includes(raw.branch)||!Number.isFinite(Date.parse(raw.at))||
    !Array.isArray(raw.lines)||!raw.lines.length||raw.lines.length>100)
   throw Error('UNVERIFIED_INVOICE');
  const seen=new Set();
  const lines=raw.lines.map((l,i)=>{
   const sku=String(l.sku||'').toUpperCase();
   if(!validSku(sku)||!nonneg(l.qty)||l.qty===0||seen.has(sku))throw Error('UNVERIFIED_INVOICE_LINE');
   seen.add(sku);
   return {id:typeof l.id==='string'?l.id:String(i),sku,qty:l.qty};
  });
  return {id:String(raw.id),code:String(raw.code||raw.id).slice(0,70),branch:raw.branch,at:raw.at,
   status:raw.status||'unknown',warehouse:raw.warehouse||null,verified:raw.verified===true,
   lines};
 }
 function stats(call,sku,links=[],invoices=[]){
  const line=call?.lines?.find(x=>x.sku?.toUpperCase()===sku?.toUpperCase());
  if(!line)throw Error('UNKNOWN_BORROW_LINE');
  const issued=['completed','disputed'].includes(call.status)?line.received:
   ['delivered'].includes(call.status)?line.picked:0;
  if(!nonneg(issued))throw Error('INVALID_ISSUED_QTY');
  const returned=line.returned||0;if(!nonneg(returned)||returned>issued)throw Error('INVALID_RETURN_QTY');
  const linked=links.filter(x=>x.callId===call.id&&x.sku===sku&&x.confirmed===true);
  if(Array.isArray(invoices)&&invoices.length&&linked.some(x=>{
   const doc=invoices.find(d=>String(d.id)===String(x.invoiceId));
   return !doc||doc.verified!==true||doc.status!=='finalized';
  }))throw Error('CONFIRMED_INVOICE_SOURCE_CHANGED');
  const confirmed=linked.reduce((sum,x)=>sum+x.qty,0);
  if(!nonneg(confirmed)||confirmed+returned>issued)throw Error('MATCH_ALLOCATION_EXCEEDS_ISSUED');
  return {sku,issued,confirmed,returned,stillBorrowed:issued-confirmed-returned,
   sold:confirmed,needsReturn:issued-confirmed-returned>0};
 }
 function candidates(calls,invoices,links=[]){
  const normalized=invoices.map(normalizeInvoice),candidates=[],ambiguous=[],ignored=[];
  const usedByInvoice=new Map();
  for(const l of links.filter(x=>x.confirmed)){
   const k=l.invoiceId+'::'+l.sku;
   usedByInvoice.set(k,(usedByInvoice.get(k)||0)+l.qty);
  }
  for(const invoice of normalized){
   if(!invoice.verified||invoice.status!=='finalized'){ignored.push({invoice:invoice.code,reason:'NOT_VERIFIED_FINALIZED'});continue}
   for(const item of invoice.lines){
    const remaining=item.qty-(usedByInvoice.get(invoice.id+'::'+item.sku)||0);
    if(remaining<0)throw Error('INVOICE_OVER_ALLOCATED');
    if(!remaining)continue;
    const matches=calls.filter(c=>c.branch===invoice.branch&&
     ['delivered','completed','disputed'].includes(c.status)&&
     Number.isFinite(typeof c.created==='number'?c.created:Date.parse(c.created))&&
     Date.parse(invoice.at)>=(typeof c.created==='number'?c.created:Date.parse(c.created))&&
     Date.parse(invoice.at)<=(typeof c.created==='number'?c.created:Date.parse(c.created))+7*86400000&&
     (!invoice.warehouse||invoice.warehouse===c.zone)).flatMap(c=>{
      try{const st=stats(c,item.sku,links,invoices);return st.stillBorrowed>0?[{callId:c.id,sku:item.sku,
       available:st.stillBorrowed,invoiceId:invoice.id,invoiceCode:invoice.code,invoiceQty:remaining}]:[]}
      catch(e){if(e.message==='UNKNOWN_BORROW_LINE')return [];throw e}
     });
    if(matches.length===1&&matches[0].available>=remaining)candidates.push({
      ...matches[0],qty:remaining,confidence:'unique_candidate',confirmed:false});
    else if(matches.length>1)ambiguous.push({invoiceCode:invoice.code,invoiceId:invoice.id,
      sku:item.sku,qty:remaining,candidateCallIds:matches.map(x=>x.callId),reason:'MULTIPLE_POSSIBLE_BORROWS'});
    else ignored.push({invoice:invoice.code,sku:item.sku,reason:matches.length?'QUANTITY_CONFLICT':'NO_ELIGIBLE_BORROW'});
   }
  }
  return {candidates,ambiguous,ignored,confirmed:links.filter(x=>x.confirmed)};
 }
 function linkedBills(callId,links=[],invoices=[]){
  return links.filter(x=>x.callId===callId&&x.confirmed).map(x=>({
   ...x,code:invoices.find(inv=>String(inv.id)===x.invoiceId)?.code||x.invoiceId
  }));
 }
 function billToCalls(invoiceId,links=[]){
  return links.filter(x=>x.invoiceId===String(invoiceId)&&x.confirmed)
   .map(x=>({callId:x.callId,sku:x.sku,qty:x.qty}));
 }
 return {key,normalizeInvoice,stats,candidates,linkedBills,billToCalls};
});
