// Whose-only authentication and staff authorization.
// All calls are confined to the fixed Whose Supabase URL; never use a service-role key.
const { environment, rest, accessToken } = require('./whose-backend');

async function authFetch(endpoint, options = {}) {
  const env = environment();
  if (!env) return { ok: false, status: 503, data: null };
  try {
    const response = await fetch(env.url + '/auth/v1/' + endpoint, {
      method: options.method || 'GET',
      headers: {
        apikey: env.key,
        'Content-Type': 'application/json',
        ...(options.bearer ? { Authorization: options.bearer } : {})
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: AbortSignal.timeout(8500)
    });
    const raw = await response.text();
    let data = null;
    try { data = raw ? JSON.parse(raw) : null; } catch {}
    return { ok: response.ok, status: response.status, data };
  } catch {
    return { ok: false, status: 502, data: null };
  }
}

async function validateStaffBearer(bearer) {
  if (!bearer) return { ok: false, status: 401 };
  const userResult = await authFetch('user', { bearer });
  if (!userResult.ok || !userResult.data?.id)
    return { ok: false, status: userResult.status === 503 || userResult.status === 502 ? 503 : 401 };
  // Never trust a client-supplied role or only a profile flag.
  // RLS-backed SQL verifies the approved, email-confirmed global admin.
  const [membershipResult, adminResult] = await Promise.all([
    rest('whose_staff_memberships?select=branch_id,role&is_active=eq.true&limit=100', { bearer }),
    rest('rpc/whose_my_global_admin', { method: 'POST', body: {}, bearer })
  ]);
  if (!membershipResult.ok || !adminResult.ok)
    return { ok: false, status: membershipResult.status === 401 || adminResult.status === 401 ? 401 : 503 };
  if (typeof adminResult.data !== 'boolean')
    return { ok: false, status: 503 };
  const isGlobalAdmin = adminResult.data === true;
  const memberships = Array.isArray(membershipResult.data) ? membershipResult.data : [];
  if (!isGlobalAdmin && !memberships.length)
    return { ok: false, status: 403, reason: 'STAFF_NOT_ONBOARDED' };

  const branchesResult = await rest(
    'whose_branches?select=id,code,name,kind,is_active&is_active=eq.true&limit=200',
    { bearer }
  );
  if (!branchesResult.ok || !Array.isArray(branchesResult.data))
    return { ok: false, status: 503 };
  const active = new Set(branchesResult.data.map(x => x.id));
  const scoped = memberships.filter(x => active.has(x.branch_id));
  if (!isGlobalAdmin && !scoped.length)
    return { ok: false, status: 403, reason: 'STAFF_NOT_ONBOARDED' };
  return {
    ok: true,
    user: { id: userResult.data.id, email: userResult.data.email || '' },
    is_global_admin: isGlobalAdmin,
    memberships: scoped,
    branches: branchesResult.data
  };
}

function verifyOrigin(req) {
  // Same-origin tokens are bearer-based; reject cross-origin requests as extra protection.
  const site = req.headers?.['sec-fetch-site'];
  if (site && site !== 'same-origin' && site !== 'none') return false;
  const origin = req.headers?.origin;
  if (!origin) return true;
  const host = req.headers?.host;
  const proto = req.headers?.['x-forwarded-proto'] || 'https';
  return host && origin === proto + '://' + host;
}
function requireStaff(req, res) {
  const bearer = accessToken(req);
  if (!bearer) {
    res.status(401).json({ error: 'Login required' });
    return null;
  }
  return bearer;
}

module.exports = { authFetch, validateStaffBearer, verifyOrigin, requireStaff };
