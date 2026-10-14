'use strict';
const {accessToken,isUuid,rest}=require('../lib/whose-backend');
const {validateStaffBearer,verifyOrigin}=require('../lib/whose-auth');
const limits=String;
const responseCode=(status)=>status===401?401:status===403?403:status===400?400:status===404?404:502;
const http=async(req,res)=>{
 res.setHeader('Cache-Control','private, no-store');
 if(!['GET','POST'].includes(req.method))return res.status(405).json({error:'Method not allowed'});
 const bearer=accessToken(req);
 const user=await validateStaffBearer(bearer);
 if(!user.ok)return res.status(user.status||401).json({error:'Staff login required'});
 const scoped=id=>(user.branches||[]).some(b=>b.id===id&&b.is_active===true)&&
  (user.is_global_admin||(user.memberships||[]).some(m=>m.branch_id===id));
 if(req.method==='GET'){
  const branch=String(req.query?.branch_id||''),chat=String(req.query?.chat_id||'');
  if(chat){
   if(!isUuid(chat))return res.status(400).json({error:'Invalid chat'});
   const q='whose_department_chats?select=id,branch_id,requester_id,assignee_id,purpose,priority,status,created_at,updated_at&id=eq.'+chat+'&limit=1';
   const thread=await rest(q,{bearer});
   if(!thread.ok)return res.status(responseCode(thread.status)).json({error:'Cannot read chat'});
   const item=Array.isArray(thread.data)?thread.data[0]:null;
   if(!item||!scoped(item.branch_id))return res.status(404).json({error:'Chat is not available'});
   const [lines,events]=await Promise.all([
    rest('whose_department_chat_lines?select=id,chat_id,sku,product_name,qty_requested,qty_picked,qty_handed,qty_received,qty_return_requested,qty_returned,product_id,product:product_id(attributes)&chat_id=eq.'+chat+'&order=created_at.asc&limit=100',{bearer}),
    rest('whose_department_chat_events?select=id,chat_id,actor_id,event_type,body,line_id,qty,created_at&chat_id=eq.'+chat+'&order=id.asc&limit=500',{bearer})
   ]);
   if(!lines.ok||!events.ok)return res.status(502).json({error:'Could not load chat history'});
   return res.status(200).json({thread:item,lines:lines.data||[],events:events.data||[]});
  }
  if(!isUuid(branch)||!scoped(branch))return res.status(403).json({error:'Warehouse access required'});
  const q='whose_department_chats?select=id,branch_id,requester_id,assignee_id,purpose,priority,status,created_at,updated_at&branch_id=eq.'+branch+'&order=updated_at.desc&limit=100';
  const result=await rest(q,{bearer});
  if(!result.ok)return res.status(responseCode(result.status)).json({error:'Could not load conversations'});
  return res.status(200).json({rows:result.data||[]});
 }
 if(!verifyOrigin(req))return res.status(403).json({error:'Invalid origin'});
 const body=typeof req.body==='string'?(()=>{try{return JSON.parse(req.body)}catch{return null}})():req.body;
 if(Number(req.headers['content-length']||0)>32768||JSON.stringify(body||{}).length>32768)return res.status(413).json({error:'Payload too large'});
 if(!body||typeof body!=='object'||Array.isArray(body))return res.status(400).json({error:'Invalid payload'});
 const requestKey=body.idempotency_key;
 if(requestKey!==undefined&&!isUuid(requestKey))return res.status(400).json({error:'Invalid idempotency token'});
 if(body.action==='create'){
  if(!isUuid(body.branch_id)||!scoped(body.branch_id))return res.status(403).json({error:'Warehouse access required'});
  if(!Array.isArray(body.lines)||body.lines.length<1||body.lines.length>40)return res.status(400).json({error:'Select 1–40 SKU'});
  const skus=new Set();
  const lines=[];
  for(const row of body.lines){
   const sku=String(row?.sku||'').trim(),qty=Number(row?.qty);
   if(!sku||sku.length>100||skus.has(sku)||!Number.isInteger(qty)||qty<1||qty>1000000)return res.status(400).json({error:'Invalid or duplicate product'});
   skus.add(sku);lines.push({sku,qty});
  }
  const purpose=String(body.purpose||'').trim(),priority=body.priority||'normal';
  if(purpose.length<3||purpose.length>1000||!['normal','urgent'].includes(priority))return res.status(400).json({error:'Purpose/priority invalid'});
  const result=await rest('rpc/whose_chat_create',{method:'POST',bearer,body:{p_branch:body.branch_id,p_lines:lines,p_purpose:purpose,p_priority:priority,p_idempotency:requestKey||null}});
  if(!result.ok)return res.status(responseCode(result.status)).json({error:result.status===403?'Role cannot create store requests':result.data?.message||'Could not create request'});
  return res.status(201).json({id:result.data});
 }
 if(body.action==='add'){
  if(!isUuid(body.chat_id))return res.status(400).json({error:'Invalid conversation'});
  if(!Array.isArray(body.lines)||body.lines.length<1||body.lines.length>40)return res.status(400).json({error:'Select up to 40 SKU'});
  const lines=[];for(const item of body.lines){
   const sku=String(item?.sku||'').trim(),qty=Number(item?.qty);
   if(!sku||sku.length>100||!Number.isInteger(qty)||qty<1||qty>1000000)return res.status(400).json({error:'Invalid SKU quantity'});
   lines.push({sku,qty});
  }
  const note=String(body.note||'').trim();
  if(note.length<3||note.length>1000)return res.status(400).json({error:'Add the reason for requesting more products'});
  const result=await rest('rpc/whose_chat_add_lines',{method:'POST',bearer,body:{p_chat:body.chat_id,p_lines:lines,p_note:note,p_idempotency:requestKey||null}});
  if(!result.ok)return res.status(responseCode(result.status)).json({error:result.data?.message||'Could not add SKU'});
  return res.status(200).json({result:result.data});
 }
 if(body.action==='act'){
  if(!isUuid(body.chat_id))return res.status(400).json({error:'Select conversation'});
  const action=String(body.kind||'');
  if(!['claim','pick','ready','handoff','receive','request_return','receive_return','note','cancel'].includes(action))return res.status(400).json({error:'Unsupported operation'});
  const qty=body.qty===undefined||body.qty===null?null:Number(body.qty);
  if(qty!==null&&(!Number.isInteger(qty)||qty<1||qty>1000000))return res.status(400).json({error:'Invalid quantity'});
  const line=body.line_id||null;if(line!==null&&!isUuid(line))return res.status(400).json({error:'Invalid line'});
  const note=body.note==null?null:String(body.note).trim();
  if(note!==null&&note.length>1000)return res.status(400).json({error:'Note too long'});
  const result=await rest('rpc/whose_chat_act',{method:'POST',bearer,body:{p_chat:body.chat_id,p_action:action,p_line:line,p_qty:qty,p_note:note,p_idempotency:requestKey||null}});
  if(!result.ok)return res.status(responseCode(result.status)).json({error:result.status===403?'Operation not allowed for your department':result.data?.message||'Could not update request'});
  return res.status(200).json({result:result.data});
 }
 return res.status(400).json({error:'Unknown operation'});
};
module.exports=http;
