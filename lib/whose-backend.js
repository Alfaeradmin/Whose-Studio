// Whose-only Supabase gateway. Never stores a service-role key or writes to KiotViet.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const AUTH_RE = /^Bearer ([A-Za-z0-9._~-]+)$/;
// Explicit deployment guard: ALFAER WMS and any unverified Supabase project are forbidden.
const WHOSE_SUPABASE_HOST = 'fjauxxunyxxboduyxjyr.supabase.co';

function environment() {
  const rawUrl = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!rawUrl || !key) return null;
  let parsed;
  try { parsed = new URL(rawUrl); } catch { return null; }
  if (parsed.protocol !== 'https:' || parsed.hostname !== WHOSE_SUPABASE_HOST || parsed.port || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') return null;
  return { url: parsed.origin, key };
}

async function rest(path, options = {}) {
  const env = environment();
  if (!env) return { ok: false, status: 503, data: { error: 'Whose Supabase is not configured' } };
  const headers = {
    apikey: env.key,
    ...(options.bearer ? { Authorization: options.bearer } : {}),
    Accept: 'application/json'
  };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  let response;
  try {
    response = await fetch(env.url + '/rest/v1/' + path, {
      method: options.method || 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: AbortSignal.timeout(8500)
    });
  } catch {
    return { ok: false, status: 502, data: { error: 'Whose database unavailable' } };
  }
  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = null; }
  return { ok: response.ok, status: response.status, data };
}

async function health() {
  const result = await rest('rpc/whose_backend_health', { method: 'POST', body: {} });
  return { ready: result.ok && result.data?.app === 'whose-studio' &&
    result.data?.schema === '20261009-foundation',
    configured: Boolean(environment()) };
}

function accessToken(req) {
  const auth = req.headers.authorization || '';
  const match = AUTH_RE.exec(auth);
  return match ? 'Bearer ' + match[1] : null;
}
function isUuid(value) { return typeof value === 'string' && UUID_RE.test(value); }

function readResourceParams(query) {
  const resource = String(query.resource || '');
  const allowed = {
    branches: ['id','code','name','kind','is_active','kiot_branch_id'],
    products: ['id','sku','name','is_active','kiot_product_id'],
    inventory: ['branch_id','product_id','on_hand','reserved','synced_at'],
    requests: ['id','origin_branch_id','destination_branch_id','status','note','created_at','updated_at'],
    request_lines: ['id','request_id','sku','requested_qty','note'],
    request_events: ['id','request_id','actor_id','event_type','created_at'],
    request_messages: ['id','request_id','author_id','body','created_at']
  };
  if (!Object.hasOwn(allowed, resource)) return null;
  const tables = {
    branches: 'whose_branches', products: 'whose_products', inventory: 'whose_inventory_snapshots',
    requests: 'whose_requests', request_lines: 'whose_request_lines',
    request_events: 'whose_request_events', request_messages: 'whose_request_messages'
  };
  const qs = new URLSearchParams();
  qs.set('select', allowed[resource].join(','));
  qs.set('limit', String(Math.min(100, Math.max(1, Number.parseInt(query.limit, 10) || 50))));
  if (resource === 'branches') qs.set('order', 'name.asc');
  if (resource === 'products') qs.set('order', 'sku.asc');
  if (resource === 'requests') qs.set('order', 'created_at.desc');
  if (resource === 'request_events' || resource === 'request_messages') qs.set('order', 'created_at.desc');
  if (resource === 'inventory') {
    if (!isUuid(query.branch_id)) return null;
    qs.set('branch_id', 'eq.' + query.branch_id);
  }
  if (resource === 'request_lines' || resource === 'request_events' || resource === 'request_messages') {
    if (!isUuid(query.request_id)) return null;
    qs.set('request_id', 'eq.' + query.request_id);
  }
  return tables[resource] + '?' + qs.toString();
}

function validateSubmission(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  if (!isUuid(payload.origin_branch_id) || !isUuid(payload.destination_branch_id)) return null;
  if (payload.origin_branch_id === payload.destination_branch_id) return null;
  if (payload.idempotency_key != null && !isUuid(payload.idempotency_key)) return null;
  if (typeof payload.note !== 'undefined' && (typeof payload.note !== 'string' || payload.note.length > 2000)) return null;
  if (!Array.isArray(payload.lines) || payload.lines.length < 1 || payload.lines.length > 100) return null;
  const lines = [];
  for (const line of payload.lines) {
    if (!line || typeof line !== 'object' || Array.isArray(line)) return null;
    const sku = typeof line.sku === 'string' ? line.sku.trim() : '';
    const qty = line.qty;
    const num = typeof qty === 'number' ? qty : (typeof qty === 'string' && qty.trim() ? Number(qty) : NaN);
    if (!sku || sku.length > 100 || !Number.isFinite(num) || num <= 0 || num > 1000000 ||
        Math.round(num * 1000) !== num * 1000) return null;
    if (line.note !== undefined && (typeof line.note !== 'string' || line.note.length > 1000)) return null;
    lines.push({ sku, qty: num, note: line.note || null });
  }
  return {
    p_origin: payload.origin_branch_id,
    p_destination: payload.destination_branch_id,
    p_lines: lines,
    p_note: payload.note || null,
    p_idempotency: payload.idempotency_key || null
  };
}

module.exports = { environment, health, rest, accessToken, readResourceParams, validateSubmission, isUuid };
