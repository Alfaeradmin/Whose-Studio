'use strict';
// Read-only catalog suggestions from stored KiotViet product sync. Branch-scoped staff auth.
// No service-role, provider secrets, inventory adjustment or user-controlled database SQL.
const {accessToken,rest}=require('../lib/whose-backend');
const {validateStaffBearer}=require('../lib/whose-auth');
const SEARCH=/^[\p{L}\p{M}\p{N} ._\/-]{2,60}$/u;
const IMAGE_HOSTS=new Set(['cdn2-retail-images.kiotviet.vn','cdn-retail-images.kiotviet.vn']);
function productImage(attr){
 const kv=attr?.kiotviet||{};
 const raw=kv.thumbnail||kv.images?.[0]?.Image||kv.images?.[0]||null;
 if(typeof raw!=='string'||raw.length>1024)return null;
 try{const u=new URL(raw);return u.protocol==='https:'&&IMAGE_HOSTS.has(u.hostname)?u.href:null}
 catch{return null}
}
function normalize(p){
 return {id:p.id,sku:p.sku,name:p.name,image:productImage(p.attributes),
  syncedAt:p.synced_at||null,source:'whose_stored_kiot_catalog'};
}
function queryPath(q){
 if(!SEARCH.test(q))return null;
 // Avoid PostgREST filter grammar metacharacters and unbounded scans.
 const term=q.trim().replace(/\s+/g,' ');
 if(term.length<2)return null;
 const qs=new URLSearchParams({select:'id,sku,name,attributes,synced_at',
  is_active:'eq.true',or:'(sku.ilike.*'+term+'*,name.ilike.*'+term+'*)',
  order:'sku.asc',limit:'12'});
 return 'whose_products?'+qs.toString();
}
async function handler(req,res){
 res.setHeader('Cache-Control','private,no-store');
 if(req.method!=='GET')return res.status(405).json({error:'GET_ONLY'});
 const staff=await validateStaffBearer(accessToken(req));
 if(!staff.ok)return res.status(staff.status).json({error:'STAFF_AUTH_REQUIRED'});
 const branch=req.query?.branch,q=typeof req.query?.q==='string'?req.query.q.normalize('NFC'):'';
 if(typeof branch!=='string'||!staff.is_global_admin&&!staff.memberships.some(x=>x.branch_id===branch))
  return res.status(403).json({error:'BRANCH_ACCESS_DENIED'});
 const path=queryPath(q);
 if(!path)return res.status(400).json({error:'INVALID_SEARCH_QUERY'});
 const data=await rest(path,{bearer:accessToken(req)});
 if(!data.ok||!Array.isArray(data.data))return res.status(503).json({error:'PRODUCT_CATALOG_UNAVAILABLE'});
 const rows=data.data.filter(p=>p&&typeof p.sku==='string'&&typeof p.name==='string')
  .map(normalize);
 return res.status(200).json({rows,query:q,readOnly:true,source:'whose_stored_kiot_catalog',
  inventoryScope:'not_returned',hasMore:rows.length===12});
}
module.exports=handler;
module.exports._test={productImage,normalize,queryPath};
