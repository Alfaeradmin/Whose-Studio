'use strict';
// Signed Kiot webhook -> durable inbox -> canonical provider GET -> atomic ledger.
// Stock notifications are refresh hints. Never trust a historical webhook quantity
// as the current balance; re-read KiotViet before writing Whose stock.
const {safeRead}=require('./kiotviet');
const {getConfig}=require('./kiot-inbox-store');
const {canonicalProductForEvent}=require('./kiot-canonical-product');
const {canonicalDocument}=require('./kiot-canonical-document');
const DOC_DOMAINS=new Set(['orders','invoices','purchaseorders','transfers','returns']);
async function rpc(name,body,{env=process.env,fetchImpl=fetch}={}){
 const cfg=getConfig(env);
 if(!cfg)throw new Error('CONNECTOR_STORAGE_NOT_CONFIGURED');
 const response=await fetchImpl(cfg.base+'/rest/v1/rpc/'+name,{
  method:'POST',
  headers:{apikey:cfg.key,...(cfg.key.startsWith('sb_secret_')?{}:{Authorization:'Bearer '+cfg.key}),
   'Content-Type':'application/json','User-Agent':'whose-studio-connector/1.1'},
  body:JSON.stringify(body),signal:AbortSignal.timeout(12000)
 });
 if(!response.ok)throw new Error('CONNECTOR_RPC_FAILED_'+response.status);
 return response.json();
}
const validId=value=>/^[1-9][0-9]{0,14}$/.test(String(value??''));
async function processStock(job,{env,fetchImpl,providerRead}){
 const match=/^([1-9][0-9]{0,14}):([1-9][0-9]{0,14})$/.exec(job.entity_key||'');
 if(!match)throw Error('INVALID_STOCK_HINT');
 const [,productId,branchId]=match;
 // Observed time is taken before outbound GET to reject any late overwrites.
 const observedAt=new Date().toISOString();
 const result=await providerRead('products/'+productId,{includeInventory:true});
 if(!result.ok)throw Error('PROVIDER_STOCK_READ_FAILED');
 const product=result.data;
 if(String(product?.id)!==productId || !Array.isArray(product.inventories))throw Error('INVALID_STOCK_PRODUCT');
 const inv=product.inventories.filter(x=>String(x.branchId)===branchId);
 if(inv.length!==1)throw Error('STOCK_BRANCH_UNAVAILABLE');
 const hand=inv[0].onHand??inv[0].onhand, reserved=inv[0].reserved;
 if(!Number.isFinite(Number(hand))||!Number.isFinite(Number(reserved))||
  hand==null||reserved==null)throw Error('INVALID_STOCK_QUANTITY');
 if(!/^[-]?[0-9]{1,10}(?:[.][0-9]{1,4})?$/.test(String(hand))||
   !/^[-]?[0-9]{1,10}(?:[.][0-9]{1,4})?$/.test(String(reserved)))
  throw Error('UNSUPPORTED_STOCK_PRECISION');
 const stored=await rpc('whose_connector_record_stock',{
  p_inbox_id:job.id,p_lease_token:job.lease_token,
  p_product_id:Number(productId),p_branch_id:Number(branchId),
  p_on_hand:Number(hand),p_reserved:Number(reserved),p_observed_at:observedAt
 },{env,fetchImpl});
 if(!stored?.stored && stored?.status!=='duplicate')throw Error('STOCK_LEDGER_NOT_CONFIRMED');
 return stored.status;
}
async function processDocument(job,{env,fetchImpl,providerRead}){
 if(!validId(job.entity_key))throw Error('INVALID_DOCUMENT_HINT');
 const result=await providerRead(job.domain+'/'+job.entity_key);
 if(!result.ok)throw Error('PROVIDER_DOCUMENT_READ_FAILED');
 const row=canonicalDocument(job.domain,result.data,job.entity_key);
 const stored=await rpc('whose_connector_record_document',{
  p_inbox_id:job.id,p_lease_token:job.lease_token,p_document:row
 },{env,fetchImpl});
 if(stored?.stored!==true && stored?.duplicate!==true)throw Error('DOCUMENT_LEDGER_NOT_CONFIRMED');
}
async function handleOnce({env=process.env,fetchImpl=fetch,providerRead=safeRead}={}){
 const jobs=await rpc('whose_connector_claim_inbox',{p_limit:10},{env,fetchImpl});
 if(!Array.isArray(jobs))throw new Error('INVALID_CLAIM_RESPONSE');
 const summary={claimed:jobs.length,processed:0,retry:0};
 for(const job of jobs){
  let success=false,reason='UNSUPPORTED_DOMAIN';
  try{
   if(job.domain==='products'){
    const outcome=await providerRead('products/'+job.entity_key);
    if(!outcome.ok)reason='PROVIDER_READ_FAILED';
    else{
     const product=canonicalProductForEvent(outcome.data,job.entity_key);
     const stored=await rpc('whose_connector_store_product',{p_row:product},{env,fetchImpl});
     if(stored===true){success=true;reason=null;}else reason='CANONICAL_PERSIST_REJECTED';
    }
   }else if(job.domain==='stock'){
    await processStock(job,{env,fetchImpl,providerRead});
    success=true;reason=null;
   }else if(DOC_DOMAINS.has(job.domain)){
    await processDocument(job,{env,fetchImpl,providerRead});
    success=true;reason=null;
   }else{
    reason='DOMAIN_NOT_IMPLEMENTED';
   }
  }catch(e){
   const name=e instanceof Error?e.message:'';
   reason=/^(?:INVALID_|UNSUPPORTED_|PROVIDER_|DOCUMENT_|STOCK_|CONNECTOR_RPC_FAILED_)/.test(name)?
     name.slice(0,80):'CANONICAL_PERSIST_FAILED';
  }
  const completed=await rpc('whose_connector_finish_inbox',{
   p_id:job.id,p_lease_token:job.lease_token,p_success:success,p_error_code:reason
  },{env,fetchImpl});
  if(completed!==true)throw new Error('LOST_INBOX_LEASE');
  if(success)summary.processed++;else summary.retry++;
 }
 return summary;
}
module.exports={handleOnce,processStock,processDocument};
