'use strict';
// Opt-in endpoint: requires configured webhook signing secret and private database
// credential. Raw bytes are verified before parsing; return 2xx only after durable commit.
const {parseVerifiedKiotWebhook}=require('../lib/kiot-webhook-signature');
const {notificationHints}=require('../lib/kiot-webhook-hints');
const {persistVerifiedHints}=require('../lib/kiot-inbox-store');
module.exports.config={api:{bodyParser:false}};
async function readRaw(req,max=1048576){
 const parts=[];let length=0;
 for await(const part of req){
  const chunk=Buffer.isBuffer(part)?part:Buffer.from(part);
  length+=chunk.length;
  if(length>max)throw new Error('PAYLOAD_TOO_LARGE');
  parts.push(chunk);
 }
 return Buffer.concat(parts,length);
}
async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST')return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
 const secret=process.env.KIOTVIET_WEBHOOK_SECRET_BASE64;
 const retailer=process.env.KIOTVIET_RETAILER;
 if(!secret||!retailer)return res.status(503).json({error:'WEBHOOK_NOT_CONFIGURED'});
 let raw,payload,hints;
 try{
  raw=await readRaw(req);
  payload=parseVerifiedKiotWebhook(raw,req.headers['x-hub-signature'],secret);
 }catch(e){
  return res.status(e.message==='PAYLOAD_TOO_LARGE'?413:401).json({error:'INVALID_WEBHOOK'});
 }
 try{
  hints=notificationHints(payload,retailer);
  // Unknown/unsupported event structures are not acknowledged as delivered.
  if(hints.length===0)return res.status(422).json({error:'NO_SUPPORTED_NOTIFICATIONS'});
 }catch{
  return res.status(422).json({error:'INVALID_NOTIFICATION'});
 }
 try{
  const stored=await persistVerifiedHints(hints);
  return res.status(200).json({ok:true,received:stored.received,duplicates:stored.duplicates});
 }catch{
  // A non-2xx response permits provider retry and avoids lost events.
  return res.status(503).json({error:'INBOX_UNAVAILABLE'});
 }
}
module.exports=handler;
module.exports.readRaw=readRaw;
