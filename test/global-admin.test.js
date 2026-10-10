const test = require('node:test');
const assert = require('node:assert/strict');
const { validateStaffBearer } = require('../lib/whose-auth');

async function withMockedWhoseAuth(isAdmin, fn) {
  const savedUrl = process.env.SUPABASE_URL;
  const savedKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  const originalFetch = global.fetch;
  const requests = [];
  process.env.SUPABASE_URL = 'https://fjauxxunyxxboduyxjyr.supabase.co';
  process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test_only';
  try {
    global.fetch = async (input, init = {}) => {
      const url = new URL(input);
      requests.push({ url: url.pathname, method: init.method });
      assert.equal(url.hostname, 'fjauxxunyxxboduyxjyr.supabase.co');
      assert.equal(init.headers.Authorization, 'Bearer example');
      if (url.pathname === '/auth/v1/user')
        return new Response(JSON.stringify({ id: 'staff-1', email: 'alfaeradmin@gmail.com' }), { status: 200 });
      if (url.pathname === '/rest/v1/whose_staff_memberships')
        return new Response(JSON.stringify([]), { status: 200 });
      if (url.pathname === '/rest/v1/rpc/whose_my_global_admin')
        return new Response(JSON.stringify(isAdmin), { status: 200 });
      if (url.pathname === '/rest/v1/whose_branches')
        return new Response(JSON.stringify([]), { status: 200 });
      throw Error('Unexpected request ' + url.pathname);
    };
    await fn(requests);
  } finally {
    global.fetch = originalFetch;
    if (savedUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = savedUrl;
    if (savedKey === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY;
    else process.env.SUPABASE_PUBLISHABLE_KEY = savedKey;
  }
}

test('verified SQL-backed global admin can sign in before first real branch exists', async () => {
  await withMockedWhoseAuth(true, async requests => {
    const result = await validateStaffBearer('Bearer example');
    assert.equal(result.ok, true);
    assert.equal(result.is_global_admin, true);
    assert.deepEqual(result.branches, []);
    assert.deepEqual(result.memberships, []);
    assert.ok(requests.some(x => x.url === '/rest/v1/rpc/whose_my_global_admin'));
  });
});

test('unapproved user with zero memberships is refused', async () => {
  await withMockedWhoseAuth(false, async () => {
    const result = await validateStaffBearer('Bearer example');
    assert.equal(result.ok, false);
    assert.equal(result.status, 403);
    assert.equal(result.reason, 'STAFF_NOT_ONBOARDED');
  });
});
