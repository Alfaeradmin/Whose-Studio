'use strict';
// Kiot operational API page checks: never fabricate missing records or totals.
// Read-only integrity gate before staging any order or stock read-model writes.
function assessPage(payload,{pageSize=1,resource='unknown'}={}){
 const validSize=Number.isSafeInteger(pageSize)&&pageSize>=1&&pageSize<=100;
 if(!validSize)return {ok:false,code:'INVALID_PAGE_REQUEST'};
 if(!payload||typeof payload!=='object'||Array.isArray(payload))return {ok:false,code:'INVALID_ENVELOPE'};
 const totalRaw=payload.total;
 const total=typeof totalRaw==='number'?totalRaw:
   typeof totalRaw==='string'&&/^[0-9]+$/.test(totalRaw)?Number(totalRaw):NaN;
 if(!Number.isSafeInteger(total)||total<0)return {ok:false,code:'INVALID_TOTAL'};
 if(total===0&&(payload.data==null||Array.isArray(payload.data)&&payload.data.length===0))
   return {ok:true,total:0,returned:0,empty:true};
 if(!Array.isArray(payload.data))return {ok:false,code:'MISSING_DATA'};
 if(payload.data.length===0&&total>0)return {ok:false,code:'EMPTY_NONZERO_PAGE'};
 if(payload.data.length>pageSize)return {ok:false,code:'PAGE_OVERFLOW'};
 const ids=payload.data.map(v=>v?.id??v?.Id);
 if(resource==='orders'||resource==='invoices'){
   if(ids.some(v=>!Number.isSafeInteger(Number(v))||Number(v)<1))return {ok:false,code:'INVALID_RECORD_ID'};
   if(new Set(ids.map(String)).size!==ids.length)return {ok:false,code:'DUPLICATED_PAGE_ID'};
 }
 return {ok:true,total,returned:payload.data.length,empty:false};
}
module.exports={assessPage};
