'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const ui=source('ops-preview.js'),html=source('ops-preview.html'),css=source('ops-preview.css');
const sql=source('supabase/migrations/20261014094500_whose_store_warehouse_ops.sql');
test('store composer has only SKU, quantity, borrow reason and note inputs',()=>{
 for(const id of ['skuInput','qtyInput','borrowReason','borrowNote','borrowZone'])assert.ok(ui.includes(id),id);
 assert.doesNotMatch(ui,/id=['"]chatMessage|sendChatMessage|contenteditable/);
 assert.match(html,/Giao tiếp cửa hàng/);
});
test('admin-only perspective is switched only for admin and hidden for staff',()=>{
 assert.match(ui,/person\(\)\?\.duty!=='admin'/);
 assert.match(html,/id="viewToggleBox" hidden/);
 assert.match(css,/\[hidden\]\{display:none!important\}/);
 assert.match(ui,/adminPerspective/);
});
test('warehouse view does not contain a request composer and store view has no picking input',()=>{
 assert.match(ui,/side\(\)==='store'\?storeComposer\(c,p\):warehouseComposer\(c,p\)/);
 assert.match(ui,/if\(!allowed\('seller'\)\)/);
 assert.match(ui,/if\(allowed\('picker'\)\)/);
 assert.match(ui,/if\(allowed\('runner'\)\)/);
});
test('database release remains Whose-only and protects borrowing reasons',()=>{
 assert.match(sql,/borrow_reason text NOT NULL/);
 assert.match(sql,/whose_private.global_admin\(\) OR \(/);
 assert.match(sql,/FUNCTION public.whose_ops_board/);
 assert.doesNotMatch(sql,/kiotapi\.com/);
});
test('demo does not silently access real Whose or Kiot data',()=>{
 assert.match(html,/PREVIEW \/ DEMO/);
 assert.doesNotMatch(ui,/authorizedFetch|localStorage|\bXMLHttpRequest/);
 assert.match(ui,/\/api\/ops-product-search/);
 assert.match(ui,/\/api\/ops-bill-probe/);
 assert.match(ui,/sessionStorage/);
});
