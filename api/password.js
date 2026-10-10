// First-admin password setup / recovery for the dedicated Whose Studio Supabase.
// No service-role credentials, direct user creation or public sign-up.
const { environment, accessToken } = require('../lib/whose-backend');
const { authFetch, validateStaffBearer, verifyOrigin } = require('../lib/whose-auth');

const APPROVED_ADMIN_EMAIL = 'alfaeradmin@gmail.com';
const ALLOWED_PREVIEW_HOST = /^whose-studio-[a-z0-9]+-alfaer-peace-club\.vercel\.app$/;
const ALLOWED_HOSTS = new Set([
  'whose-studio-eight.vercel.app',
  'whose-studio-alfaer-peace-club.vercel.app'
]);
function fail(res, status, message) { return res.status(status).json({ error: message }); }
function recoveryRedirect(req) {
  const host = req.headers?.host;
  if (typeof host !== 'string' ||
      !(ALLOWED_PREVIEW_HOST.test(host) || ALLOWED_HOSTS.has(host))) return null;
  return 'https://' + host + '/reset-password.html';
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return fail(res, 405, 'Method not allowed');
  }
  if (!verifyOrigin(req)) return fail(res, 403, 'Request origin not allowed');
  if (!environment()) return fail(res, 503, 'Whose authentication not configured');
  if (Number(req.headers?.['content-length'] || 0) > 2048)
    return fail(res, 413, 'Payload too large');
  let payload = req.body;
  if (typeof payload === 'string') {
    try { payload = JSON.parse(payload); } catch { return fail(res, 400, 'Invalid payload'); }
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload))
    return fail(res, 400, 'Invalid payload');

  if (payload.action === 'request') {
    const redirect = recoveryRedirect(req);
    if (!redirect) return fail(res, 403, 'Unrecognized Whose website');
    const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
    if (email !== APPROVED_ADMIN_EMAIL)
      return fail(res, 400, 'Initial setup is limited to the approved Whose administrator');
    const result = await authFetch('recover?redirect_to=' + encodeURIComponent(redirect), {
      method: 'POST', body: { email }
    });
    if (result.status === 429) return fail(res, 429, 'Too many attempts. Wait before requesting another email');
    if (result.status === 503 || result.status === 502 || result.status >= 500)
      return fail(res, 503, 'Email service temporarily unavailable');
    if (!result.ok) return fail(res, 422, 'Password setup could not be started. Check the allowed Whose redirect URL');
    // The server never returns reset tokens or Supabase email response details.
    return res.status(200).json({ requested: true });
  }

  if (payload.action === 'complete') {
    const bearer = accessToken(req);
    if (!bearer) return fail(res, 401, 'Recovery session required');
    const password = payload.password;
    if (typeof password !== 'string' || password.length < 12 || password.length > 128)
      return fail(res, 400, 'Password must be 12 to 128 characters');
    const staff = await validateStaffBearer(bearer);
    if (!staff.ok || staff.is_global_admin !== true ||
        staff.user.email?.toLowerCase() !== APPROVED_ADMIN_EMAIL)
      return fail(res, staff.ok ? 403 : staff.status, 'Verified administrator required');
    const result = await authFetch('user', {
      method: 'PUT', bearer, body: { password }
    });
    if (!result.ok)
      return fail(res, result.status === 429 ? 429 : result.status >= 500 ? 503 : 400,
        'Could not set password. The recovery link may have expired');
    return res.status(200).json({ passwordUpdated: true });
  }
  return fail(res, 400, 'Unsupported recovery action');
};

module.exports.recoveryRedirect = recoveryRedirect;
