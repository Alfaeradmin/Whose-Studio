'use strict';
// Global Admin-driven, read-only Kiot source document historical catch-up.
// Durable server cursor prevents client-side page indexes from skipping source pages.
// ACK inbox BEFORE advancing cursor. Every invocation processes ONE bounded page.
const {createHash}=require('node:crypto');
const {validateStaffBearer,verifyOrigin}=require('../lib/whose-auth');
const {accessToken}=require('../lib/whose-backend');
const {safeRead}=require('../lib/kiotviet');
const {normalizeInboundEvent}=require('../lib/kiot-inbound-event');
const {persistVerifiedHints}=require('../lib/kiot-inbox-store');
const {DOMAIN,getCursor,advanceCursor}=require('../lib/kiot-backfill-cursor');
const SIZE=50;
async function handler(req,res){
 res.setHeader('Cache-Control','private,no-store');
 if(req.method!=='GET'&&req.method!=='POST')return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
 const staff=await validateStaffBearer(accessToken(req));
 if(!staff.ok)return res.status(staff.status).json({error:'STAFF_AUTH_REQUIRED'});
 if(staff.is_global_admin!==true)return res.status(403).json({error:'ADMIN_REQUIRED'});
 if(req.method==='POST'&&!verifyOrigin(req))return res.status(403).json({error:'INVALID_ORIGIN'});
 const domain=req.method==='GET'?req.query?.domain:req.body?.domain;
 if(!DOMAIN.has(domain)||req.method==='POST'&&req.body?.confirm!=='BACKFILL_KIOT_DOCUMENTS')
  return res.status(400).json({error:'INVALID_DOMAIN_OR_CONFIRMATION'});
 // Reject client-controlled cursor or arbitrary body fields. Server owns the next page.
 if(req.method==='POST'&&(!req.body||typeof req.body!=='object'||Array.isArray(req.body)||
  Object.keys(req.body).some(k=>!['domain','confirm'].includes(k))))
  return res.status(400).json({error:'CLIENT_CURSOR_NOT_ALLOWED'});
 const retailer=process.env.KIOTVIET_RETAILER;
 let checkpoint;
 try{checkpoint=await getCursor(retailer,domain)}
 catch(e){
  console.warn('[Whose/backfill/checkpoint]',String(e.message||'').slice(0,64));
  return res.status(503).json({error:'BACKFILL_CURSOR_UNAVAILABLE'});
 }
 if(req.method==='GET')return res.status(200).json({
  domain,...checkpoint,source:'supabase_durable_cursor',readOnly:true});
 if(checkpoint.complete)return res.status(200).json({
  domain,...checkpoint,alreadyComplete:true,queued:0,duplicates:0,
  source:'supabase_durable_cursor',readOnly:true});
 const page=checkpoint.nextPage;
 const r=await safeRead(domain,{pageSize:SIZE,currentItem:page*SIZE});
 if(!r.ok)return res.status(502).json({error:'KIOT_DOCUMENT_PAGE_UNAVAILABLE',page,domain});
 const totalRaw=r.data?.total,records=r.data?.data;
 const total=typeof totalRaw==='number'?totalRaw:
  (typeof totalRaw==='string'&&/^[0-9]+$/.test(totalRaw)?Number(totalRaw):NaN);
 const expected=Number.isSafeInteger(total)&&total>=0&&total<=500000&&
  (page===0||page*SIZE<=total)?Math.min(SIZE,Math.max(0,total-page*SIZE)):null;
 if(!Array.isArray(records)||expected===null||records.length!==expected)
  return res.status(502).json({error:'KIOT_DOCUMENT_PAGE_INCOMPLETE',domain,page,
   received:records?.length??null,expected});
 try{
  const hints=[];
  for(const item of records){
   const id=item?.id;
   if(!/^[1-9][0-9]{0,14}$/.test(String(id??'')))throw Error('INVALID_DOCUMENT_ID');
   const revision=createHash('sha256').update(JSON.stringify([domain,id,
     item.modifiedDate??item.purchaseDate??item.transferDate??item.returnDate??
     item.createdDate??null,item.status??item.statusValue??null])).digest('hex');
   hints.push(normalizeInboundEvent({authenticated:true,retailer,domain,
     entityKey:String(id),providerEventId:'backfill:'+id+':'+revision,version:revision}));
  }
  if(new Set(hints.map(x=>x.event_key)).size!==hints.length)throw Error('DUPLICATE_SOURCE_PAGE');
  const accepted=await persistVerifiedHints(hints);
  if(accepted.inserted+accepted.duplicates!==hints.length)throw Error('INBOX_ACK_INVALID');
  // Crash between inbox ACK and cursor update is safe: the page will be retried and deduped.
  const next=await advanceCursor(retailer,domain,page,total,records.length);
  return res.status(200).json({domain,page,total,pageRows:records.length,
   queued:accepted.inserted,duplicates:accepted.duplicates,
   nextPage:next.nextPage,complete:next.complete,
   hasMore:!next.complete,source:'supabase_durable_cursor',readOnly:true});
 }catch(e){
  const code=String(e?.message||'');
  console.warn('[Whose/backfill/commit]',domain,page,code.slice(0,55));
  if(code==='BACKFILL_CURSOR_CONFLICT')
   return res.status(409).json({error:'BACKFILL_CURSOR_CHANGED',domain,
    guidance:'Refresh cursor and retry; previously queued records remain safe'});
  return res.status(503).json({error:'DOCUMENT_BACKFILL_NOT_COMMITTED',domain,page});
 }
}
module.exports=handler;
