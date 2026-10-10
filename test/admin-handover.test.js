const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const migration = fs.readFileSync(path.join(__dirname, '..', 'supabase/migrations/20261010150000_whose_promote_verified_successor.sql'), 'utf8');
test('global admin handover promotion requires verified real user and valid old Admin', () => {
  assert.match(migration, /WHOSE STUDIO ONLY/);
  assert.match(migration, /fjauxxunyxxboduyxjyr/);
  assert.match(migration, /alfaeradmin@gmail\.com/);
  assert.match(migration, /nguyenducnguyen743@gmail\.com/);
  assert.match(migration, /email_confirmed_at IS NOT NULL/);
  assert.match(migration, /u\.deleted_at IS NULL/);
  assert.match(migration, /JOIN whose_private\.initial_admin_onboarding/);
  assert.match(migration, /FOR UPDATE/);
  assert.match(migration, /new_admin_activated/);
});
test('admin promotion cannot delete prior account or alter warehouse balances', () => {
  assert.doesNotMatch(migration, /DELETE\s+FROM\s+auth\.users/i);
  assert.doesNotMatch(migration, /UPDATE\s+auth\.users/i);
  assert.doesNotMatch(migration, /TRUNCATE|DROP\s+TABLE/i);
  assert.doesNotMatch(migration, /UPDATE\s+public\.whose_inventory/i);
  assert.doesNotMatch(migration, /UPDATE\s+whose_private\.initial_admin_onboarding\s+SET\s+state\s*=\s*'cancelled'/i);
});
