'use strict';
// Source-of-truth diagnostics: observations do not prove the KiotViet feed is live.
function ageMinutes(date,now){
 if(!date)return null;
 const timestamp=Date.parse(String(date));
 if(!Number.isFinite(timestamp))return null;
 return Math.max(0,Math.floor((now-timestamp)/60000));
}
function count(value){const n=Number(value);return Number.isSafeInteger(n)&&n>=0?n:0;}
function summarize({connector,audit,catalog,now=Date.now()}){
 if(!connector||!audit||!catalog||!Number.isFinite(now))throw Error('Missing verified Whose diagnostic responses');
 const last={products:catalog.lastSyncedAt||null,inventory:audit.lastSnapshot||null,
  movement:audit.lastStockEvent||null,document:audit.lastDocument||null};
 const ages={products:ageMinutes(last.products,now),inventory:ageMinutes(last.inventory,now),
  movement:ageMinutes(last.movement,now),document:ageMinutes(last.document,now)};
 const counts={products:count(catalog.total),inventorySnapshots:count(audit.snapshotRows),
  stockEvents:count(audit.stockEvents),documents:count(audit.documents),
  inboxPending:count(connector.inbox?.received)+count(connector.inbox?.retry)+count(connector.inbox?.processing),
  inboxQuarantined:count(connector.inbox?.quarantined),openConflicts:count(connector.openConflicts)};
 return {
  source:'persisted-whose-records',observedAt:new Date(now).toISOString(),counts,last,agesMinutes:ages,
  signals:{
   catalog:ages.products===null?'not-observed':ages.products>2880?'old-observation':'has-observation',
   inventory:ages.inventory===null?'not-observed':ages.inventory>120?'old-observation':'has-observation',
   movements:counts.stockEvents===0?'no-events-recorded':'partial-history-only',
   documents:counts.documents===0?'no-documents-recorded':'partial-history-only',
   queue:counts.inboxQuarantined>0?'needs-investigation':counts.inboxPending>0?'pending':'no-pending-records'
  },
  realtimeVerified:false,
  caveat:'A stored timestamp is not an end-to-end heartbeat. Zero events does not prove zero KiotViet transactions. This read-only diagnostic cannot certify a full backfill or real-time synchronization.'
 };
}
module.exports={ageMinutes,summarize};
