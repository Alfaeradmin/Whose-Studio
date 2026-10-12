'use strict';
// Convert verified KiotViet Retail notifications into stable refresh hints.
// No stock quantities or local business state are inferred from webhook payloads.
// Caller must verify signature and persist each hint atomically before acknowledging.
const {normalizeInboundEvent}=require('./kiot-inbound-event');
const ACTION_DOMAIN={product:'products',order:'orders',invoice:'invoices',
 transfer:'transfers',return:'returns',branch:'branches',purchaseorder:'purchaseorders'};
function notificationHints(payload,retailer){
 if(!payload||typeof payload!=='object'||Array.isArray(payload))throw new TypeError('INVALID_PAYLOAD');
 if(!Array.isArray(payload.Notifications)||payload.Notifications.length>50)
   throw new TypeError('INVALID_NOTIFICATIONS');
 const envelope=String(payload.Id??'');
 if(!/^[A-Za-z0-9:_./-]{1,160}$/.test(envelope))throw new TypeError('INVALID_ENVELOPE_ID');
 const hints=[];
 for(const [index,n] of payload.Notifications.entries()){
   const action=n?.Action;
   if(typeof action!=='string')throw new TypeError('INVALID_NOTIFICATION_ACTION');
   const domain=ACTION_DOMAIN[action.split('.')[0].toLowerCase()];
   if(!domain)continue; // unknown types are ignored, not treated as validated entities
   const rows=Array.isArray(n.Data)?n.Data:
     Array.isArray(n.RemoveId)?n.RemoveId.map(id=>({id})):[];
   if(rows.length>200)throw new TypeError('TOO_MANY_ENTITIES');
   for(const row of rows){
     const id=typeof row==='object'&&row!==null?(row.id??row.Id):row;
     if(!/^[0-9]{1,18}$/.test(String(id??'')))continue;
     hints.push(normalizeInboundEvent({
       authenticated:true,retailer,domain,entityKey:String(id),
       providerEventId:envelope+':'+index+':'+id,version:null
     }));
   }
 }
 if(hints.length>500)throw new TypeError('TOO_MANY_HINTS');
 return hints;
}
module.exports={notificationHints};
