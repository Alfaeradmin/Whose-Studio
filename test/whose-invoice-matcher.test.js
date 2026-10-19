const test=require('node:test'),assert=require('node:assert/strict');
const {assess,normalizeInvoice}=require('../lib/whose-invoice-matcher');
const base={id:109,code:'HD0109',branchId:1263919,status:1,statusValue:'Hoàn thành',invoiceDetails:[
 {id:11,productId:501,productCode:'TSH-RED-M',quantity:1}]};
const line=(over={})=>({id:'line-1',chat_id:'request-1',branch_id:'lvs',chat_status:'received',sku:'TSH-RED-M',kiot_product_id:501,qty_received:2,qty_returned:0,...over});
test('unambiguous line can be suggested without claiming a committed sale',()=>{
 const p=assess(base,[line()],1263919);
 assert.equal(p.kind,'candidates');assert.equal(p.lines[0].chatId,'request-1');
 assert.equal(p.lines[0].kind,'candidate');assert.equal(p.applied,false);
});
test('bill cannot cross Kiot branch even if SKU agrees',()=>{
 const p=assess(base,[line()],1280205);assert.equal(p.kind,'blocked');assert.equal(p.reason,'wrong_branch');
});
test('duplicate requests for same SKU never auto-select one',()=>{
 const p=assess(base,[line(),line({id:'line-2',chat_id:'request-2'})],1263919);
 assert.equal(p.kind,'review');assert.equal(p.lines[0].reason,'multiple_request_sources');
});
test('only physically received quantity may cover invoice and cannot exceed it',()=>{
 assert.equal(assess(base,[line({chat_status:'handed_over'})],1263919).lines[0].kind,'unmatched');
 assert.equal(assess(base,[line({qty_received:1,qty_returned:1})],1263919).lines[0].kind,'unmatched');
 assert.equal(assess(base,[line({qty_received:0})],1263919).lines[0].kind,'unmatched');
 const a={...base,invoiceDetails:[{id:11,productId:501,productCode:'TSH-RED-M',quantity:3}]};
 assert.equal(assess(a,[line()],1263919).lines[0].reason,'insufficient_received_custody');
});
test('duplicate invoice detail rows are evaluated as one SKU total for capacity',()=>{
 const a={...base,invoiceDetails:[{id:11,productId:501,productCode:'TSH-RED-M',quantity:1},{id:12,productId:501,productCode:'TSH-RED-M',quantity:2}]};
 assert.equal(assess(a,[line()],1263919).kind,'review');
});
test('does not assert sale on incomplete, canceled, unidentified, fractional or mismatched variant bills',()=>{
 for(const change of [{status:2},{status:3},{statusValue:'Đã hủy'},{invoiceDetails:[]},
 {invoiceDetails:[{id:11,productId:501,productCode:'TSH-RED-M',quantity:1.5}]},
 {invoiceDetails:[{id:11,productId:501,productCode:'TSH-RED-M',quantity:0}]}])
  assert.equal(assess({...base,...change},[line()],1263919).kind,'blocked');
 assert.equal(assess(base,[line({kiot_product_id:null})],1263919).lines[0].reason,'product_identity_unverified');
 assert.equal(assess(base,[line({kiot_product_id:502})],1263919).lines[0].kind,'unmatched');
});
test('bill-before-request is permitted if current custody is uniquely verified',()=>{
 const b={...base,purchaseDate:'2026-10-17T09:00:00'};
 const p=assess(b,[line()],1263919);
 assert.equal(p.kind,'candidates');
});
test('unknown partial status cannot silently become completed',()=>{
 assert.equal(normalizeInvoice({...base,status:null}).valid,false);
 assert.equal(normalizeInvoice({...base,id:null}).valid,false);
});

test('a detail without stable Kiot detail ID cannot be treated as a unique auto-match',()=>{
 const candidate={...base,invoiceDetails:[{productId:501,productCode:'TSH-RED-M',quantity:1}]};
 assert.equal(assess(candidate,[line()],1263919).lines[0].reason,'invoice_detail_identity_missing');
});
test('combo sales require component-level verification',()=>{
 const combo={...base,invoiceDetails:[{id:11,productId:501,productCode:'TSH-RED-M',quantity:1,
  comboItems:[{productId:999,quantity:1}]}]};
 assert.equal(assess(combo,[line()],1263919).lines[0].reason,'combo_requires_review');
});
