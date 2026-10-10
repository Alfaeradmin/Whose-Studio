const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const sql = fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261010183000_whose_retired_admin_audit_snapshot.sql'),'utf8');
const executable = sql.split('\n').filter(line => !line.trim().startsWith('--')).join('\n');

test('retired Whose Admin cleanup preserves UUID audit and validates successor and revocation', () => {
  for(const token of [
    'WHOSE STUDIO ONLY', 'fjauxxunyxxboduyxjyr',
    'alfaeradmin@gmail.com','nguyenducnguyen743@gmail.com',
    "h.state='old_admin_revoked'", 'h.new_login_verified_at IS NOT NULL',
    'n.email_confirmed_at IS NOT NULL', 'np.is_active AND np.is_global_admin',
    'NOT op.is_active AND NOT op.is_global_admin',
    "oi.state='cancelled'", 'previous_user_id_snapshot=previous_user_id',
    'previous_user_id=NULL', 'ROW_COUNT', 'admin_handover_identity_retention_check'
  ]) assert.ok(sql.includes(token), 'Missing migration safety invariant: ' + token);
});

test('cleanup touches only private audit and not Auth, stock, or requests', () => {
  assert.doesNotMatch(executable, /\bDELETE\s+FROM\s+auth\.users/i);
  assert.doesNotMatch(executable, /\bUPDATE\s+auth\.users/i);
  assert.doesNotMatch(executable, /\bDROP\s+CONSTRAINT\b|\bDROP\s+TABLE\b|\bTRUNCATE\b/i);
  assert.doesNotMatch(executable, /UPDATE\s+public\.whose_/i);
  assert.doesNotMatch(executable, /ifvakwlwmarhtmdlinnq/i);
});
