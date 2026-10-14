'use strict';
(()=>{
const $=id=>document.getElementById(id);
const ui={page:0,rows:[],hasMore:false,q:'',image:'all',category:'all',stats:null,source:'catalog',admin:false,loading:false,syncing:false,total:0,syncPage:0};
const clean=x=>String(x??'').toLocaleLowerCase('vi-VN');
const money=n=>typeof n==='number'&&Number.isFinite(n)?n.toLocaleString('vi-VN')+' ₫':'—';
const number=n=>Number.isFinite(Number(n))?Number(n).toLocaleString('vi-VN'):'—';
const node=(tag,cls,value)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(value!==undefined)e.textContent=String(value);return e};
function status(s,err=false){$('productsStatus').textContent=s;$('productsStatus').className='products-status'+(err?' error':'')}
function auth(){return window.whoseSession?.()||null}
async function request(url,options={}){
 let token=await window.whoseAccessToken?.();
 if(!token)throw Error('Cần đăng nhập lại');
 const r=await fetch(url,{...options,headers:{...options.headers,Authorization:'Bearer '+token},cache:'no-store'});
 const d=await r.json().catch(()=>({}));
 if(!r.ok)throw Error(d.error||('Lỗi API '+r.status));
 return d;
}
const attrList=p=>Array.isArray(p.metadata?.attributes)?p.metadata.attributes:[];
function sizeOf(p){
 const a=attrList(p).find(x=>/^(size|kích thước|cỡ)$/i.test(x.name||''));if(a)return String(a.value).trim();
 const n=String(p.name||'');const m=n.match(/(?:^|[\s(/-])(XXXL|XXL|XL|XS|S|M|L|2XL|3XL)(?=$|[\s)/-])/i);return m?m[1].toUpperCase():null;
}
function card(p){
 const box=node('article','product-card'),label=node('div','ws-product-label');
 const pic=node('div','product-picture'),src=p.imageUrl||p.metadata?.thumbnail;
 if(typeof src==='string'&&src.startsWith('https://')){
   const img=node('img');img.src=src;img.alt=p.name||'Ảnh sản phẩm';img.loading='lazy';img.referrerPolicy='no-referrer';
   img.onerror=()=>{img.remove();pic.append(node('span','product-placeholder','—'))};pic.append(img);
 }else pic.append(node('span','product-placeholder','—'));
 const name=node('div');name.append(node('div','ws-product-name',p.name||'—'),node('div','ws-product-sub',p.brand||p.metadata?.brand||'KiotViet'));
 label.append(pic,name);box.append(label);
 box.append(node('span','product-sku',p.sku||'—'));
 const category=p.category||p.metadata?.category||'Chưa phân loại';
 const wrap=node('div');wrap.append(node('span','ws-table-pill',category));box.append(wrap);
 box.append(node('span','product-price',money(p.basePrice??p.metadata?.basePrice)));
 const tags=node('div','product-tags');const size=sizeOf(p);
 if(size)tags.append(node('span','product-chip','Size '+size));else tags.append(node('span','product-chip','—'));
 box.append(tags);
 const stopped=p.active===false||p.metadata?.sourceActive===false;
 box.append(node('span','product-state',stopped?'● Ngừng bán':'● Đang bán'));
 box.tabIndex=0;box.setAttribute('role','button');box.setAttribute('aria-label','Xem chi tiết '+(p.name||p.sku));box.onclick=()=>window.whoseProductDetail?.(p);box.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();box.click()}};
 return box;
}
function render(){
 const grid=$('productsGrid');grid.replaceChildren();
 let rows=ui.rows;
 if(ui.category!=='all')rows=rows.filter(p=>(p.category||p.metadata?.category||'Chưa phân loại')===ui.category);
 if(ui.source==='kiot'){
  if(ui.q)rows=rows.filter(p=>clean(p.name+' '+p.sku).includes(clean(ui.q)));
  if(ui.image!=='all')rows=rows.filter(p=>Boolean(p.imageUrl||p.metadata?.thumbnail)===(ui.image==='with'));
 }
 if(rows.length){const f=document.createDocumentFragment();rows.forEach(p=>f.append(card(p)));grid.append(f)}
 else grid.append(node('div','products-empty',ui.loading?'Đang tải sản phẩm…':'Không có sản phẩm phù hợp trong kết quả hiện tại.'));
 $('productsPrev').disabled=ui.loading||ui.syncing||ui.page===0;
 $('productsNext').disabled=ui.loading||ui.syncing||!ui.hasMore;
 $('productsPage').textContent='Trang '+(ui.page+1);
 $('productsSync').hidden=!ui.admin;$('productsSync').disabled=ui.syncing||ui.loading;
 $('productsSync').textContent=ui.syncing?'Đang đồng bộ…':'Đồng bộ toàn bộ KiotViet';
 $('productsRefresh').disabled=ui.loading||ui.syncing;
 $('productsTotal').textContent=number(ui.stats?.total);
 $('productsPhotos').textContent=number(ui.stats?.withImages);
 $('productsLastSync').textContent=ui.stats?.lastSyncedAt?new Date(ui.stats.lastSyncedAt).toLocaleDateString('vi-VN'):'—';
}
async function load(){
 if(ui.loading||ui.syncing)return;
 ui.loading=true;render();status('Đang đọc danh mục sản phẩm…');
 try{
  const qs=new URLSearchParams({view:ui.source==='kiot'?'preview':'catalog',page:String(ui.page)});
  if(ui.source==='catalog'){if(ui.q)qs.set('q',ui.q);if(ui.image!=='all')qs.set('images',ui.image)}
  const data=await request('/api/kiot-products?'+qs);
  ui.rows=data.rows||[];ui.hasMore=!!data.hasMore;
  if(data.stats)ui.stats=data.stats;
  if(ui.source==='kiot')ui.total=data.total;
  status('Đã tải '+number(ui.rows.length)+' sản phẩm · '+(ui.source==='catalog'?'Danh mục Whose':'KiotViet trực tiếp'));
  const syncStatus=$('wsSyncStatus');if(syncStatus)syncStatus.textContent='Đã đọc dữ liệu '+(ui.source==='catalog'?'Whose':'KiotViet')+' thành công.';
 }catch(e){ui.rows=[];ui.hasMore=false;status(e.message,true);const syncStatus=$('wsSyncStatus');if(syncStatus)syncStatus.textContent='Không thể xác minh: '+e.message}
 finally{ui.loading=false;render()}
}
function categories(){
 const select=$('productsCategory'),current=select.value,values=[...new Set(ui.rows.map(p=>p.category||p.metadata?.category||'Chưa phân loại'))].sort((a,b)=>a.localeCompare(b,'vi'));
 select.replaceChildren(new Option('Tất cả danh mục','all'));values.forEach(v=>select.add(new Option(v,v)));
 select.value=values.includes(current)?current:'all';ui.category=select.value;
}
async function refresh(){await load();categories();render()}
async function syncAll(){
 if(!ui.admin||ui.syncing)return;
 if(!confirm('Đồng bộ toàn bộ sản phẩm KiotViet vào Whose? Thao tác này không chỉnh sửa KiotViet hoặc tồn kho.'))return;
 ui.syncing=true;render();
 let offset=ui.syncPage*100,total=null;
 $('productsProgress').hidden=false;
 try{
  for(let p=ui.syncPage;p<5000;p++){
   const d=await request('/api/kiot-products',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({page:p})});
   if(total===null)total=d.total;
   offset+=d.stored;ui.syncPage=p+1;
   const pct=total?Math.min(100,Math.floor(offset*100/total)):100;
   $('productsProgressBar').style.width=pct+'%';
   $('productsSyncDetail').textContent='Đã lưu '+number(offset)+' / '+number(total)+' sản phẩm (trang '+(p+1)+')';
   if(!d.hasMore){ui.syncPage=0;status('Đã đồng bộ '+number(offset)+' sản phẩm từ KiotViet.');break}
  }
 }catch(e){status('Dừng ở trang '+(ui.syncPage+1)+': '+e.message+' · Các trang trước vẫn được lưu.',true)}
 finally{ui.syncing=false;ui.source='catalog';ui.page=0;await load();categories();render()}
}
let timer;
$('productsSearch').addEventListener('input',e=>{ui.q=e.target.value.trim();clearTimeout(timer);timer=setTimeout(()=>{ui.page=0;refresh()},280)});
$('productsImage').onchange=e=>{ui.image=e.target.value;ui.page=0;refresh()};
$('productsCategory').onchange=e=>{ui.category=e.target.value;render()};
$('productsPrev').onclick=()=>{ui.page=Math.max(0,ui.page-1);refresh()};
$('productsNext').onclick=()=>{ui.page++;refresh()};
$('productsRefresh').onclick=refresh;
$('productsSync').onclick=syncAll;
$('productsSource').onchange=e=>{if(e.target.value==='kiot'&&!ui.admin){e.target.value='catalog';return}ui.source=e.target.value;ui.page=0;refresh()};
window.whoseProductsInit=async data=>{ui.admin=data?.is_global_admin===true;$('productsSource').querySelector('[value=kiot]').disabled=!ui.admin;await refresh()};
})();
