'use strict';
// Admin-scoped, read-only historical Kiot business-document catch-up.
// Durable inbox prevents duplicates; canonical detail GET and audit persist happen in worker.
const {createHash}=require('node:crypto');
const {validateStaffBearer,verifyOrigin}=require('../lib/whose-auth');
const {accessToken}=require('../lib/whose-backend');
const {safeRead}=require('../lib/kiotviet');
const {normalizeInboundEvent}=require('../lib/kiot-inbound-event');
const {persistVerifiedHints}=require('../lib/kiot-inbox-store');
const DOMAINS=new Set(['orders','invoices','purchaseorders','transfers','returns']);
const SIZE=50;
module.exports=async function handler(req,res){
 res.setHeader('Cache-Control','private,no-store');
 if(req.method!=='POST')return res.status(405).json({error:'POST_ONLY'});
 const staff=await validateStaffBearer(accessToken(req));
 if(!staff.ok)return res.status(staff.status).json({error:'STAFF_AUTH_REQUIRED'});
 if(!staff.is_global_admin)return res.status(403).json({error:'ADMIN_REQUIRED'});
 if(!verifyOrigin(req))return res.status(403).json({error:'INVALID_ORIGIN'});
 const domain=req.body?.domain,page=Number(req.body?.page);
 if(!DOMAINS.has(domain)||!Number.isInteger(page)||page<0||page>9999||
    req.body?.confirm!=='BACKFILL_KIOT_DOCUMENTS')return res.status(400).json({error:'INVALID_PAGE_OR_DOMAIN'});
 const result=await safeRead(domain,{pageSize:SIZE,currentItem:page*SIZE});
 if(!result.ok)return res.status(502).json({error:'KIOT_DOCUMENT_PAGE_UNAVAILABLE',page,domain});
 const total=Number(result.data?.total),records=result.data?.data;
 const expected=Number.isSafeInteger(total)&&total>=0?Math.min(SIZE,Math.max(0,total-page*SIZE)):null;
 if(!Array.isArray(records)||expected===null||records.length!==expected)
  return res.status(502).json({error:'KIOT_DOCUMENT_PAGE_INCOMPLETE',domain,page,received:records?.length??null,expected});
 const retailer=process.env.KIOTVIET_RETAILER;
 const hints=[];
 try{
  for(const item of records){
   const id=item?.id;
   if(!/^[1-9][0-9]{0,14}$/.test(String(id??'')))throw Error('INVALID_DOCUMENT_ID');
   const revision=createHash('sha256').update(JSON.stringify([domain,id,
     item.modifiedDate??item.purchaseDate??item.transferDate??item.returnDate??item.createdDate??null,
     item.status??item.statusValue??null])).digest('hex');
   hints.push(normalizeInboundEvent({authenticated:true,retailer,domain,entityKey:String(id),
    providerEventId:'backfill:'+String(id)+':'+revision,version:revision}));
  }
  const stored=await persistVerifiedHints(hints);
  return res.status(200).json({domain,page,total,pageRows:records.length,queued:stored.inserted,
    duplicates:stored.duplicates,hasMore:(page+1)*SIZE<total,source:'kiot_read_only'});
 }catch(e){
  console.warn('[Whose/Kiot/history-backfill]',domain,page,String(e?.message||'').slice(0,40));
  return res.status(503).json({error:'DOCUMENT_BACKFILL_NOT_COMMITTED',domain,page});
 }
};
