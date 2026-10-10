const { validateStaffBearer } = require('../lib/whose-auth');
const { accessToken } = require('../lib/whose-backend');
const { safeRead } = require('../lib/kiotviet');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Read-only: GET only' });
  const staff = await validateStaffBearer(accessToken(req));
  if (!staff.ok) return res.status(staff.status).json({ error: 'Authentication and Whose staff membership required' });
  const branches = await safeRead('branches', { pageSize: 1, currentItem: 0 });
  res.status(branches.ok ? 200 : 502).json({
    app: 'Whose Studio',
    mode: 'KIOTVIET_READ_ONLY',
    retailer: process.env.KIOTVIET_RETAILER || null,
    kiotviet: { ok: branches.ok, latencyMs: branches.ms, error: branches.error || null },
    checkedAt: new Date().toISOString()
  });
};
