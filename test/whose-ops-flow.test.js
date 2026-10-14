'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const M=require('../ops-preview-model');
const {validate}=require('../api/ops-flow')._test;
const SRC=n=>fs.readFileSync(path.join(__dirname,'..',n),'utf8');
const ids={branch:'43be6d1f-64d3-4738-9683-37ec6a7d14b5',
 user:'123e4567-e89b-42d3-a456-426614174000',key:'123e4567-e89b-42d3-a456-426614174001'};
function fresh(){
 const s=M.initial(),people=s.employees.filter(x=>x.branch==='LVS');
 return {s,seller:people.find(x=>x.duty==='seller'),picker:people.find(x=>x.duty==='picker'&&x.zone==='MAIN'),
  otherPicker:people.find(x=>x.duty==='picker'&&x.zone==='BACK'),
  runner:people.find(x=>x.duty==='runner'),receiver:people.find(x=>x.duty==='receiver'),
  lead:people.find(x=>x.duty==='lead')};
}
test('high-volume burst 150 orders is stable and isolated by branch',()=>{
 const {s,seller}=fresh();
 M.seed(s,'LVS',150);
 assert.equal(s.calls.filter(c=>c.branch==='LVS').length,172);
 assert.equal(s.calls.filter(c=>c.branch==='NVT').length,15);
 const visible=M.visible(s,'LVS',seller.id);
 assert.equal(visible.length,172);
 assert.ok(visible.every(c=>c.branch==='LVS'));
 assert.ok(visible[0].priority>=visible.at(-1).priority);
});
test('seller creates separate call with exact SKU and role check',()=>{
 const {s,seller,picker}=fresh();
 const c=M.createCall(s,seller.id,'LVS','MAIN',[{sku:'DEMO-TEE-01',qty:3}], 'Khách chờ');
 assert.equal(c.status,'queued');
 assert.deepEqual(c.lines.map(l=>[l.sku,l.requested]),[['DEMO-TEE-01',3]]);
 assert.throws(()=>M.createCall(s,picker.id,'LVS','MAIN',[{sku:'DEMO-TEE-01',qty:1}]),/SELLER_SHIFT_REQUIRED/);
});
test('picker can claim a wave only same zone max eight and cannot double claim',()=>{
 const {s,picker,otherPicker}=fresh();
 const jobs=s.calls.filter(c=>c.branch==='LVS'&&c.zone==='MAIN');
 const ids=jobs.slice(0,8).map(x=>x.id);
 const wave=M.claimWave(s,picker.id,ids);
 assert.ok(wave.startsWith('DEMO-WAVE'));
 assert.ok(jobs.slice(0,8).every(x=>x.picker===picker.id&&x.wave===wave));
 assert.throws(()=>M.claimWave(s,picker.id,ids),/WAVE_CONFLICT_OR_ZONE/);
 assert.throws(()=>M.claimWave(s,otherPicker.id,[jobs[8].id]),/WAVE_CONFLICT_OR_ZONE/);
 assert.throws(()=>M.claimWave(s,picker.id,jobs.slice(0,9).map(x=>x.id)),/INVALID_WAVE/);
});
test('wave picking never mixes baskets, rejects wrong SKU and overpick',()=>{
 const {s,picker}=fresh();
 const jobs=s.calls.filter(c=>c.branch==='LVS'&&c.zone==='MAIN');
 const [a,b]=jobs.slice(0,2);
 M.claimWave(s,picker.id,[a.id,b.id]);
 const sku=a.lines[0].sku,original=b.lines[0].picked;
 for(let i=0;i<a.lines[0].requested;i++)M.scan(s,picker.id,a.id,sku);
 assert.equal(a.lines[0].picked,a.lines[0].requested);
 assert.equal(b.lines[0].picked,original);
 assert.throws(()=>M.scan(s,picker.id,a.id,sku),/OVERPICK/);
 assert.throws(()=>M.scan(s,picker.id,a.id,'WRONG-SKU'),/WRONG_SKU/);
 assert.throws(()=>M.scan(s,'LVS-EMP-3',a.id,sku),/NOT_PICKER_OWNER/);
});
test('shortage requires reason, ready requires each line accounted for and nonzero pick',()=>{
 const {s,picker}=fresh();
 const c=s.calls.find(c=>c.branch==='LVS'&&c.zone==='MAIN');
 M.claimWave(s,picker.id,[c.id]);
 assert.throws(()=>M.ready(s,picker.id,c.id),/MUST_PICK_OR_SHORT/);
 assert.throws(()=>M.short(s,picker.id,c.id,c.lines[0].sku,'x'),/SHORTAGE_REASON_REQUIRED/);
 M.short(s,picker.id,c.id,c.lines[0].sku,'Thiếu trên giá');
 assert.throws(()=>M.ready(s,picker.id,c.id),/NOTHING_TO_HANDOFF/);
 M.scan(s,picker.id,c.id,c.lines[0].sku);
 assert.equal(M.ready(s,picker.id,c.id).status,'ready');
});
test('runner and receiver have separate custody gates and required discrepancy notes',()=>{
 const {s,picker,runner,receiver,seller}=fresh();
 const c=M.createCall(s,seller.id,'LVS','MAIN',[{sku:'DEMO-TEE-01',qty:2}], 'Order');
 M.claimWave(s,picker.id,[c.id]);
 M.scan(s,picker.id,c.id,'DEMO-TEE-01');M.scan(s,picker.id,c.id,'DEMO-TEE-01');
 M.ready(s,picker.id,c.id);
 assert.throws(()=>M.take(s,receiver.id,c.id),/RUNNER_NOT_ALLOWED/);
 M.take(s,runner.id,c.id);
 assert.throws(()=>M.deliver(s,seller.id,c.id),/NOT_RUNNER_OWNER/);
 M.deliver(s,runner.id,c.id);
 assert.throws(()=>M.receive(s,runner.id,c.id,{'DEMO-TEE-01':2}),/RECEIVER_NOT_ALLOWED/);
 assert.throws(()=>M.receive(s,receiver.id,c.id,{'DEMO-TEE-01':1},'x'),/RECEIPT_REASON_REQUIRED/);
 M.receive(s,receiver.id,c.id,{'DEMO-TEE-01':1},'Kiện thiếu một sản phẩm');
 assert.equal(c.status,'disputed');
 assert.equal(c.lines[0].received,1);
 assert.ok(c.events.some(x=>x.action.includes('Nhận lệch')));
});
test('lead assignment is scoped to branch and zone filters',()=>{
 const {s,lead,picker}=fresh();
 assert.throws(()=>M.assign(s,picker.id,lead.id,'seller','ALL'),/SHIFT_MANAGER_REQUIRED/);
 assert.throws(()=>M.assign(s,lead.id,'NVT-EMP-2','runner','ALL'),/SHIFT_MANAGER_REQUIRED/);
 M.assign(s,lead.id,picker.id,'runner','ALL');
 assert.equal(M.who(s,picker.id).duty,'runner');
});
test('ops API strictly validates calls, idempotency and shift setup inputs',()=>{
 const b={type:'submit',branch:ids.branch,zone:'MAIN',key:ids.key,
  lines:[{sku:'DEMO-TEE-01',qty:2}],note:'Gọi hàng'};
 assert.equal(validate(b)[0],'whose_ops_submit');
 assert.equal(validate({...b,branch:'invalid'}),null);
 assert.equal(validate({...b,lines:[{sku:'A',qty:2},{sku:'A',qty:1}]}),null);
 assert.equal(validate({...b,lines:[{sku:'A',qty:-1}]}),null);
 assert.equal(validate({...b,type:'claim',calls:[ids.user,ids.user]}),null);
 assert.equal(validate({type:'action',id:ids.branch,action:'scan',version:2,key:ids.key,sku:'A',qty:1})[0],'whose_ops_action');
 assert.equal(validate({type:'action',id:ids.branch,action:'scan',version:2,key:ids.key,
  sku:'A',qty:1,lines:[{sku:'A',qty:1}]}),null);
 assert.equal(validate({type:'action',id:ids.branch,action:'unknown',version:2,key:ids.key}),null);
});
test('preview is clearly sample data and never pretends to mutate Kiot',()=>{
 const html=SRC('ops-preview.html'),ui=SRC('ops-preview.js'),api=SRC('api/ops-flow.js');
 assert.match(html,/PREVIEW \/ DEMO/);
 assert.match(html,/Không thay đổi tồn kho/);
 assert.match(html,/ops-preview\.js/);
 assert.match(html,/ops-preview-model\.js/);
 assert.doesNotMatch(ui,/authorizedFetch|fetch\(|public\.kiotapi\.com/);
 assert.match(api,/verifyOrigin/);
 assert.match(api,/validateStaffBearer/);
 assert.match(api,/kiotStockMutated:false/);
});
test('migration enforces concurrency, shift scopes and audit, no Kiot mutations',()=>{
 const sql=SRC('supabase/migrations/20261014094500_whose_store_warehouse_ops.sql');
 for(const key of ['whose_ops_shifts','whose_ops_claim_wave','FOR UPDATE NOWAIT','whose_ops_action',
  'p_expected_version','whose_ops_events','CANNOT_CANCEL_CLAIMED_CALL','RECEIPT_DISCREPANCY_REASON_REQUIRED'])
  assert.ok(sql.includes(key),key);
 assert.match(sql,/REVOKE ALL ON public\.whose_ops_/);
 assert.match(sql,/ENABLE ROW LEVEL SECURITY/);
 assert.doesNotMatch(sql,/public\.kiotapi\.com|update\s+public\.whose_inventory_snapshots/gi);
});
