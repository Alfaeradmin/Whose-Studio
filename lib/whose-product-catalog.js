// KiotViet Retail products -> Whose read-model. Do not mirror stock.
const PAGE_SIZE=100,MAX_PAGE=4999,MAX_TOTAL=500000;
function safeImageUrl(value){
  if(typeof value!=='string'||value.length>1800)return null;
  try{
    const u=new URL(value.trim());
    if(u.protocol!=='https:'||!u.hostname||u.username||u.password||u.port) return null;
    return u.href;
  }catch{return null;}
}
function extractImages(images){
  if(!Array.isArray(images))return [];
  const out=[];
  for(const item of images){
    const raw=typeof item==='string'?item:(
      item&&typeof item==='object'&&!Array.isArray(item)?(item.Image??item.image??item.url??null):null);
    const url=safeImageUrl(raw);
    if(url&&!out.includes(url))out.push(url);
    if(out.length===8)break;
  }
  return out;
}
function checkedText(value,max=500){
  return typeof value==='string'?value.trim().slice(0,max):'';
}
function normalizeProduct(source){
  if(!source||typeof source!=='object'||Array.isArray(source))throw new Error('Invalid Kiot product item');
  const id=Number(source.id);
  const sku=checkedText(source.code,100),name=checkedText(source.fullName||source.name,500);
  if(!Number.isSafeInteger(id)||id<1||!sku||!name)throw new Error('Missing Kiot product id, SKU or name');
  const images=extractImages(source.images);
  const attr=Array.isArray(source.attributes)
    ?source.attributes.slice(0,20).map(a=>({
       name:checkedText(a?.attributeName,80),
       value:checkedText(a?.attributeValue,160)
     })).filter(x=>x.name&&x.value)
    :[];
  const price=source.basePrice==null?null:Number(source.basePrice);
  const sourceActive=typeof source.isActive==='boolean'?source.isActive:null;
  const metadata={
    images,
    thumbnail:images[0]||null,
    barcode:checkedText(source.barCode,120)||null,
    category:checkedText(source.categoryName,200)||null,
    brand:checkedText(source.tradeMarkName,160)||null,
    unit:checkedText(source.unit,80)||null,
    basePrice:Number.isFinite(price)&&price>=0?price:null,
    attributes:attr,
    sourceActive,
    sourceModifiedAt:checkedText(source.modifiedDate,80)||null
  };
  return {id,sku,name,active:sourceActive!==false,metadata};
}
function parseProductPage(raw,requestedPage){
  if(!Number.isInteger(requestedPage)||requestedPage<0||requestedPage>MAX_PAGE)throw new Error('Invalid page index');
  if(!raw||!Array.isArray(raw.data))throw new Error('Kiot product page payload is incomplete');
  const total=Number(raw.total);
  if(!Number.isSafeInteger(total)||total<0||total>MAX_TOTAL)throw new Error('Kiot product count is invalid');
  const offset=requestedPage*PAGE_SIZE;
  if(offset>total || (offset===total && total!==0))throw new Error('Product page is outside verified catalog');
  if(raw.data.length>PAGE_SIZE||raw.data.length!==Math.min(PAGE_SIZE,total-offset))
    throw new Error('Kiot product pagination is inconsistent');
  const products=raw.data.map(normalizeProduct);
  if(new Set(products.map(x=>x.id)).size!==products.length ||
     new Set(products.map(x=>x.sku)).size!==products.length)throw new Error('Duplicate product in Kiot page');
  return {source:'KiotViet',total,page:requestedPage,pageSize:PAGE_SIZE,
    hasMore:offset+products.length<total,rows:products};
}
function publicCatalogRow(p){
  const k=p?.attributes?.kiotviet||{};
  return {
    id:p.kiot_product_id,
    sku:p.sku,
    name:p.name,
    imageUrl:safeImageUrl(k.thumbnail),
    images:extractImages(k.images),
    category:k.category||null,
    brand:k.brand||null,
    barcode:k.barcode||null,
    unit:k.unit||null,
    basePrice:Number.isFinite(Number(k.basePrice))&&k.basePrice!==null?Number(k.basePrice):null,
    active:k.sourceActive??null,
    syncedAt:p.synced_at||null
  };
}
module.exports={PAGE_SIZE,MAX_PAGE,MAX_TOTAL,safeImageUrl,extractImages,normalizeProduct,parseProductPage,publicCatalogRow};
