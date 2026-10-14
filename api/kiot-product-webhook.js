// KiotViet Retail webhook: fail closed until preview secret and Whose connector key configured.
const crypto=require('node:crypto');
const {safeRead}=require('../lib/kiotviet');
const {normalizeProduct}=require('../lib/whose-product-catalog');
const {rest}=require('../lib/whose-backend');
const MAX_BYTES=256*1024;
async function raw(req){let size=0,chunks=[];for await(const c of req){size+=c.length;if(size>MAX_BYTES)throw Error('too large');chunks.push(c)}return Buffer.concat(chunks)}
function validHmac(body,signature,secret){
 const hash=crypto.createHmac('sha256',secret).update(body).digest();
 const values=[hash.toString('hex'),hash.toString('base64'),'sha256='+hash.toString('hex')];
 return values.some(v=>{const a=Buffer.from(v),b=Buffer.from(String(signature||''));return a.length===b.length&&crypto.timingSafeEqual(a,b)});
}
module.exports=async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST')return res.status(405).json({error:'POST only'});
 const base64=process.env.KIOTVIET_WEBHOOK_SECRET_BASE64;
 const service=process.env.WHOSE_CONNECTOR_SERVICE_ROLE_KEY;
 if(!base64||!service)return res.status(503).json({error:'Webhook configuration incomplete'});
 const secret=Buffer.from(base64,'base64');
 if(secret.length<8)return res.status(503).json({error:'Webhook secret invalid'});
 let bytes;try{bytes=await raw(req)}catch{return res.status(413).json({error:'Webhook too large'})}
 if(!validHmac(bytes,req.headers['x-hub-signature'],secret))return res.status(401).json({error:'Invalid signature'});
 let data;try{data=JSON.parse(bytes.toString('utf8'))}catch{return res.status(400).json({error:'Invalid JSON'})}
 const notices=Array.isArray(data.Notifications)?data.Notifications:[];
 const ids=new Set();
 for(const n of notices){
  if(!/product\.(update|create)/i.test(String(n.Action||'')))continue;
  for(const p of Array.isArray(n.Data)?n.Data:[]){const id=Number(p.Id??p.id);if(Number.isSafeInteger(id)&&id>0)ids.add(id)}
 }
 if(ids.size>25)return res.status(422).json({error:'Too many changed products'});
 if(ids.size===0)return res.status(200).json({accepted:true,changed:0});
 let saved=0;
 for(const id of ids){
  const result=await safeRead('products',{id,pageSize:1,currentItem:0});
  if(!result.ok)return res.status(503).json({error:'KiotViet read unavailable'});
  const match=(result.data?.data||[]).find(p=>Number(p.id)===id);
  if(!match)return res.status(503).json({error:'Changed product not yet readable'});
  let row;try{row=normalizeProduct(match)}catch{return res.status(503).json({error:'Unusable Kiot product payload'})}
  const synced=await rest('rpc/whose_sync_kiot_product_page',{method:'POST',bearer:'Bearer '+service,body:{p_rows:[row]}});
  if(!synced.ok||synced.data?.stored!==1)return res.status(503).json({error:'Whose write unavailable'});
  saved++;
 }
 return res.status(200).json({accepted:true,changed:saved});
};
module.exports.config={api:{bodyParser:false}};
