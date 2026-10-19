const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {summarize,ageMinutes}=require('../lib/whose-sync-health');
const source=relative=>fs.readFileSync(path.join(__dirname,'..',relative),'utf8');

test('diagnostics never imply real-time when database has no movement history',()=>{
 const now=Date.parse('2026-10-19T03:00:00Z');
 const result=summarize({now,
  connector:{inbox:{received:1,retry:2,processing:0,quarantined:1},openConflicts:3},
  audit:{snapshotRows:3934,lastSnapshot:'2026-10-12T10:17:34Z',stockEvents:0,documents:0,lastStockEvent:null,lastDocument:null},
  catalog:{total:1987,lastSyncedAt:'2026-10-14T08:39:24Z'}});
 assert.equal(result.realtimeVerified,false);
 assert.equal(result.signals.movements,'no-events-recorded');
 assert.equal(result.signals.documents,'no-documents-recorded');
 assert.equal(result.signals.inventory,'old-observation');
 assert.equal(result.counts.inboxPending,3);
 assert.equal(result.counts.inboxQuarantined,1);
 assert.equal(result.counts.openConflicts,3);
 assert.equal(ageMinutes(null,now),null);
});
test('diagnostics never fabricate timestamps or counters from missing values',()=>{
 const result=summarize({now:100000,connector:{},audit:{},catalog:{}});
 assert.equal(result.last.inventory,null);
 assert.equal(result.agesMinutes.inventory,null);
 assert.equal(result.counts.stockEvents,0);
 assert.equal(result.signals.inventory,'not-observed');
 assert.equal(result.realtimeVerified,false);
});
test('read-only diagnostic requires global admin, uses existing scoped RPCs',()=>{
 const api=source('api/kiot-sync-health.js');
 assert.match(api,/validateStaffBearer\(bearer\)/);
 assert.match(api,/staff\.is_global_admin!==true/);
 assert.match(api,/rpc\/whose_connector_health/);
 assert.match(api,/rpc\/whose_kiot_audit_health/);
 assert.match(api,/rpc\/whose_kiot_product_catalog_stats/);
 assert.doesNotMatch(api,/\b(?:INSERT|DELETE|UPDATE)\b\s+(?:INTO\s+)?(?:whose_|public\.)/i);
});
test('chat operation retry retains idempotency and history limits are explicit',()=>{
 const chat=source('calling-chat-box.js'),api=source('api/whose-chat.js');
 assert.match(chat,/pendingAction=\{signature,key:crypto\.randomUUID\(\)\}/);
 assert.match(chat,/idempotency_key:token/);
 assert.match(chat,/if\(committed\)\{status\('Thao tác đã ghi nhận/);
 assert.match(api,/order=id\.desc&limit=501/);
 assert.match(api,/historyTruncated:/);
 assert.match(chat,/if\(d\.historyTruncated\)/);
});
