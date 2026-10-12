const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const sql = fs.readFileSync(path.join(__dirname,
  '../supabase/migrations/20261012113000_whose_activate_verified_stores.sql'),'utf8');
const active = sql.split('\n').filter(s=>!s.trim().startsWith('--')).join('\n');

test('only confirmed KiotViet stores LVS and NVT are activated',()=>{
  for(const expected of [
    'fjauxxunyxxboduyxjyr',
    "s.kiot_branch_id=1263919 AND s.name='WHOSE STUDIO LVS'",
    "s.kiot_branch_id=1280205 AND s.name='WHOSE STUDIO NVT'",
    "s.kiot_branch_id=1280006 AND s.name='THE BOX ICON'",
    's.kiot_branch_id IN (1263919,1280205)',
    "WHERE kiot_branch_id=1280006",
    "'store',true",
    'ON CONFLICT (kiot_branch_id) DO NOTHING',
    'RAISE EXCEPTION'
  ]) assert.ok(sql.includes(expected),'Missing Whose branch guard '+expected);
});

test('source names and codes are copied; no synthetic location codes or other data mutations',()=>{
  assert.match(active,/SELECT s\.kiot_branch_id,s\.code,s\.name,'store',true/);
  assert.match(active,/INSERT INTO public\.whose_branches/);
  assert.doesNotMatch(active, /\bUPDATE\b|\bDELETE\b|\bTRUNCATE\b|\bDROP\b/i);
  assert.doesNotMatch(active,/\bINSERT\s+INTO\s+public\.whose_(?:inventory|products|requests|staff)/i);
  assert.doesNotMatch(active,/\b(?:ALTER|INSERT INTO|UPDATE|DELETE FROM)\s+auth\.users/i);
  assert.doesNotMatch(active,/ifvakwlwmarhtmdlinnq/i);
});

test('successor-only global admin and no stock/order delta are required',()=>{
  assert.match(sql,/p\.is_active AND p\.is_global_admin/);
  assert.match(sql,/u\.email_confirmed_at IS NOT NULL/);
  assert.match(sql,/lower\(u\.email\)='nguyenducnguyen743@gmail\.com'/);
  assert.match(sql,/v_inventory_before/);
  assert.match(sql,/v_products_before/);
  assert.match(sql,/v_requests_before/);
  assert.match(sql,/Unexpected operational data change/);
  assert.match(sql,/Unexpected existing operational branch/);
});
