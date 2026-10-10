const {
  health, rest, accessToken, readResourceParams, validateSubmission
} = require('../lib/whose-backend');
const { verifyOrigin } = require('../lib/whose-auth');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const bearer = accessToken(req);
  if (!bearer) return res.status(401).json({ error: 'Login required' });

  // Fail closed if pointed at a different database or migration is not applied.
  const status = await health();
  if (!status.ready) {
    return res.status(503).json({ error: 'Whose backend is not ready' });
  }

  if (req.method === 'GET') {
    const path = readResourceParams(req.query || {});
    if (!path) return res.status(400).json({ error: 'Invalid resource or filter' });
    const result = await rest(path, { bearer });
    if (!result.ok) {
      return res.status(result.status === 401 ? 401 : result.status === 403 ? 403 : 502)
        .json({ error: 'Cannot read requested Whose data' });
    }
    return res.status(200).json({ rows: Array.isArray(result.data) ? result.data : [] });
  }

  if (!verifyOrigin(req)) return res.status(403).json({ error: 'Invalid request origin' });
  if (req.query?.resource !== 'requests') {
    return res.status(404).json({ error: 'Unsupported operation' });
  }
  if (Number(req.headers['content-length'] || 0) > 32768) {
    return res.status(413).json({ error: 'Request body too large' });
  }
  const body = typeof req.body === 'string' ? (() => {
    try { return JSON.parse(req.body); } catch { return null; }
  })() : req.body;
  const payload = validateSubmission(body);
  if (!payload) return res.status(400).json({ error: 'Invalid request payload' });
  const result = await rest('rpc/whose_submit_request', { method: 'POST', bearer, body: payload });
  if (!result.ok) {
    const code = result.status === 401 ? 401 : result.status === 403 ? 403 :
      result.status === 400 ? 400 : 502;
    return res.status(code).json({ error: 'Whose request was not accepted' });
  }
  return res.status(201).json({ id: result.data, status: 'submitted' });
};
