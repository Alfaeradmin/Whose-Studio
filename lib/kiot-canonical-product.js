'use strict';
// Strict canonical single-product selection for inbox refresh.
// Rejects partial, unrelated, ambiguous or unexpected provider responses.
const {normalizeProduct}=require('./whose-product-catalog');
function canonicalProductForEvent(payload,eventId){
 const id=Number(eventId);
 if(!Number.isSafeInteger(id)||id<1)throw new Error('INVALID_EVENT_PRODUCT_ID');
 const rows=Array.isArray(payload?.data)?payload.data:
   payload && typeof payload==='object' && !Array.isArray(payload) && payload.id!=null?[payload]:null;
 if(!rows||rows.length!==1)throw new Error('NON_UNIQUE_PRODUCT_RESULT');
 const normalized=normalizeProduct(rows[0]);
 if(normalized.id!==id)throw new Error('PRODUCT_ID_MISMATCH');
 return normalized;
}
module.exports={canonicalProductForEvent};
