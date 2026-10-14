'use strict';
(()=>{
const root=document.getElementById('wsProductInspector');
const body=document.getElementById('wsProductInspectorBody');
const name=document.getElementById('wsProductInspectorName');
const $=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=String(text);return n};
const field=(label,value)=>{const d=$('div','wpi-field');d.append($('span','wpi-label',label),$('strong','',value==null||value===''?'Chưa có dữ liệu':String(value)));return d};
const price=v=>typeof v==='number'&&Number.isFinite(v)?v.toLocaleString('vi-VN')+' ₫':null;
const date=v=>{if(!v)return null;const t=new Date(v);return Number.isNaN(t.getTime())?String(v):t.toLocaleString('vi-VN')};
async function loadInventory(p,container){
 container.textContent='Đang đọc tồn kho từ KiotViet…';
 try{
  let token=await window.whoseAccessToken?.();if(!token)throw new Error('Phiên đăng nhập hết hạn');
  const r=await fetch('/api/product-insights?productId='+encodeURIComponent(p.id),{headers:{Authorization:'Bearer '+token},cache:'no-store'});
  const d=await r.json();if(!r.ok)throw new Error(d.error||'Không thể đọc tồn kho');
  container.replaceChildren();
  if(!d.found){container.append($('p','wpi-note','Không xác minh được bản ghi tồn kho theo SKU này.'));return}
  if(!d.inventory.length){container.append($('p','wpi-note','KiotViet chưa trả về tồn kho chi nhánh cho SKU này.'));return}
  const max=Math.max(1,...d.inventory.map(x=>Math.max(0,x.onHand||0)));
  for(const row of d.inventory){const item=$('div','wpi-stock-row');const top=$('div','wpi-stock-head');top.append($('strong','',row.branchName||('Chi nhánh '+(row.branchId??'—'))),$('span','',row.onHand==null?'Chưa có số tồn':row.onHand.toLocaleString('vi-VN')+' sản phẩm'));item.append(top);const track=$('div','wpi-stock-track'),fill=$('div','wpi-stock-fill');fill.style.width=Math.max(0,(Number(row.onHand)||0)/max*100)+'%';track.append(fill);item.append(track);item.append($('small','',row.reserved==null?'Tồn giữ chỗ: chưa có dữ liệu':'Tồn giữ chỗ: '+row.reserved.toLocaleString('vi-VN')));container.append(item)}
  container.append($('p','wpi-note','Biểu đồ thể hiện snapshot tồn theo chi nhánh tại thời điểm đọc; không phải biến động theo thời gian.'));
 }catch(e){container.replaceChildren($('p','wpi-note',e.message))}
}
function show(p){
 body.replaceChildren();name.textContent=p.name||p.sku||'Sản phẩm';
 const meta=p.metadata||{};
 const images=Array.isArray(p.images)&&p.images.length?p.images:meta.images||[];
 const hero=$('div','wpi-gallery');
 if(images.length){images.filter(x=>typeof x==='string'&&x.startsWith('https://')).slice(0,8).forEach(url=>{const img=$('img');img.src=url;img.alt=p.name||'Ảnh sản phẩm';img.loading='lazy';img.referrerPolicy='no-referrer';img.onerror=()=>img.remove();hero.append(img)})}
 else if(p.imageUrl){const img=$('img');img.src=p.imageUrl;img.alt=p.name||'Ảnh sản phẩm';hero.append(img)}
 if(!hero.childNodes.length)hero.append($('div','wpi-empty','KiotViet chưa cung cấp hình ảnh'));
 body.append(hero);
 const primary=$('section','wpi-section');primary.append($('h3','','Thông tin cơ bản'));
 const fields=$('div','wpi-fields');
 [['Mã SKU',p.sku],['Barcode',p.barcode??meta.barcode],['Mã KiotViet',p.id],['Danh mục',p.category??meta.category],['Thương hiệu',p.brand??meta.brand],['Đơn vị',p.unit??meta.unit],['Giá bán cơ bản',price(p.basePrice??meta.basePrice)],['Trạng thái',p.active===false||meta.sourceActive===false?'Ngừng hoạt động':p.active===true?'Đang hoạt động':'Chưa xác định']].forEach(([a,b])=>fields.append(field(a,b)));
 primary.append(fields);body.append(primary);
 const attrs=Array.isArray(p.attributes)?p.attributes:Array.isArray(meta.attributes)?meta.attributes:[];
 const section=$('section','wpi-section');section.append($('h3','','Thuộc tính / biến thể'));
 if(attrs.length){const grid=$('div','wpi-fields');attrs.forEach(x=>grid.append(field(x.name,x.value)));section.append(grid)}
 else section.append($('p','wpi-note','Nguồn dữ liệu chưa có thuộc tính biến thể cho sản phẩm này.'));
 body.append(section);
 const tabs=$('section','wpi-section');tabs.append($('h3','','Tồn kho · Bán hàng · Xuất nhập tồn'));
 const controls=$('div','wpi-tabs');const panel=$('div','wpi-tab-content');
 const views=[['stock','Tồn kho'],['location','Location'],['ledger','Thẻ kho / XNT'],['sales','Bán hàng']];
 views.forEach(([key,title],i)=>{const b=$('button','wpi-tab',title);b.type='button';b.onclick=()=>{[...controls.children].forEach(x=>x.classList.remove('active'));b.classList.add('active');panel.replaceChildren();if(key==='stock')loadInventory(p,panel);else if(key==='location')panel.append($('p','wpi-note','Whose chưa có dữ liệu location vật lý được đồng bộ từ KiotViet. Không thể suy ra location từ tồn theo chi nhánh.'));else if(key==='ledger')panel.append($('p','wpi-note','Chưa có sổ cái giao dịch theo SKU đầy đủ và số đầu kỳ xác minh. Cần đồng bộ các giao dịch nhập, chuyển, bán, trả và điều chỉnh trước khi tính xuất–nhập–tồn.'));else panel.append($('p','wpi-note','Chưa có lịch sử hóa đơn đã đối soát theo SKU và thời gian. Biểu đồ doanh số sẽ hiển thị khi có nguồn giao dịch xác minh.'));};controls.append(b);if(i===0)queueMicrotask(()=>b.click())});tabs.append(controls,panel);body.append(tabs);
 const sync=$('section','wpi-section');sync.append($('h3','','Dấu vết dữ liệu'));
 const grid2=$('div','wpi-fields');
 grid2.append(field('Nguồn','KiotViet'),field('Đồng bộ về Whose',date(p.syncedAt)),field('Cập nhật tại nguồn',date(p.sourceModifiedAt??meta.sourceModifiedAt)));
 sync.append(grid2,$('p','wpi-note','Hồ sơ chỉ đọc. Tồn kho theo chi nhánh, lịch sử bán và lịch sử biến động cần nguồn API tương ứng; không suy diễn từ danh mục sản phẩm.'));body.append(sync);
 root.hidden=false;document.body.classList.add('wpi-open');document.getElementById('wsProductInspectorClose').focus();
}
function close(){root.hidden=true;document.body.classList.remove('wpi-open')}
window.whoseProductDetail=show;
document.getElementById('wsProductInspectorClose').onclick=close;
document.getElementById('wsProductInspectorBackdrop').onclick=close;
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!root.hidden)close()});
})();
