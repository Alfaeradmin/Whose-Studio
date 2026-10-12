'use strict';
/** Configuration-only readiness. Never returns values of credentials. */
function connectorReadiness(env=process.env){
 const required=['KIOTVIET_CLIENT_ID','KIOTVIET_CLIENT_SECRET','KIOTVIET_RETAILER','SUPABASE_URL',
 'WHOSE_CONNECTOR_SERVICE_ROLE_KEY','KIOTVIET_WEBHOOK_SECRET_BASE64'];
 const configured=Object.fromEntries(required.map(k=>[k,typeof env[k]==='string'&&env[k].trim().length>0]));
 const oauth=['KIOTVIET_CLIENT_ID','KIOTVIET_CLIENT_SECRET','KIOTVIET_RETAILER'].every(k=>configured[k]);
 const worker=oauth&&configured.SUPABASE_URL&&configured.WHOSE_CONNECTOR_SERVICE_ROLE_KEY;
 const webhook=worker&&configured.KIOTVIET_WEBHOOK_SECRET_BASE64;
 return Object.freeze({oauthConfigured:oauth,workerConfigured:worker,webhookConfigured:webhook,
  canRunReadOnlyWorker:worker,canReceiveSignedWebhook:webhook,kiotWriteEnabled:false,
  missing:required.filter(k=>!configured[k])});
}
module.exports={connectorReadiness};
