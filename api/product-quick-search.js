'use strict';
// Dedicated low-latency search for calling chat. Uses Whose synchronized catalog only.
const {accessToken,rest}=require('../lib/whose-backend');
const {validateStaffBearer}=require('../lib/whose-auth');
const {safeImageUrl}=require('../lib/whose-product-catalog');
module.exports=async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store');
 if(req.method!=='GET')return res.status(405).json({error:'GET only'});
 const staff=await validateStaffBearer(accessToken(req));
 if(!staff.ok)return res.status(staff.status||401).json({error:'Staff login required'});
 const raw=req.query?.q;
 if(typeof raw!=='string'||raw.length>120)return res.status(400).json({error:'Invalid search term'});
 const q=raw.normalize('NFC').trim();
 if(!q)return res.status(200).json({rows:[],query:'',source:'Whose catalog'});
 if(q.length>90)return res.status(400).json({error:'Search too long'});
 const limit=12;
 const found=await rest('rpc/whose_quick_find_products',{
  method:'POST',bearer:accessToken(req),
  body:{p_query:q,p_limit:limit}
 });
 if(!found.ok||!Array.isArray(found.data))return res.status(found.status===403?403:502).json({error:'Product search unavailable'});
 return res.status(200).json({
  source:'Whose catalog',query:q,
  rows:found.data.map(p=>({
   sku:p.sku,name:p.name,barcode:p.barcode||null,
   imageUrl:safeImageUrl(p.image_url),
   matchRank:p.rank
  }))
 });
};
