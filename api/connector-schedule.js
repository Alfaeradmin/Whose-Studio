'use strict';
// Server-to-server Vercel Cron: process Kiot webhook inbox each minute.
// Cron retries leave the event durable in Supabase until acknowledged.
const {timingSafeEqual}=require('node:crypto');
const {getConfig}=require('../lib/kiot-inbox-store');
const {handleOnce}=require('../lib/kiot-inbox-worker');
function authorized(header,secret){
 if(typeof header!=='string'||typeof secret!=='string'||secret.length<32)return false;
 const expected=Buffer.from('Bearer '+secret),got=Buffer.from(header);
 return expected.length===got.length&&timingSafeEqual(got,expected);
}
module.exports=async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET')return res.status(405).json({error:'GET_ONLY'});
 if(!authorized(req.headers?.authorization,process.env.CRON_SECRET))
  return res.status(401).json({error:'UNAUTHORIZED'});
 if(!getConfig())return res.status(503).json({error:'CONNECTOR_NOT_CONFIGURED'});
 try{
  let processed=0,retry=0,claimed=0;
  for(let n=0;n<2;n++){
   const r=await handleOnce();
   processed+=r.processed;retry+=r.retry;claimed+=r.claimed;
   if(!r.claimed||r.retry)break;
  }
  return res.status(200).json({ok:true,claimed,processed,retry,mode:'kiot_read_only'});
 }catch(e){
  console.warn('[whose/connector-schedule]',e?.message?.slice(0,64)||'UNKNOWN');
  return res.status(503).json({error:'CONNECTOR_SCHEDULE_FAILED'});
 }
};
module.exports.authorized=authorized;
