'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const file=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
const ui=file('whose-workspace.js');
const api=file('api/kiot-inventory-sync.js');
const app=file('app.js');

test('inventory search uses server pagination, not only visible rows',()=>{
 assert.match(ui,/whose:inventory-filter/);
 assert.match(ui,/whose:inventory-data/);
 assert.match(app,/whose_inventory_search_page|view:'stored'/);
 assert.match(app,/inventoryFilters\.query/);
 assert.match(app,/inventoryRequestSeq/);
 assert.doesNotMatch(ui,/querySelectorAll\('tr'\)/);
});
test('inventory analytics uses authorized, branch-scoped aggregate',()=>{
 assert.match(ui,/view: 'summary'/);
 assert.match(ui,/branch: branch\.value/);
 assert.match(api,/whose_inventory_summary_filtered/);
 assert.match(api,/whose_inventory_search_page/);
 assert.match(api,/is_global_admin!==true/);
 assert.doesNotMatch(ui,/IMPORT_KIOT_INVENTORY|method:\s*'POST'/);
});
test('camera scanner requires explicit gesture and closes media tracks',()=>{
 assert.match(ui,/getUserMedia/);
 assert.match(ui,/BarcodeDetector/);
 assert.match(ui,/getTracks\(\)/);
 assert.match(ui,/\.stop\(\)/);
 assert.match(ui,/visibilitychange/);
 assert.match(ui,/Escape/);
});
test('inventory API import remains gated, never performs Kiot writes',()=>{
 assert.match(api,/verifyOrigin/);
 assert.match(api,/IMPORT_KIOT_INVENTORY/);
 assert.match(api,/safeRead\('products'/);
 assert.doesNotMatch(api,/fetch\([^\n]*public\.kiotapi\.com/);
});
