const TOKEN_URL = 'https://id.kiotviet.vn/connect/token';
const API_BASE = 'https://public.kiotapi.com';

const READ_ONLY_RESOURCES = new Set([
  'branches',
  'settings',
  'products',
  'orders',
  'invoices',
  'purchaseorders',
  'ordersuppliers'
]);

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

async function getAccessToken() {
  const body = new URLSearchParams({
    scopes: 'PublicApi.Access',
    grant_type: 'client_credentials',
    client_id: requiredEnv('KIOTVIET_CLIENT_ID'),
    client_secret: requiredEnv('KIOTVIET_CLIENT_SECRET')
  });

  let response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });

  if (!response.ok) {
    const firstText = await response.text();
    const fallbackBody = new URLSearchParams({
      scope: 'PublicApi.Access',
      grant_type: 'client_credentials',
      client_id: requiredEnv('KIOTVIET_CLIENT_ID'),
      client_secret: requiredEnv('KIOTVIET_CLIENT_SECRET')
    });
    response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: fallbackBody
    });
    if (!response.ok) {
      const secondText = await response.text();
      throw new Error(`KiotViet token failed (${response.status}): ${secondText || firstText}`);
    }
  }

  const json = await response.json();
  const token = json.access_token || json.accessToken;
  if (!token) throw new Error('KiotViet token response did not contain access_token');
  return token;
}

async function getResource(resource, params = {}) {
  if (!READ_ONLY_RESOURCES.has(resource)) throw new Error(`Resource is not in read-only allowlist: ${resource}`);

  const token = await getAccessToken();
  const url = new URL(`${API_BASE}/${resource}`);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      for (const item of value) url.searchParams.append(key, String(item));
    } else {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Retailer: requiredEnv('KIOTVIET_RETAILER'),
      Authorization: `Bearer ${token}`,
      Accept: 'application/json'
    }
  });

  const text = await response.text();
  if (!response.ok) throw new Error(`KiotViet GET /${resource} failed (${response.status}): ${text.slice(0, 800)}`);
  return text ? JSON.parse(text) : null;
}

async function safeRead(resource, params) {
  const started = Date.now();
  try {
    const data = await getResource(resource, params);
    return { ok: true, ms: Date.now() - started, data };
  } catch (error) {
    return { ok: false, ms: Date.now() - started, error: error instanceof Error ? error.message : String(error) };
  }
}

module.exports = { getResource, safeRead, READ_ONLY_RESOURCES };
