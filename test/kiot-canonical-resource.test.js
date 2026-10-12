'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {safeResourcePath}=require('../lib/kiotviet');
test('permits canonical product read path and known resources',()=>{
 assert.equal(safeResourcePath('products/123'),'products/123');
 assert.equal(safeResourcePath('products'),'products');
 assert.equal(safeResourcePath('webhooks'),'webhooks');
 for(const p of ['invoices/01','orders/2','purchaseorders/3','transfers/4','returns/5'])
  assert.equal(safeResourcePath(p),p);
});
test('rejects path traversal, noncanonical ids, and arbitrary endpoints',()=>{
 for(const path of ['products/0','products/01','products/1/../../orders','products/code/X','invoices/1','webhooks/1','products/1?x=1'])
  assert.throws(()=>safeResourcePath(path),/allowlist/);
});
