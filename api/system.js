const { health } = require('../lib/whose-backend');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  const supabaseUrl =
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    null;

  const publishableKey =
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    null;

  const db = await health();

  res.status(200).json({
    app: 'Whose Studio',
    generatedAt: new Date().toISOString(),
    deployment: {
      commitSha: process.env.VERCEL_GIT_COMMIT_SHA || null,
      environment: process.env.VERCEL_ENV || null,
      region: process.env.VERCEL_REGION || null
    },
    integrations: {
      kiotviet: {
        retailerConfigured: Boolean(process.env.KIOTVIET_RETAILER),
        clientIdConfigured: Boolean(process.env.KIOTVIET_CLIENT_ID),
        clientSecretConfigured: Boolean(process.env.KIOTVIET_CLIENT_SECRET),
        mode: 'read-only'
      },
      supabase: {
        urlConfigured: Boolean(supabaseUrl),
        publishableKeyConfigured: Boolean(publishableKey),
        ready: db.ready,
        schemaVersion: db.ready ? '20261009-foundation' : null
      }
    },
    modules: {
      dashboard: 'available',
      kiotvietReadModel: 'available',
      inventoryMirror: 'read-model-ready',
      transfersMirror: 'read-model-ready',
      returnsMirror: 'read-model-ready',
      productsMirror: 'read-model-ready',
      auth: db.ready ? 'employee-signin-ready' : 'waiting-for-supabase',
      employeesAndRoles: db.ready ? 'schema-ready' : 'waiting-for-supabase',
      storeWarehouseOperations: db.ready ? 'request-ui-ready-needs-staff' : 'waiting-for-supabase',
      stocktakeDeltaLedger: db.ready ? 'schema-only' : 'waiting-for-supabase',
      realtime: 'not-configured',
      kiotvietWrite: 'disabled'
    }
  });
};
