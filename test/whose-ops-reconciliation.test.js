'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const B=require('../ops-bill-match');
const M=require('../ops-preview-model');
const {productImage,queryPath,normalize}=require('../api/ops-product-search')._test;
const {normalizeInvoice}=require('../api/ops-bill-probe')._test;
const file=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
function borrowed(id,sku,qty,branch='LVS',zone='MAIN'){
 return {id,branch,zone,created:Date.now()-120000,status:'completed',
  lines:[{sku,requested:qty,picked:qty,received:qty,returned:0}]};
}
function bill(id,sku,qty,branch='LVS',zone='MAIN'){
 return {id,code:'HD-'+id,branch,warehouse:zone,at:new Date().toISOString(),
  status:'finalized',verified:true,lines:[{sku,qty}]};
}
test('a single eligible loan is only a candidate, never an automatic confirmed bill',()=>{
 const c=borrowed('R1','SP009461',2),inv=bill('700','SP009461',1);
 const result=B.candidates([c],[inv],[]);
 assert.equal(result.candidates.length,1);
 assert.equal(result.candidates[0].callId,'R1');
 assert.equal(result.candidates[0].confirmed,false);
 assert.equal(B.stats(c,'SP009461',[]).stillBorrowed,2);
});
test('same SKU borrowed in two requests remains ambiguous; no fabricated match',()=>{
 const result=B.candidates([
  borrowed('R1','SP009461',1),borrowed('R2','SP009461',1)],
  [bill('700','SP009461',1)],[]);
 assert.equal(result.candidates.length,0);
 assert.equal(result.ambiguous.length,1);
 assert.deepEqual(result.ambiguous[0].candidateCallIds,['R1','R2']);
});
test('different Kiot branch or internal stock pool cannot match',()=>{
 const r=borrowed('R1','SP009461',1,'LVS','BACK');
 assert.equal(B.candidates([r],[bill('700','SP009461',1,'NVT','MAIN')]).candidates.length,0);
 assert.equal(B.candidates([r],[bill('700','SP009461',1,'LVS','MAIN')]).candidates.length,0);
});
test('source docs not fully verified or finalized do not prove a sale',()=>{
 const r=borrowed('R1','SP009461',1);
 const d=bill('700','SP009461',1);
 assert.equal(B.candidates([r],[{...d,verified:false}]).candidates.length,0);
 assert.equal(B.candidates([r],[{...d,status:'unknown'}]).candidates.length,0);
 assert.equal(B.candidates([r],[{...d,status:'voided'}]).candidates.length,0);
});
test('confirmed allocations tie request -> bill and bill -> request, with quantity return outstanding',()=>{
 const r=borrowed('R1','SP009461',3);
 const links=[{invoiceId:'700',callId:'R1',sku:'SP009461',qty:1,confirmed:true}];
 const invoices=[bill('700','SP009461',1)];
 assert.equal(B.stats(r,'SP009461',links).stillBorrowed,2);
 assert.deepEqual(B.linkedBills('R1',links,invoices).map(x=>x.code),['HD-700']);
 assert.deepEqual(B.billToCalls('700',links).map(x=>x.callId),['R1']);
 r.lines[0].returned=2;
 assert.equal(B.stats(r,'SP009461',links).stillBorrowed,0);
 assert.equal(B.stats(r,'SP009461',links).needsReturn,false);
 assert.throws(()=>B.stats({...r,lines:[{...r.lines[0],returned:3}]},'SP009461',links),
  /MATCH_ALLOCATION_EXCEEDS_ISSUED/);
});
test('return demo requires warehouse role, reason and cannot return sold quantity',()=>{
 const state=M.initial(),c=state.calls[0];
 const picker=state.employees.find(x=>x.branch===c.branch&&x.duty==='picker'&&x.zone===c.zone);
 const seller=state.employees.find(x=>x.branch===c.branch&&x.duty==='seller');
 const sku=c.lines[0].sku;
 assert.throws(()=>M.confirmReturn(state,seller.id,c.id,sku,1,'Chưa bán'),/WAREHOUSE_RETURN_REQUIRED/);
 assert.throws(()=>M.confirmReturn(state,picker.id,c.id,sku,1,'x'),/INVALID_RETURN/);
 const remaining=c.lines[0].received-(state.links||[]).filter(x=>x.callId===c.id&&x.sku===sku)
  .reduce((a,x)=>a+x.qty,0);
 if(remaining>0){
  M.confirmReturn(state,picker.id,c.id,sku,remaining,'Khách không mua');
  assert.equal(c.lines[0].returned,remaining);
  assert.throws(()=>M.confirmReturn(state,picker.id,c.id,sku,1,'Khách không mua'),/RETURN_EXCEEDS_UNSOLD/);
 }
});
test('branch layout is two Kiot branches but three operational stock pools',()=>{
 const js=file('ops-preview.js');
 assert.match(js,/\['MAIN','Kho bán hàng'\]/);
 assert.match(js,/\['BACK','Kho tồn'\]/);
 assert.match(js,/\['MAIN','Kho Nguyễn Văn Tráng'\]/);
 const s=M.initial();
 assert.ok(s.calls.filter(x=>x.branch==='NVT').every(x=>x.zone==='MAIN'));
});
test('Kiot product image URL only accepts known secure KiotViet CDN hosts',()=>{
 assert.equal(productImage({kiotviet:{thumbnail:'https://cdn2-retail-images.kiotviet.vn/x.png'}}),
  'https://cdn2-retail-images.kiotviet.vn/x.png');
 assert.equal(productImage({kiotviet:{images:['https://cdn2-retail-images.kiotviet.vn/image.png']}}),
  'https://cdn2-retail-images.kiotviet.vn/image.png');
 assert.equal(productImage({kiotviet:{thumbnail:'javascript:alert(1)'}}),null);
 assert.equal(productImage({kiotviet:{thumbnail:'https://evil.example/x.jpg'}}),null);
 assert.equal(normalize({id:'1',sku:'SP009461',name:'Áo thử',attributes:{}}).image,null);
});
test('catalog accepts Vietnamese name and SKU, rejects PostgREST syntax injection',()=>{
 assert.ok(queryPath('SP009461').includes('whose_products?'));
 assert.ok(queryPath('áo thun').includes('whose_products?'));
 assert.equal(queryPath('SP009461),id.eq.1'),null);
 assert.equal(queryPath('*'),null);
});
test('Kiot invoice detail returned to the app contains no customer PII',()=>{
 const inv=normalizeInvoice({id:700,code:'HD700',branchId:1263919,
  customerName:'private buyer',contactNumber:'private number',status:1,
  purchaseDate:new Date().toISOString(),invoiceDetails:[
   {productCode:'SP009461',quantity:2},{productCode:'OTHER',quantity:1}
  ]},'SP009461','1263919');
 assert.equal(inv.qty,2);
 assert.equal(inv.finalSaleVerified,false);
 assert.equal(inv.matchedCallId,null);
 assert.ok(!JSON.stringify(inv).includes('private'));
 assert.throws(()=>normalizeInvoice({id:700,branchId:1280205,invoiceDetails:[]},
  'SP009461','1263919'),/UNVERIFIED_INVOICE_DETAIL/);
});
test('migration records explicit source invoice line allocations and audit, no Kiot mutation',()=>{
 const sql=file('supabase/migrations/20261014130000_whose_ops_bill_matching.sql');
 for(const x of ['LVS_SALES','LVS_STOCK','NVT_MAIN','kiot_mapping_verified',
  'whose_ops_sales_matches','whose_ops_return_receipts','whose_ops_confirm_bill_line',
  'whose_ops_bill_history','whose_ops_record_return'])assert.ok(sql.includes(x),x);
 assert.match(sql,/FOR UPDATE/);
 assert.match(sql,/REVOKE ALL/);
 assert.doesNotMatch(sql,/UPDATE\s+public\.whose_inventory_snapshots/i);
});
