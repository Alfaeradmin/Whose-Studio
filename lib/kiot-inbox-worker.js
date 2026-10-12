'use strict';
// Explicit invocation only: NOT scheduled and never writes to KiotViet.
// Each event is a refresh hint. First implementation deliberately quarantines
// unimplemented domains rather than pretending they have been synchronized.
const {safeRead}=require('./kiotviet');
const {getConfig}=require('./kiot-inbox-store');
const {canonicalProductForEvent}=require('./kiot-canonical-product');
const RESOURCE={products:'products',branches:'branches',orders:'orders',invoices:'invoices',transfers:'transfers',returns:'returns'};
async function rpc(name,body,{env=process.env,fetchImpl=fetch}={}){
 const cfg=getConfig(env);
 if(!cfg)throw new Error('CONNECTOR_STORAGE_NOT_CONFIGURED');
 const response=await fetchImpl(cfg.base+'/rest/v1/rpc/'+name,{
   method:'POST',headers:{apikey:cfg.key,...(cfg.key.startsWith('sb_secret_')?{}:{Authorization:'Bearer '+cfg.key}),'Content-Type':'application/json','User-Agent':'whose-studio-connector/1.0'},
   body:JSON.stringify(body),signal:AbortSignal.timeout(12000)
 });
 if(!response.ok)throw new Error('CONNECTOR_RPC_FAILED_'+response.status);
 return response.json();
}
async function handleOnce({env=process.env,fetchImpl=fetch,providerRead=safeRead}={}){
 const jobs=await rpc('whose_connector_claim_inbox',{p_limit:10},{env,fetchImpl});
 if(!Array.isArray(jobs))throw new Error('INVALID_CLAIM_RESPONSE');
 const summary={claimed:jobs.length,processed:0,retry:0};
 for(const job of jobs){
   let success=false,reason='UNSUPPORTED_DOMAIN';
   try{
     const resource=RESOURCE[job.domain];
     if(resource){
       // Read-only provider probe. Do not mark an event processed yet because
       // normalization/persistence of canonical records is not wired.
       const outcome=job.domain==='products'
         ?await providerRead('products/'+job.entity_key)
         :await providerRead(resource,{id:job.entity_key,pageSize:1});
       if (!outcome.ok) reason='PROVIDER_READ_FAILED';
       else if (job.domain==='products') {
         try {
           const product=canonicalProductForEvent(outcome.data,job.entity_key);
           const stored=await rpc('whose_connector_store_product',{p_row:product},{env,fetchImpl});
           if(stored===true){success=true;reason=null;}
           else reason='CANONICAL_PERSIST_REJECTED';
         } catch { reason='CANONICAL_PRODUCT_OR_PERSIST_FAILED'; }
       } else reason='CANONICAL_PERSIST_NOT_IMPLEMENTED';
     }
   }catch{reason='PROVIDER_READ_FAILED';}
   const completed=await rpc('whose_connector_finish_inbox',{
     p_id:job.id,p_lease_token:job.lease_token,p_success:success,p_error_code:reason
   },{env,fetchImpl});
   if(completed!==true)throw new Error('LOST_INBOX_LEASE');
   if(success)summary.processed++;else summary.retry++;
 }
 return summary;
}
module.exports={handleOnce};
