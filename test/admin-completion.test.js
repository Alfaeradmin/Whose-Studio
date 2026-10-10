const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const source=fs.readFileSync(require('node:path').join(__dirname,'../supabase/migrations/20261010190000_whose_complete_admin_handover.sql'),'utf8');
test('retired Whose administrator must no longer be in Auth before completion',()=>{
 assert.ok(source.includes("lower(u.email) = 'alfaeradmin@gmail.com'"));
 assert.ok(source.includes("i.state='cancelled'"));
 assert.ok(source.includes("p.is_active AND p.is_global_admin"));
 assert.ok(source.includes("h.previous_user_id_snapshot IS NOT NULL"));
 assert.ok(source.includes("h.new_login_verified_at IS NOT NULL"));
 assert.ok(source.includes("state='completed',completed_at=now()"));
});
