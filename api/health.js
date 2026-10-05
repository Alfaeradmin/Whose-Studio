const { safeRead } = require('../lib/kiotviet');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Read-only: GET only' });
  const branches = await safeRead('branches', { pageSize: 1, currentItem: 0 });
  res.status(branches.ok ? 200 : 502).json({
    app: 'Whose Studio',
    mode: 'KIOTVIET_READ_ONLY',
    retailer: process.env.KIOTVIET_RETAILER || null,
    kiotviet: { ok: branches.ok, latencyMs: branches.ms, error: branches.error || null },
    checkedAt: new Date().toISOString()
  });
};
