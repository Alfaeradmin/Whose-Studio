'use strict';
// Pure inbound event validation and normalization; no database/network side effects.
// Provider authenticity must be verified separately BEFORE calling this function.
const crypto=require('node:crypto');
const DOMAINS=new Set(['products','branches','orders','invoices','transfers','returns','purchaseorders','ordersuppliers','stock']);
function validatedId(value,max=160){
  return typeof value==='string'&&value.length<=max&&/^[A-Za-z0-9:_./-]+$/.test(value)?value:null;
}
function normalizeInboundEvent(input){
  if(!input || typeof input!=='object' || Array.isArray(input))throw new TypeError('INVALID_EVENT');
  const retailer=validatedId(input.retailer,120);
  const domain=validatedId(input.domain,80);
  const entityKey=validatedId(input.entityKey);
  const providerEventId=validatedId(input.providerEventId);
  if(!retailer||!DOMAINS.has(domain)||!entityKey||!providerEventId)
    throw new TypeError('INVALID_EVENT_IDENTITY');
  if(input.authenticated!==true)throw new TypeError('UNVERIFIED_PROVIDER');
  // Domain and entity are included in the key to avoid cross-entity collisions.
  const identity=[retailer,domain,entityKey,providerEventId].map(x=>x.length+':'+x).join('|');
  const eventKey=crypto.createHash('sha256').update(identity).digest('hex');
  const payloadDigest=crypto.createHash('sha256').update(
    JSON.stringify([retailer,domain,entityKey,providerEventId,input.version??null])
  ).digest('hex');
  return Object.freeze({retailer,domain,entity_key:entityKey,event_key:eventKey,payload_digest:payloadDigest});
}
module.exports={normalizeInboundEvent};
