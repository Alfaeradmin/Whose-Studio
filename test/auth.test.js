const test = require('node:test');
const assert = require('node:assert/strict');
const { validateStaffBearer, verifyOrigin } = require('../lib/whose-auth');
const authHandler = require('../api/auth');
const overviewHandler = require('../api/overview');
const healthHandler = require('../api/health');

function response() {
  return {
    statusCode: null, headers: {}, body: null,
    setHeader(name, value) { this.headers[name] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(data) { this.body = data; return this; }
  };
}
test('same-origin writes pass and cross-site requests are rejected', () => {
  assert.equal(verifyOrigin({ headers: { host: 'whose.example', 'x-forwarded-proto': 'https',
    origin: 'https://whose.example', 'sec-fetch-site': 'same-origin' } }), true);
  assert.equal(verifyOrigin({ headers: { host: 'whose.example', 'x-forwarded-proto': 'https',
    origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' } }), false);
});
test('missing bearer fails closed without contacting auth provider', async () => {
  assert.deepEqual(await validateStaffBearer(null), { ok: false, status: 401 });
});
test('KiotViet read model cannot be queried anonymously', async () => {
  for (const handler of [overviewHandler, healthHandler]) {
    const res = response();
    await handler({ method: 'GET', headers: {} }, res);
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.error, 'Authentication and Whose staff membership required');
  }
});
test('Auth endpoint cannot operate without Whose-only environment', async () => {
  const oldUrl = process.env.SUPABASE_URL;
  const oldKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  try {
    process.env.SUPABASE_URL = 'https://ifvakwlwmarhtmdlinnq.supabase.co';
    process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';
    const res = response();
    await authHandler({ method:'POST', headers: {}, body: { action:'login', email:'nobody@example.test', password:'password123' } }, res);
    assert.equal(res.statusCode, 503);
  } finally {
    if (oldUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY;
    else process.env.SUPABASE_PUBLISHABLE_KEY = oldKey;
  }
});
