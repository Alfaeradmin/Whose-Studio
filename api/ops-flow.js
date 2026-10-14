'use strict';
// Whose Store ↔ Warehouse workflow. All mutations are Whose-only RPCs guarded
// by active shift duties; no stock/quantity is ever written to KiotViet.
const {accessToken,rest}=require('../lib/whose-backend');
const {validateStaffBearer,verifyOrigin}=require('../lib/whose-auth');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ZONE=/^[A-Z0-9_-]{1,32}$/;
const SKU=/^[A-Za-z0-9._-]{1,100}$/;
const DUTY=new Set(['seller','picker','runner','receiver','lead']);
const ACTION=new Set(['scan','short','ready','take','deliver','receive','cancel']);
const validId=x=>typeof x==='string'&&UUID.test(x);
const fail=(res,code,message)=>res.status(code).json({error:message});
function requestBody(req){
 if(req.body&&typeof req.body==='object'&&!Array.isArray(req.body))return req.body;
 return null;
}
function lines(value,mode){
 if(!Array.isArray(value)||value.length<1||value.length>30)return false;
 const set=new Set();
 for(const row of value){
  if(!row||typeof row!=='object'||Array.isArray(row)||!SKU.test(row.sku||'')||
    !Number.isInteger(row.qty)||row.qty<(mode==='receive'?0:1)||row.qty>100||
    set.has(row.sku.toUpperCase()))return false;
  set.add(row.sku.toUpperCase());
 }
 return true;
}
function validate(body){
 const branch=body.branch;
 if(body.type==='submit'){
  return validId(branch)&&ZONE.test(body.zone||'')&&validId(body.key)&&
   typeof(body.note??'')==='string'&&body.note?.length<=500&&lines(body.lines,'submit')?
   ['whose_ops_submit',{p_branch:branch,p_zone:body.zone,p_lines:body.lines,
    p_key:body.key,p_note:body.note||null}]:null;
 }
 if(body.type==='claim'){
  const ids=body.calls;
  return Array.isArray(ids)&&ids.length>=1&&ids.length<=8&&ids.every(validId)&&new Set(ids).size===ids.length?
   ['whose_ops_claim_wave',{p_ids:ids}]:null;
 }
 if(body.type==='action'){
  if(!validId(body.id)||!ACTION.has(body.action)||!validId(body.key)||
    !Number.isSafeInteger(body.version)||body.version<0||
    (body.sku!=null&&!SKU.test(body.sku))||
    (body.qty!=null&&(!Number.isInteger(body.qty)||body.qty<0||body.qty>100))||
    (body.reason!=null&&(typeof body.reason!=='string'||body.reason.length>300))||
    (body.action==='receive'&&!lines(body.lines,'receive'))||
    (body.action!=='receive'&&body.lines!=null))return null;
  return ['whose_ops_action',{p_id:body.id,p_action:body.action,
   p_expected_version:body.version,p_key:body.key,p_sku:body.sku||null,
   p_qty:body.qty??null,p_reason:body.reason||null,p_lines:body.lines||null}];
 }
 if(body.type==='assignShift'){
  const start=Date.parse(body.start||''),end=Date.parse(body.end||'');
  return validId(branch)&&validId(body.user)&&DUTY.has(body.duty)&&ZONE.test(body.zone||'')&&
   Number.isFinite(start)&&Number.isFinite(end)&&end>start&&end-start<=86400000&&
   typeof body.active==='boolean'?
   ['whose_ops_shift_set',{p_branch:branch,p_user:body.user,p_duty:body.duty,p_zone:body.zone,
    p_start:new Date(start).toISOString(),p_end:new Date(end).toISOString(),p_active:body.active}]:null;
 }
 return null;
}
function safeStatus(status){
 return status===401?401:status===403?403:status===400?400:status===409?409:503;
}
async function handler(req,res){
 res.setHeader('Cache-Control','private,no-store');
 if(!['GET','POST'].includes(req.method))return fail(res,405,'METHOD_NOT_ALLOWED');
 const bearer=accessToken(req),staff=await validateStaffBearer(bearer);
 if(!staff.ok)return fail(res,staff.status,'LOGIN_OR_STAFF_REQUIRED');
 if(req.method==='GET'){
  const branch=req.query?.branch;
  const offset=Number(req.query?.offset??0),limit=Number(req.query?.limit??80);
  if(!validId(branch)||!Number.isSafeInteger(offset)||offset<0||offset>10000||
    !Number.isSafeInteger(limit)||limit<1||limit>100)return fail(res,400,'INVALID_BOARD_FILTER');
  const result=await rest('rpc/whose_ops_board',{method:'POST',bearer,
   body:{p_branch:branch,p_limit:limit,p_offset:offset}});
  if(!result.ok)return fail(res,safeStatus(result.status),'OPS_BOARD_UNAVAILABLE_OR_SHIFT_REQUIRED');
  return res.status(200).json(result.data);
 }
 if(!verifyOrigin(req))return fail(res,403,'INVALID_ORIGIN');
 if(Number(req.headers?.['content-length']||0)>16384)return fail(res,413,'PAYLOAD_TOO_LARGE');
 const body=requestBody(req),validated=body&&validate(body);
 if(!validated)return fail(res,400,'INVALID_OPS_ACTION');
 const [rpc,args]=validated;
 const result=await rest('rpc/'+rpc,{method:'POST',bearer,body:args});
 if(!result.ok){
  // Do not echo raw database exception messages or information about other staff.
  return fail(res,safeStatus(result.status),'OPS_CONFLICT_OR_PERMISSION_DENIED');
 }
 return res.status(body.type==='submit'?201:200).json({
  ok:true,result:result.data,source:'whose_only',kiotStockMutated:false
 });
}
module.exports=handler;
module.exports._test={validId,lines,validate};
