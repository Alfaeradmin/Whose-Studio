const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {
 PAGE_SIZE,parseProductPage,normalizeProduct,extractImages,safeImageUrl,publicCatalogRow
}=require('../lib/whose-product-catalog');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const schema=read('supabase/migrations/20261012122000_whose_kiot_product_sync.sql');
const api=read('api/kiot-products.js');
const html=read('index.html');
const front=read('product-sync.js');

test('KiotViet product list images preserve real HTTPS source URLs',()=>{
 const product=normalizeProduct({id:123,code:'WH-XXL',name:'Áo Basic',
  fullName:'Áo Basic - Đen / XXL',barCode:'ABC123',categoryName:'Áo',
  basePrice:450000,isActive:true,
  images:[{Image:'https://cdn.kiotviet.vn/products/sku1.jpg'},{Image:'https://cdn.kiotviet.vn/products/sku2.jpg'}],
  attributes:[{attributeName:'Màu sắc',attributeValue:'Đen'}]});
 assert.equal(product.id,123);
 assert.equal(product.sku,'WH-XXL');
 assert.equal(product.name,'Áo Basic - Đen / XXL');
 assert.equal(product.metadata.thumbnail,'https://cdn.kiotviet.vn/products/sku1.jpg');
 assert.deepEqual(product.metadata.images,[
   'https://cdn.kiotviet.vn/products/sku1.jpg','https://cdn.kiotviet.vn/products/sku2.jpg']);
 assert.equal(product.metadata.basePrice,450000);
 assert.equal(product.metadata.attributes[0].value,'Đen');
 assert.ok(!Object.hasOwn(product.metadata,'inventories'));
});
test('image validator excludes potentially unsafe URLs and never invents image',()=>{
 assert.equal(safeImageUrl('javascript:alert(1)'),null);
 assert.equal(safeImageUrl('data:image/svg+xml,xx'),null);
 assert.equal(safeImageUrl('http://example.com/p.jpg'),null);
 assert.equal(safeImageUrl('https://user:pass@cdn.example.com/x.png'),null);
 assert.deepEqual(extractImages([{Image:'bad'},'https://a.example/x.png','https://a.example/x.png']),['https://a.example/x.png']);
 const empty=normalizeProduct({id:1,code:'SKU01',name:'No photo'});
 assert.deepEqual(empty.metadata.images,[]);
 assert.equal(empty.metadata.thumbnail,null);
 assert.equal(empty.metadata.sourceActive,null);
});
test('pages verify totals, all rows and distinct source identities',()=>{
 const list=Array.from({length:101},(_,i)=>({id:i+1,code:'SKU'+i,name:'Product '+i}));
 const first=parseProductPage({total:101,data:list.slice(0,100)},0);
 assert.equal(first.rows.length,100);
 assert.equal(first.hasMore,true);
 const second=parseProductPage({total:101,data:list.slice(100)},1);
 assert.equal(second.rows.length,1);
 assert.equal(second.hasMore,false);
 assert.equal(PAGE_SIZE,100);
 assert.throws(()=>parseProductPage({total:101,data:list.slice(0,99)},0),/pagination/);
 assert.throws(()=>parseProductPage({total:3,data:[list[0],list[0],list[1]]},0),/Duplicate/);
 assert.throws(()=>parseProductPage({total:1,data:[{id:5,name:'No SKU'}]},0),/Missing Kiot/);
});
test('Whose stored card reads image from Kiot-owned namespaced metadata',()=>{
 const row=publicCatalogRow({kiot_product_id:123,sku:'AA',name:'shirt',synced_at:'2026-10-12T00:00:00Z',
  attributes:{kiotviet:{images:['https://cdn.kiotviet.vn/a.jpg'],thumbnail:'https://cdn.kiotviet.vn/a.jpg',
  category:'Áo',basePrice:120000,sourceActive:false}}});
 assert.equal(row.imageUrl,'https://cdn.kiotviet.vn/a.jpg');
 assert.equal(row.basePrice,120000);
 assert.equal(row.active,false);
});
test('sync is admin-only, server-fetch-only and never writes inventory',()=>{
 assert.match(api,/validateStaffBearer\(bearer\)/);
 assert.match(api,/staff\.is_global_admin!==true/);
 assert.match(api,/verifyOrigin\(req\)/);
 assert.match(api,/safeRead\('products'/);
 assert.match(api,/Object\.keys\(req\.body\)\.some\(key=>key!=='page'\)/);
 assert.match(api,/rest\('rpc\/whose_sync_kiot_product_page'/);
 assert.doesNotMatch(api,/productOnHands|whose_inventory_snapshots|Bearer \+ process\.env/);
 assert.match(schema,/whose_private\.global_admin\(\)/);
 assert.match(schema,/ON CONFLICT \(kiot_product_id\) DO UPDATE/);
 assert.match(schema,/jsonb_build_object\('kiotviet'/);
 assert.match(schema,/REVOKE ALL ON FUNCTION public\.whose_sync_kiot_product_page\(jsonb\) FROM PUBLIC,anon/);
 assert.doesNotMatch(schema,/\b(?:INSERT INTO|UPDATE|DELETE FROM)\s+(?:public\.)?whose_inventory_snapshots/i);
});
test('product sync UI follows Whose UI Kit and has distinct accessible controls',()=>{
 for(const id of ['productSync','psCards','psShowWhose','psShowKiot','psSearch','psSyncAll',
   'psProgressBar','psStopSync','psPrev','psNext','psImageFilter','psStatus']){
   assert.ok(html.includes('id="'+id+'"'),'missing UI '+id);
 }
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
 assert.equal(new Set(ids).size,ids.length);
 assert.match(html,/ui-product-sync\.css/);
 assert.match(html,/product-sync\.js/);
 assert.match(front,/authorizedFetch/);
 assert.match(front,/window\.confirm/);
 assert.match(front,/ui\.stop/);
 assert.match(front,/ui\.resumePage/);
 assert.match(front,/progress\(offset,total/);
 assert.match(front,/createElement\('img'\)|node\('img'\)/);
 assert.ok(front.indexOf("previousNavigate=navigate")>=0);
});
