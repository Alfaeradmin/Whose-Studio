const { environment, accessToken } = require('../lib/whose-backend');
const { authFetch, validateStaffBearer, verifyOrigin } = require('../lib/whose-auth');

function fail(res, status, message) {
  return res.status(status).json({ error: message });
}
function safeSession(tokens, staff) {
  return {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_in: tokens.expires_in,
    expires_at: Math.floor(Date.now() / 1000) + Number(tokens.expires_in || 3600),
    user: staff.user,
    is_global_admin: staff.is_global_admin,
    memberships: staff.memberships,
    branches: staff.branches
  };
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  if (!environment()) return fail(res, 503, 'Whose authentication not configured');
  if (req.method === 'GET') {
    const staff = await validateStaffBearer(accessToken(req));
    if (!staff.ok) return fail(res, staff.status, staff.reason || 'Session expired or access denied');
    return res.status(200).json({
      user: staff.user,
      is_global_admin: staff.is_global_admin,
      memberships: staff.memberships,
      branches: staff.branches
    });
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return fail(res, 405, 'Method not allowed');
  }
  if (!verifyOrigin(req)) return fail(res, 403, 'Invalid request origin');
  if (Number(req.headers?.['content-length'] || 0) > 4096) return fail(res, 413, 'Payload too large');
  let payload = req.body;
  if (typeof payload === 'string') {
    try { payload = JSON.parse(payload); } catch { return fail(res, 400, 'Invalid payload'); }
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return fail(res, 400, 'Invalid payload');
  const mode = payload.action;
  if (mode === 'logout') {
    const bearer = accessToken(req);
    if (!bearer) return fail(res, 401, 'Session not found');
    await authFetch('logout?scope=local', { method: 'POST', bearer, body: {} });
    return res.status(200).json({ signedOut: true });
  }
  if (mode !== 'login' && mode !== 'refresh') return fail(res, 400, 'Unsupported authentication action');
  let tokens;
  if (mode === 'login') {
    const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
    const password = payload.password;
    if (email.length < 5 || email.length > 254 || !email.includes('@') ||
        typeof password !== 'string' || password.length < 8 || password.length > 256)
      return fail(res, 400, 'Invalid email or password');
    tokens = await authFetch('token?grant_type=password', {
      method: 'POST',
      body: { email, password }
    });
  } else {
    if (typeof payload.refresh_token !== 'string' || payload.refresh_token.length < 16 ||
        payload.refresh_token.length > 4096) return fail(res, 400, 'Invalid refresh token');
    tokens = await authFetch('token?grant_type=refresh_token', {
      method: 'POST', body: { refresh_token: payload.refresh_token }
    });
  }
  if (!tokens.ok || !tokens.data?.access_token || !tokens.data?.refresh_token) {
    return fail(res, tokens.status === 429 ? 429 : tokens.status >= 500 ? 503 : 401,
      'Invalid credentials or expired session');
  }
  const staff = await validateStaffBearer('Bearer ' + tokens.data.access_token);
  if (!staff.ok) return fail(res, staff.status, staff.reason || 'Access denied');
  return res.status(200).json(safeSession(tokens.data, staff));
};
