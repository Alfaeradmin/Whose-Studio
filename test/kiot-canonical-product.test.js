'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {canonicalProductForEvent}=require('../lib/kiot-canonical-product');
test('accepts only exact, validated Kiot product',()=>{
 assert.equal(canonicalProductForEvent({data:[{id:18,code:'SKU-18',name:'Item'}]},'18').sku,'SKU-18');
});
test('rejects wrong IDs, empty and ambiguous responses',()=>{
 assert.throws(()=>canonicalProductForEvent({data:[{id:19,code:'SKU-19',name:'Item'}]},'18'),/MISMATCH/);
 assert.throws(()=>canonicalProductForEvent({data:[]},'18'),/NON_UNIQUE/);
 assert.throws(()=>canonicalProductForEvent({data:[{id:18,code:'X',name:'X'},{id:18,code:'X',name:'X'}]},'18'),/NON_UNIQUE/);
});
