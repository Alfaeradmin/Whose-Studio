const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const handler = require('../api/password');

function response() {
  return {
    statusCode: null, headers: {}, payload: null,
    setHeader(k, v) { this.headers[k] = v; return this; },
    status(s) { this.statusCode = s; return this; },
    json(payload) { this.payload = payload; return this; }
  };
}

const validHost = 'whose-studio-abc123-alfaer-peace-club.vercel.app';
const otherHost = 'alfaer-wms.vercel.app';

test('first-admin recovery is confined to Whose hostnames', () => {
  assert.equal(handler.recoveryRedirect({ headers: { host: otherHost } }), null);
  assert.equal(handler.recoveryRedirect({ headers: { host: 'evil.example' } }), null);
  assert.equal(handler.recoveryRedirect({ headers: { host: validHost } }),
    'https://' + validHost + '/reset-password.html');
});

test('recovery endpoint has no GET mutations', async () => {
  const res = response();
  await handler({ method: 'GET', headers: {} }, res);
  assert.equal(res.statusCode, 405);
});

test('new password requires an authenticated recovery session', async () => {
  const oldUrl = process.env.SUPABASE_URL;
  const oldKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  process.env.SUPABASE_URL = 'https://fjauxxunyxxboduyxjyr.supabase.co';
  process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test_key';
  try {
    const res = response();
    await handler({ method: 'POST', headers: {
      host: validHost, origin: 'https://' + validHost,
      'sec-fetch-site': 'same-origin'
    }, body: { action: 'complete', password: 'not-a-real-password-123' } }, res);
    assert.equal(res.statusCode, 401);
  } finally {
    if (oldUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY;
    else process.env.SUPABASE_PUBLISHABLE_KEY = oldKey;
  }
});

test('callback scrubs URL fragments and hides password form until verified', () => {
  const html = fs.readFileSync(require('node:path').join(__dirname, '..', 'reset-password.html'), 'utf8');
  const code = fs.readFileSync(require('node:path').join(__dirname, '..', 'reset-password.js'), 'utf8');
  assert.match(html, /id="completeForm" hidden/);
  assert.match(html, /form\[hidden\]/);
  assert.match(html, /id="requestForm"/);
  assert.match(html, /id="resetTitle"/);
  assert.match(code, /history\.replaceState/);
  assert.match(code, /fragment\.get\('type'\) === 'recovery'/);
});

test('Supabase rejection of redirect does not falsely claim recovery email was sent', async () => {
  const oldUrl = process.env.SUPABASE_URL;
  const oldKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  const oldFetch = global.fetch;
  process.env.SUPABASE_URL = 'https://fjauxxunyxxboduyxjyr.supabase.co';
  process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test_key';
  try {
    global.fetch = async (url, opts) => {
      const parsed = new URL(url);
      assert.equal(parsed.hostname, 'fjauxxunyxxboduyxjyr.supabase.co');
      assert.equal(parsed.pathname, '/auth/v1/recover');
      assert.equal(parsed.searchParams.get('redirect_to'),
        'https://' + validHost + '/reset-password.html');
      assert.equal(opts.method, 'POST');
      return new Response(JSON.stringify({ error: 'redirect not allowed' }), { status: 400 });
    };
    const res = response();
    await handler({
      method: 'POST',
      headers: { host: validHost, origin: 'https://' + validHost,
        'sec-fetch-site': 'same-origin' },
      body: { action: 'request', email: 'alfaeradmin@gmail.com' }
    }, res);
    assert.equal(res.statusCode, 422);
    assert.equal(res.payload.requested, undefined);
  } finally {
    global.fetch = oldFetch;
    if (oldUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY;
    else process.env.SUPABASE_PUBLISHABLE_KEY = oldKey;
  }
});

test('approved incoming Whose admin is accepted for recovery without sending a real email', async () => {
  const oldUrl = process.env.SUPABASE_URL;
  const oldKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  const oldFetch = global.fetch;
  process.env.SUPABASE_URL = 'https://fjauxxunyxxboduyxjyr.supabase.co';
  process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test_key';
  try {
    global.fetch = async (url, opts) => {
      const parsed = new URL(url);
      assert.equal(parsed.hostname, 'fjauxxunyxxboduyxjyr.supabase.co');
      assert.equal(parsed.pathname, '/auth/v1/recover');
      assert.equal(JSON.parse(opts.body).email, 'nguyenducnguyen743@gmail.com');
      return new Response(JSON.stringify({}), { status: 200 });
    };
    const res = response();
    await handler({
      method: 'POST',
      headers: { host: validHost, origin: 'https://' + validHost, 'sec-fetch-site': 'same-origin' },
      body: { action: 'request', email: 'nguyenducnguyen743@gmail.com' }
    }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.payload.requested, true);
  } finally {
    global.fetch = oldFetch;
    if (oldUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY;
    else process.env.SUPABASE_PUBLISHABLE_KEY = oldKey;
  }
});
