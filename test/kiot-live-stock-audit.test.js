'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {inspect,quantity}=require('../lib/kiot-live-stock-audit');
const {safeResourcePath}=require('../lib/kiotviet');
const provider={
 id:14423686,code:'SP009461',fullName:'BEAM PREMIUM SWEATPANTS - PEPPER GREY - M',
 inventories:[
  {branchId:1263919,branchName:'WHOSE STUDIO LVS',onHand:0,reserved:0},
  {branchId:1280205,branchName:'WHOSE STUDIO NVT',onHand:9,reserved:0}
 ]
};
const branches=[
 {id:'111',kiot_branch_id:1263919,name:'WHOSE STUDIO LVS'},
 {id:'222',kiot_branch_id:1280205,name:'WHOSE STUDIO NVT'}
];
const snapshots=[
 {branch_id:'111',on_hand:'0',reserved:'0',synced_at:'2026-10-12T10:11:56Z'},
 {branch_id:'222',on_hand:'9',reserved:'0',synced_at:'2026-10-12T10:11:56Z'}
];
test('KiotViet product lookup by SKU stays read-only and path constrained',()=>{
 assert.equal(safeResourcePath('products/code/SP009461'),'products/code/SP009461');
 assert.throws(()=>safeResourcePath('products/code/../orders'),/allowlist/);
 assert.throws(()=>safeResourcePath('products/code/ABC?includeDeleted=true'),/allowlist/);
 assert.throws(()=>safeResourcePath('products/code/'),/allowlist/);
});
test('two live branches can sum to nine without fabricating the 15 from screenshot',()=>{
 const result=inspect(provider,'SP009461',snapshots,branches);
 assert.equal(result.providerSum,9);
 assert.equal(result.providerReportedTotal,null);
 assert.equal(result.providerTotalGap,null);
 assert.deepEqual(result.rows.map(x=>x.liveOnHand),[0,9]);
 assert.deepEqual(result.rows.map(x=>x.deltaFromSnapshot),[0,0]);
 assert.equal(result.attribution,'not_determined_from_stock_balances');
});
test('explicit provider aggregate 15 detects gap of six but never assigns cause',()=>{
 const result=inspect({...provider,onHand:15},'SP009461',snapshots,branches);
 assert.equal(result.providerTotalGap,6);
 assert.equal(result.providerReportedTotal,15);
 assert.equal(result.attribution,'not_determined_from_stock_balances');
});
test('unknown provider branches are not silently dropped and missing local snapshots stay null',()=>{
 const result=inspect({...provider,inventories:[
  ...provider.inventories,{branchId:55,branchName:'Third provider branch',onHand:6,reserved:0}
 ]},'SP009461',snapshots,branches);
 assert.equal(result.providerSum,15);
 assert.equal(result.rows.length,3);
 assert.equal(result.rows[2].snapshotOnHand,null);
 assert.equal(result.rows[2].deltaFromSnapshot,null);
});
test('missing or duplicate branch data are rejected, never written as zero',()=>{
 assert.throws(()=>inspect({...provider,inventories:null},'SP009461',[],branches),/PROVIDER_INVENTORY_UNAVAILABLE/);
 assert.throws(()=>inspect({...provider,inventories:[{branchId:1}]},'SP009461'),/PROVIDER_ON_HAND_MISSING/);
 assert.throws(()=>inspect({...provider,inventories:[{branchId:1,onHand:2},{branchId:1,onHand:2}]},'SP009461'),/INVALID_PROVIDER_BRANCH/);
 assert.throws(()=>inspect({...provider,code:'OTHER'},'SP009461'),/PRODUCT_IDENTITY_MISMATCH/);
 assert.equal(quantity(null),null);
 assert.throws(()=>quantity('NaN'),/INVALID_STOCK_QUANTITY/);
});
