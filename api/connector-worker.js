'use strict';
// Explicitly invoked, Global Admin only. Never writes to KiotViet, never scheduled.
const {accessToken}=require('../lib/whose-backend');
const {validateStaffBearer,verifyOrigin}=require('../lib/whose-auth');
const {getConfig}=require('../lib/kiot-inbox-store');
const {handleOnce}=require('../lib/kiot-inbox-worker');
module.exports=async function handler(req,res){
 res.setHeader('Cache-Control','private,no-store');
 if(req.method!=='GET'&&req.method!=='POST')return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
 const staff=await validateStaffBearer(accessToken(req));
 if(!staff.ok)return res.status(staff.status).json({error:'STAFF_AUTH_REQUIRED'});
 if(staff.is_global_admin!==true)return res.status(403).json({error:'ADMIN_REQUIRED'});
 const configured=Boolean(getConfig());
 if(req.method==='GET'){
   const key=process.env.WHOSE_CONNECTOR_SERVICE_ROLE_KEY||'';
   const keyType=key.startsWith('sb_secret_')?'secret':key.startsWith('eyJ')?'legacy_jwt':key.startsWith('sb_publishable_')?'publishable_invalid':'unknown';
   return res.status(200).json({workerConfigured:configured,webhookConfigured:Boolean(process.env.KIOTVIET_WEBHOOK_SECRET_BASE64),webhookRegistrationVerified:false,keyType,keyHasSurroundingWhitespace:key!==key.trim(),keyHasQuotes:/^[\"']|[\"']$/.test(key),keyLengthValid:keyType==='secret'?key.length>=40:keyType==='legacy_jwt'?key.split('.').length===3:false,scheduled:false,kiotWritesEnabled:false});
 }
 if(!verifyOrigin(req))return res.status(403).json({error:'INVALID_ORIGIN'});
 if(!configured)return res.status(503).json({error:'WORKER_NOT_CONFIGURED'});
 try{
   const result=await handleOnce();
   return res.status(200).json({...result,kiotWritesEnabled:false,scheduled:false});
 }catch(err){
   // Bounded diagnostics; never return credentials, URLs or provider payloads.
   const msg=err instanceof Error?err.message:'';
   const code=/^CONNECTOR_RPC_FAILED_(400|401|403|404|408|409|422|429|500|502|503|504)$/.test(msg)
     ?msg:/^(CONNECTOR_STORAGE_NOT_CONFIGURED|INVALID_CLAIM_RESPONSE|LOST_INBOX_LEASE)$/.test(msg)
     ?msg:err?.name==='TimeoutError'?'WORKER_TIMEOUT':'WORKER_RUN_FAILED';
   console.warn('[Whose/connector-worker]',code);
   return res.status(503).json({error:code});
 }
};
