'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const src=fs.readFileSync(require('node:path').join(__dirname,'../whose-workspace.js'),'utf8');
test('workspace search remains display-only and page-scoped',()=>{
 assert.match(src,/whoseInventorySearch/);
 assert.match(src,/whoseInventoryBranch/);
 assert.match(src,/inventoryRows/);
 assert.match(src,/chỉ trang này/i);
 assert.doesNotMatch(src,/\/api\/kiot-inventory-sync|fetch\(/);
});
