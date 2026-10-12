'use strict';
// Outbox eligibility gate: pure function, no networking and NO Kiot write API.
const DOMAINS=new Set(['products','branches','orders','invoices','transfers','returns','inventory']);
function evaluateOutbound(row,{dryRun=true}={}){
 if(!row||typeof row!=='object')return {allowed:false,code:'INVALID_ROW'};
 if(!DOMAINS.has(row.domain))return {allowed:false,code:'DOMAIN_UNSUPPORTED'};
 if(row.state!=='approved')return {allowed:false,code:'APPROVAL_REQUIRED'};
 if(!row.approved_by||!row.approved_at)return {allowed:false,code:'APPROVAL_INCOMPLETE'};
 if(!row.idempotency_key||typeof row.idempotency_key!=='string')return {allowed:false,code:'IDEMPOTENCY_REQUIRED'};
 if(!row.expected_source_version)return {allowed:false,code:'SOURCE_VERSION_REQUIRED'};
 if(dryRun)return {allowed:false,code:'DRY_RUN_ONLY'};
 // No production transport is implemented or authorized, including for approved rows.
 return {allowed:false,code:'KIOT_WRITE_TRANSPORT_DISABLED'};
}
function evaluateBatch(rows){
 if(!Array.isArray(rows)||rows.length>100)throw new Error('INVALID_BATCH');
 return rows.map(row=>({id:row?.id??null,...evaluateOutbound(row)}));
}
module.exports={evaluateOutbound,evaluateBatch};
