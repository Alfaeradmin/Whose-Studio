'use strict';
(()=>{
const root=document.getElementById('wsProductInspector');
const body=document.getElementById('wsProductInspectorBody');
const name=document.getElementById('wsProductInspectorName');
let activeProduct=null,inventoryNonce=0;
const $=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=String(text);return n};
const field=(label,value)=>{const d=$('div','wpi-field');d.append($('span','wpi-label',label),$('strong','',value==null||value===''?'Chưa có dữ liệu':String(value)));return d};
const price=v=>typeof v==='number'&&Number.isFinite(v)?v.toLocaleString('vi-VN')+' ₫':null;
const date=v=>{if(!v)return null;const t=new Date(v);return Number.isNaN(t.getTime())?String(v):t.toLocaleString('vi-VN')};
async function loadInventory(p,container){
 const branch=window.whoseWarehouse?.();const current=++inventoryNonce;
 if(!branch){container.replaceChildren($('div','wpi-empty-state','Chọn kho thao tác ở sidebar để xem tồn kho.'));return}
 container.replaceChildren($('p','wpi-note','Đang xác minh tồn kho tại KiotViet…'));
 try{
  const token=await window.whoseAccessToken?.();if(!token)throw new Error('Phiên đăng nhập đã hết hạn');
  const r=await fetch('/api/product-insights?'+new URLSearchParams({productId:String(p.id),branchId:branch.id}),{headers:{Authorization:'Bearer '+token},cache:'no-store'});
  const d=await r.json();if(!r.ok)throw new Error(d.error||'Không thể đọc tồn kho');
  if(current!==inventoryNonce||branch.id!==window.whoseWarehouse?.()?.id||root.hidden)return;
  if(d.activeBranch&&d.activeBranch.id!==branch.id)throw new Error('Dữ liệu kho trả về không đúng phạm vi thao tác');
  container.replaceChildren();
  const title=$('div','wpi-overview-heading');title.append($('h3','','Tổng quan tồn kho'),$('p','wpi-note','Nguồn: KiotViet · '+branch.name+' · Snapshot tại thời điểm đọc'));container.append(title);
  if(!d.found||!Array.isArray(d.inventory)||!d.inventory.length){container.append($('div','wpi-empty-state','Chưa xác minh được tồn kho của SKU tại '+branch.name+'. Không hiển thị số 0 khi chưa có dữ liệu.'));return}
  const rows=d.inventory;
  const verified=rows.every(x=>typeof x.onHand==='number'&&Number.isFinite(x.onHand));
  const total=verified?rows.reduce((n,x)=>n+x.onHand,0):null;
  const reserved=rows.every(x=>typeof x.reserved==='number'&&Number.isFinite(x.reserved))?rows.reduce((n,x)=>n+x.reserved,0):null;
  const kpis=$('div','wpi-kpis');
  [['Tổng tồn kho',total,'green'],['Tồn khả dụng',total!==null&&reserved!==null?total-reserved:null,'blue'],['Đang giữ',reserved,'amber'],['Số chi nhánh',rows.length,'neutral']].forEach(([label,value,color])=>{
   const card=$('div','wpi-kpi '+color);card.append($('span','',label),$('strong','',value===null?'—':Number(value).toLocaleString('vi-VN')),$('small','',value===null?'Chưa đủ dữ liệu':label==='Số chi nhánh'?'Chi nhánh có bản ghi':'Đơn vị sản phẩm'));kpis.append(card)
  });container.append(kpis);
  const section=$('section','wpi-stock-section');section.append($('h3','','Phân bổ tồn kho theo chi nhánh'));
  const max=Math.max(1,...rows.map(x=>Math.max(0,x.onHand||0)));
  for(const row of rows){const item=$('div','wpi-stock-row'),top=$('div','wpi-stock-head');top.append($('strong','',row.branchName||('Chi nhánh '+(row.branchId??'—'))),$('span','',row.onHand==null?'Chưa có số tồn':Number(row.onHand).toLocaleString('vi-VN')));item.append(top);
   const track=$('div','wpi-stock-track'),fill=$('div','wpi-stock-fill');fill.style.width=Math.max(0,(Number(row.onHand)||0)/max*100)+'%';track.append(fill);item.append(track);item.append($('small','',row.reserved==null?'Chưa có tồn giữ chỗ':'Đang giữ: '+Number(row.reserved).toLocaleString('vi-VN')));section.append(item)}
  container.append(section,$('p','wpi-note','Biểu đồ này thể hiện phân bổ tồn tại thời điểm đọc, không phải xu hướng theo ngày.'));
 }catch(e){if(current===inventoryNonce&&!root.hidden)container.replaceChildren($('div','wpi-empty-state',e.message))}
}
function show(p){
 activeProduct=p;inventoryNonce++;
 body.replaceChildren();name.textContent=p.name||p.sku||'Sản phẩm';
 const meta=p.metadata||{};
 const images=Array.isArray(p.images)&&p.images.length?p.images:meta.images||[];
 const hero=$('div','wpi-gallery');hero.classList.add('wpi-gallery-premium');
 const urls=[...new Set([...(Array.isArray(images)?images:[]),p.imageUrl,meta.thumbnail].filter(x=>typeof x==='string'&&x.startsWith('https://')))].slice(0,8);
 if(urls.length){
  const main=$('div','wpi-photo-hero'),mainImage=$('img','wpi-main-image');
  mainImage.alt=p.name||'Ảnh sản phẩm';mainImage.decoding='async';mainImage.loading='eager';
  const imageState=$('div','wpi-photo-state','Đang tải hình sản phẩm…');
  main.append(mainImage,imageState);hero.append(main);
  let activeIndex=0,requested=0;const failedImages=new Set();
  function displayImage(index){
   activeIndex=index;requested=0;imageState.textContent='Đang tải hình sản phẩm…';imageState.hidden=false;
   mainImage.hidden=false;
   // Prefer regular browser image requests; some retail CDNs block stripped referrers.
   mainImage.removeAttribute('referrerpolicy');
   mainImage.onload=()=>{imageState.hidden=true;mainImage.hidden=false};
   mainImage.onerror=()=>{
    if(requested===0){requested=1;mainImage.referrerPolicy='no-referrer';mainImage.src=urls[activeIndex];return}
    failedImages.add(activeIndex);
    const next=urls.findIndex((_,i)=>!failedImages.has(i));
    if(next!==-1){displayImage(next);return}
    mainImage.hidden=true;imageState.textContent='Hình sản phẩm tạm thời không tải được từ KiotViet.';
   };
   mainImage.src=urls[index];
  }
  if(urls.length>1){
   const thumbs=$('div','wpi-thumbnails');
   urls.forEach((url,i)=>{const btn=$('button','wpi-thumb'+(i===0?' selected':''));btn.type='button';btn.setAttribute('aria-label','Xem ảnh '+(i+1));const im=$('img');im.src=url;im.alt='Ảnh '+(i+1);im.loading='lazy';btn.append(im);
    btn.onclick=()=>{[...thumbs.children].forEach(t=>t.classList.remove('selected'));btn.classList.add('selected');displayImage(i)};thumbs.append(btn)});
   hero.append(thumbs);
  }
  displayImage(0);
 }else hero.append($('div','wpi-empty','KiotViet chưa cung cấp hình ảnh'));
 const left=$('div','wpi-left'),right=$('div','wpi-right');left.append(hero);
 const primary=$('section','wpi-section');primary.append($('h3','','Thông tin cơ bản'));
 const fields=$('div','wpi-fields');
 [['Mã SKU',p.sku],['Barcode',p.barcode??meta.barcode],['Mã KiotViet',p.id],['Danh mục',p.category??meta.category],['Thương hiệu',p.brand??meta.brand],['Đơn vị',p.unit??meta.unit],['Giá bán cơ bản',price(p.basePrice??meta.basePrice)],['Trạng thái',p.active===false||meta.sourceActive===false?'Ngừng hoạt động':p.active===true?'Đang hoạt động':'Chưa xác định']].forEach(([a,b])=>fields.append(field(a,b)));
 primary.append(fields);left.append(primary);
 const attrs=Array.isArray(p.attributes)?p.attributes:Array.isArray(meta.attributes)?meta.attributes:[];
 const section=$('section','wpi-section');section.append($('h3','','Thuộc tính / biến thể'));
 if(attrs.length){const grid=$('div','wpi-fields');attrs.forEach(x=>grid.append(field(x.name,x.value)));section.append(grid)}
 else section.append($('p','wpi-note','Nguồn dữ liệu chưa có thuộc tính biến thể cho sản phẩm này.'));
 left.append(section);
 const tabs=$('section','wpi-section');tabs.append($('h3','','Thông tin vận hành'));
 const controls=$('div','wpi-tabs');const panel=$('div','wpi-tab-content');
 const views=[['stock','Tồn kho'],['location','Location'],['ledger','Thẻ kho / XNT'],['sales','Bán hàng'],['charts','Biểu đồ']];
 views.forEach(([key,title],i)=>{const b=$('button','wpi-tab',title);b.type='button';b.onclick=()=>{[...controls.children].forEach(x=>x.classList.remove('active'));b.classList.add('active');panel.replaceChildren();if(key==='stock')loadInventory(p,panel);else if(key==='location')panel.append($('p','wpi-note','Whose chưa có dữ liệu location vật lý được đồng bộ từ KiotViet. Không thể suy ra location từ tồn theo chi nhánh.'));else if(key==='ledger')panel.append($('p','wpi-note','Chưa có sổ cái giao dịch theo SKU đầy đủ và số đầu kỳ xác minh. Cần đồng bộ các giao dịch nhập, chuyển, bán, trả và điều chỉnh trước khi tính xuất–nhập–tồn.'));else if(key==='sales')panel.append($('p','wpi-note','Chưa có lịch sử hóa đơn đã đối soát theo SKU và thời gian.'));else panel.append($('p','wpi-note','Biểu đồ biến động sẽ hiển thị khi có dữ liệu thời gian đã đối soát.'));};controls.append(b);if(i===0)queueMicrotask(()=>b.click())});tabs.append(controls,panel);right.append(tabs);
 const sync=$('section','wpi-section');sync.append($('h3','','Dấu vết dữ liệu'));
 const grid2=$('div','wpi-fields');
 grid2.append(field('Nguồn','KiotViet'),field('Đồng bộ về Whose',date(p.syncedAt)),field('Cập nhật tại nguồn',date(p.sourceModifiedAt??meta.sourceModifiedAt)));
 sync.append(grid2,$('p','wpi-note','Dữ liệu chỉ đọc; báo cáo chỉ hiện khi có giao dịch đã xác minh.'));left.append(sync);body.append(left,right);
 root.hidden=false;document.body.classList.add('wpi-open');document.getElementById('wsProductInspectorClose').focus();
}
function close(){inventoryNonce++;activeProduct=null;root.hidden=true;document.body.classList.remove('wpi-open')}
window.addEventListener('whose:warehouse-change',()=>{
 if(root.hidden||!activeProduct)return;
 const active=body.querySelector('.wpi-tab.active');
 if(active?.textContent?.trim()==='Tồn kho')active.click();
});
window.whoseProductDetail=show;
document.getElementById('wsProductInspectorClose').onclick=close;
document.getElementById('wsProductInspectorBackdrop').onclick=close;
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!root.hidden)close()});
})();
