'use strict';
// Central mutation gate. This does NOT send KiotViet requests and is not a write API.
// Dispatchers must fail closed; configuration alone must never authorize a remote write.
const ALLOWED_METHODS = new Set(['POST','PUT','PATCH','DELETE']);
const MUTABLE_DOMAINS = new Set(['products','orders','invoices','transfers','returns','customers']);
function authorizeOutboundIntent(intent, policy) {
  if (!intent || typeof intent !== 'object' || Array.isArray(intent)) return {ok:false,reason:'INVALID_INTENT'};
  if (!policy || policy.masterWriteEnabled !== true) return {ok:false,reason:'GLOBAL_WRITE_DISABLED'};
  if (!ALLOWED_METHODS.has(intent.method)) return {ok:false,reason:'METHOD_NOT_ALLOWED'};
  if (!MUTABLE_DOMAINS.has(intent.domain)) return {ok:false,reason:'DOMAIN_NOT_ALLOWED'};
  if (!policy.enabledDomains || policy.enabledDomains[intent.domain] !== true)
    return {ok:false,reason:'DOMAIN_WRITE_DISABLED'};
  if (!Number.isSafeInteger(intent.branchId) || intent.branchId <= 0 ||
      !Array.isArray(policy.enabledBranchIds) || !policy.enabledBranchIds.includes(intent.branchId))
    return {ok:false,reason:'BRANCH_NOT_APPROVED'};
  if (typeof intent.operationId !== 'string' || !/^[a-zA-Z0-9:_-]{12,128}$/.test(intent.operationId))
    return {ok:false,reason:'MISSING_IDEMPOTENCY_KEY'};
  if (typeof intent.approvedBy !== 'string' || !intent.approvedBy.trim() ||
      intent.approved !== true) return {ok:false,reason:'APPROVAL_REQUIRED'};
  if (intent.persistedOutbox !== true || intent.conflictChecked !== true ||
      intent.readbackRequired !== true) return {ok:false,reason:'SAFETY_PREREQUISITES_MISSING'};
  if (intent.domain === 'products' && intent.stockFieldsIncluded === true)
    return {ok:false,reason:'STOCK_WRITE_NEEDS_SEPARATE_CAPABILITY'};
  return {ok:true,reason:'POLICY_GATE_PASSED'};
}
module.exports={authorizeOutboundIntent};
