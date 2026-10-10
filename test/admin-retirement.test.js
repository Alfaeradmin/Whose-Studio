const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const sql = fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261010163000_whose_retire_old_global_admin.sql'),'utf8');
test('previous Whose administrator is revoked only after verified successor Auth sign-in', () => {
 assert.match(sql,/WHOSE STUDIO ONLY/);
 assert.match(sql,/fjauxxunyxxboduyxjyr/);
 assert.match(sql,/u\.last_sign_in_at >= v_activated/);
 assert.match(sql,/u\.email_confirmed_at IS NOT NULL/);
 assert.match(sql,/p\.is_global_admin/);
 assert.match(sql,/i\.state='activated'/);
 assert.match(sql,/FOR UPDATE/);
 assert.match(sql,/new_login_verified/);
 assert.match(sql,/old_admin_revoked/);
});
test('old admin revocation never directly mutates Auth users or other projects', () => {
 assert.doesNotMatch(sql,/\b(?:DELETE|UPDATE|INSERT)\s+(?:FROM\s+|INTO\s+)?auth\.users/i);
 assert.doesNotMatch(sql,/\bDROP\b|\bTRUNCATE\b/i);
 assert.doesNotMatch(sql,/ifvakwlwmarhtmdlinnq/i);
 assert.doesNotMatch(sql,/kiotviet|whose_inventory_snapshots|whose_requests/i);
 assert.match(sql,/SET is_global_admin=false,is_active=false/);
 assert.match(sql,/SET state='cancelled',activated_user_id=NULL,activated_at=NULL/);
});
