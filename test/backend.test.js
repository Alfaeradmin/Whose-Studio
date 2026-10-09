const test = require('node:test');
const assert = require('node:assert/strict');
const gateway = require('../lib/whose-backend');
const handler = require('../api/backend');

const branch1 = '123e4567-e89b-42d3-a456-426614174000';
const branch2 = '123e4567-e89b-42d3-a456-426614174001';
const idem = '123e4567-e89b-42d3-a456-426614174002';
const response = () => {
  const result = { statusCode: null, body: null, headers: {} };
  result.status = function (s) { result.statusCode = s; return result; };
  result.json = function (v) { result.body = v; return result; };
  result.setHeader = function (key, value) { result.headers[key] = value; return result; };
  return result;
};

test('validation accepts bounded quantities and stable idempotency key', () => {
  const payload = gateway.validateSubmission({
    origin_branch_id: branch1, destination_branch_id: branch2, idempotency_key: idem,
    lines: [{ sku: ' TSH-001 ', qty: 2.25 }]
  });
  assert.equal(payload.p_lines[0].sku, 'TSH-001');
  assert.equal(payload.p_lines[0].qty, 2.25);
  assert.equal(payload.p_idempotency, idem);
});
test('validation rejects invalid branches and quantities', () => {
  const source = { origin_branch_id: branch1, destination_branch_id: branch2,
    lines: [{ sku: 'X', qty: 1 }] };
  for (const variant of [
    { ...source, destination_branch_id: branch1 },
    { ...source, lines: [{ sku: 'X', qty: -1 }] },
    { ...source, lines: [{ sku: 'X', qty: 0.0001 }] },
    { ...source, lines: [{ sku: 'X', qty: 'NaN' }] },
    { ...source, lines: [] },
    { ...source, idempotency_key: 'invalid' }
  ]) assert.equal(gateway.validateSubmission(variant), null);
});
test('read allowlist requires scoped inventory and line IDs', () => {
  assert.equal(gateway.readResourceParams({ resource: 'unknown' }), null);
  assert.equal(gateway.readResourceParams({ resource: 'inventory' }), null);
  assert.equal(gateway.readResourceParams({ resource: 'request_lines', request_id: 'abc' }), null);
  const path = gateway.readResourceParams({ resource: 'inventory', branch_id: branch1, limit: '900' });
  assert.match(path, /limit=100/);
  assert.match(path, /branch_id=eq/);
});
test('backend blocks unauthenticated requests', async () => {
  const res = response();
  await handler({ method: 'GET', headers: {}, query: { resource: 'branches' } }, res);
  assert.equal(res.statusCode, 401);
});
test('health stays unready without Whose-only Supabase configuration', async () => {
  const prevUrl = process.env.SUPABASE_URL;
  const prevKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_PUBLISHABLE_KEY;
  try {
    const result = await gateway.health();
    assert.deepEqual(result, { ready: false, configured: false });
  } finally {
    if (prevUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = prevUrl;
    if (prevKey === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY;
    else process.env.SUPABASE_PUBLISHABLE_KEY = prevKey;
  }
});

test('Whose gateway refuses other Supabase project URLs', () => {
  const oldUrl = process.env.SUPABASE_URL;
  const oldKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  try {
    process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';
    process.env.SUPABASE_URL = 'https://ifvakwlwmarhtmdlinnq.supabase.co';
    assert.equal(gateway.environment(), null, 'must never connect to ALFAER WMS');
    process.env.SUPABASE_URL = 'https://fjauxxunyxxboduyxjyr.supabase.co';
    assert.equal(gateway.environment()?.url, 'https://fjauxxunyxxboduyxjyr.supabase.co');
    process.env.SUPABASE_URL = 'https://fjauxxunyxxboduyxjyr.supabase.co.evil.example';
    assert.equal(gateway.environment(), null);
  } finally {
    if (oldUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY;
    else process.env.SUPABASE_PUBLISHABLE_KEY = oldKey;
  }
});
