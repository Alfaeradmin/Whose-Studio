// Whose Studio product sync. KiotViet is strictly read-only.
// Only verified server-fetched products may be persisted in Whose Supabase.
// No credentials, user-submitted product rows or inventory writes are accepted.
const { validateStaffBearer,verifyOrigin }=require('../lib/whose-auth');
const { rest,accessToken }=require('../lib/whose-backend');
const { safeRead }=require('../lib/kiotviet');
const { PAGE_SIZE,MAX_PAGE,parseProductPage,publicCatalogRow }=require('../lib/whose-product-catalog');
function pageIndex(value){
  if(typeof value!=='string'||!/^(0|[1-9][0-9]{0,3})$/.test(value))return null;
  const n=Number(value);return n<=MAX_PAGE?n:null;
}
async function readVerifiedKiotPage(page){
  const result=await safeRead('products',{pageSize:PAGE_SIZE,currentItem:page*PAGE_SIZE});
  if(!result.ok){
    const http=/^KiotViet GET \/products failed \((\d{3})\)$/.exec(result.error||'');
    const token=/^KiotViet token failed \((\d{3})\):/.exec(result.error||'');
    const code=http?Number(http[1]):token?Number(token[1]):null;
    const e=new Error('KiotViet product read failed');
    e.upstreamStatus=code;throw e;
  }
  return parseProductPage(result.data,page);
}
module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','private, no-store, max-age=0');
  if(req.method!=='GET'&&req.method!=='POST')
    return res.status(405).json({error:'GET or POST only'});
  const bearer=accessToken(req);
  const staff=await validateStaffBearer(bearer);
  if(!staff.ok)return res.status(staff.status).json({error:'Whose staff login required'});
  const q=req.query||{};
  if(req.method==='GET'&&q.view==='catalog'){
    const page=pageIndex(String(q.page??'0'));
    if(page===null)return res.status(400).json({error:'Invalid page'});
    const cleanQuery=typeof q.q==='string'
      ?q.q.normalize('NFC').replace(/[^\p{L}\p{N} _.-]/gu,'').trim().slice(0,64):'';
    const params=new URLSearchParams();
    params.set('select','kiot_product_id,sku,name,attributes,is_active,synced_at');
    params.set('order','sku.asc');
    params.set('offset',String(page*48));
    params.set('limit','49');
    if(cleanQuery)params.set('or','(sku.ilike.*'+cleanQuery+'*,name.ilike.*'+cleanQuery+'*)');
    if(q.images==='with')params.set('attributes->kiotviet->>thumbnail','not.is.null');
    else if(q.images==='without')params.set('attributes->kiotviet->>thumbnail','is.null');
    const [rows,stats]=await Promise.all([
      rest('whose_products?'+params,{bearer}),
      rest('rpc/whose_kiot_product_catalog_stats',{method:'POST',bearer,body:{}})
    ]);
    if(!rows.ok||!Array.isArray(rows.data)||!stats.ok)
      return res.status(502).json({error:'Unable to read Whose catalog'});
    return res.status(200).json({
      source:'Whose',page,pageSize:48,query:cleanQuery,
      hasMore:rows.data.length>48,
      rows:rows.data.slice(0,48).map(publicCatalogRow),
      stats:stats.data
    });
  }
  if((req.method==='GET'&&q.view!=='preview')||(req.method==='POST'&&!verifyOrigin(req)))
    return res.status(400).json({error:'Unsupported operation or origin'});
  if(staff.is_global_admin!==true)
    return res.status(403).json({error:'Only Whose Global Admin may preview or sync KiotViet products'});
  const page=pageIndex(String(req.method==='GET'?q.page??'0':req.body?.page??''));
  if(page===null)return res.status(400).json({error:'Invalid product page'});
  if(req.method==='POST'){
    if(Number(req.headers?.['content-length']||0)>512)return res.status(413).json({error:'Request too large'});
    if(!req.body||typeof req.body!=='object'||Array.isArray(req.body)||
       Object.keys(req.body).some(key=>key!=='page'))return res.status(400).json({error:'Only page index is accepted'});
  }
  let preview;
  try{preview=await readVerifiedKiotPage(page);}
  catch(err){
    const http=Number.isInteger(err.upstreamStatus)?err.upstreamStatus:null;
    const isBadSource=/Kiot product|pagination|Duplicate product|Missing Kiot/i.test(err.message);
    const code=isBadSource?'KIOT_PRODUCT_DATA_INCOMPLETE':'KIOT_PRODUCT_READ_FAILED';
    console.warn('[Whose/Kiot/products]',code,'page',page,'upstreamStatus',http||'unknown');
    return res.status(502).json({code,upstreamStatus:http,
      error:isBadSource?'KiotViet returned an invalid or incomplete page. No products were stored.':
        'KiotViet product endpoint did not respond successfully. No products were stored.'});
  }
  if(req.method==='GET'){
    return res.status(200).json(preview);
  }
  if(preview.rows.length===0){
    return res.status(200).json({page,total:preview.total,received:0,created:0,updated:0,stored:0,hasMore:false});
  }
  // Server-fetched and verified only. No client-supplied catalog or stock data.
  const sync=await rest('rpc/whose_sync_kiot_product_page',{
    method:'POST',bearer,body:{p_rows:preview.rows}
  });
  if(!sync.ok||sync.data?.stored!==preview.rows.length){
    console.warn('[Whose/Kiot/products] Whose import rejected page',page,'status',sync.status);
    return res.status(409).json({code:'WHOSE_PRODUCT_SYNC_REJECTED',
      error:'Whose database rejected this verified product page. No completion reported.',
      page});
  }
  return res.status(200).json({page,total:preview.total,
    received:sync.data.received,created:sync.data.created,
    updated:sync.data.updated,stored:sync.data.stored,
    hasMore:preview.hasMore});
};
