const TOKEN_URL = 'https://id.kiotviet.vn/connect/token';
const API_BASE = 'https://public.kiotapi.com';

const READ_ONLY_RESOURCES = new Set([
  'branches',
  'settings',
  'products',
  'productOnHands',
  'orders',
  'invoices',
  'purchaseorders',
  'ordersuppliers',
  'transfers',
  'returns'
]);

let tokenCache = null;
let tokenPromise = null;

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

const STANDARD_OAUTH_ERRORS = new Set([
  'invalid_client','invalid_scope','invalid_request',
  'unauthorized_client','unsupported_grant_type',
  'access_denied','temporarily_unavailable','invalid_grant'
]);
function oauthFailureCode(raw) {
  try {
    const obj=JSON.parse(raw);
    const code=obj && typeof obj.error==='string' ? obj.error : '';
    return STANDARD_OAUTH_ERRORS.has(code)?code:'unknown';
  } catch { return 'unknown'; }
}
function tokenFailure(status,raw) {
  // Never include raw OAuth response bodies, credentials, access tokens or error_description.
  return new Error('KiotViet token failed ('+status+'): '+oauthFailureCode(raw));
}
async function tokenRequest(field) {
  const body = new URLSearchParams({
    [field]: 'PublicApi.Access',
    grant_type: 'client_credentials',
    client_id: requiredEnv('KIOTVIET_CLIENT_ID'),
    client_secret: requiredEnv('KIOTVIET_CLIENT_SECRET')
  });
  return fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(12000)
  });
}
async function requestAccessToken() {
  // The official KiotViet Retail manual documents "scopes" (plural).
  let response=await tokenRequest('scopes');
  if(!response.ok) {
    const raw=await response.text();
    const errorCode=oauthFailureCode(raw);
    // Try the alternate common OAuth field only if the server explicitly
    // rejects this request's scope/format. Never retry invalid credentials.
    if(response.status===400 &&
      (errorCode==='invalid_scope'||errorCode==='invalid_request')){
      response=await tokenRequest('scope');
      if(!response.ok)throw tokenFailure(response.status,await response.text());
    } else {
      throw tokenFailure(response.status,raw);
    }
  }
  const json=await response.json();
  const token=json.access_token||json.accessToken;
  if(!token || typeof token!=='string')throw new Error('KiotViet token response did not contain access_token');
  const expiresInSeconds=Number(json.expires_in||86400);
  tokenCache={
    token,
    expiresAt:Date.now()+Math.max(60,expiresInSeconds-300)*1000
  };
  return token;
}

async function getAccessToken() {
  if (tokenCache && tokenCache.expiresAt > Date.now()) return tokenCache.token;
  if (!tokenPromise) {
    tokenPromise = requestAccessToken().finally(() => {
      tokenPromise = null;
    });
  }
  return tokenPromise;
}

async function getResource(resource, params = {}) {
  if (!READ_ONLY_RESOURCES.has(resource)) {
    throw new Error(`Resource is not in read-only allowlist: ${resource}`);
  }

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
  if (!response.ok) {
    // Do not leak provider response bodies to user-facing overview or errors.
    throw new Error(`KiotViet GET /${resource} failed (${response.status})`);
  }
  return text ? JSON.parse(text) : null;
}

async function safeRead(resource, params) {
  const started = Date.now();
  try {
    const data = await getResource(resource, params);
    return { ok: true, ms: Date.now() - started, data };
  } catch (error) {
    return {
      ok: false,
      ms: Date.now() - started,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}


const BILL_CODE_RE=/^[A-Za-z0-9][A-Za-z0-9_-]{0,47}$/;
// Deliberately does not allow arbitrary provider paths or URL segments from user input.
async function safeReadInvoiceByCode(code){
 if(typeof code!=='string'||!BILL_CODE_RE.test(code))
  return {ok:false,error:'INVALID_BILL_CODE'};
 const started=Date.now();
 try{
  const token=await getAccessToken();
  const response=await fetch(API_BASE+'/invoices/code/'+encodeURIComponent(code),{
   method:'GET',
   headers:{Retailer:requiredEnv('KIOTVIET_RETAILER'),
    Authorization:'Bearer '+token,Accept:'application/json'},
   signal:AbortSignal.timeout(12000)
  });
  if(!response.ok)return {ok:false,status:response.status,error:'INVOICE_SOURCE_UNAVAILABLE'};
  const data=await response.json();
  return {ok:true,ms:Date.now()-started,data};
 }catch{return {ok:false,error:'INVOICE_SOURCE_UNAVAILABLE'}}
}
module.exports = { getResource, safeRead, READ_ONLY_RESOURCES, oauthFailureCode, tokenFailure, safeReadInvoiceByCode };
