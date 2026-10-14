'use strict';
(()=>{
const root=document.getElementById('wsProductInspector');
const body=document.getElementById('wsProductInspectorBody');
const name=document.getElementById('wsProductInspectorName');
const $=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=String(text);return n};
const field=(label,value)=>{const d=$('div','wpi-field');d.append($('span','wpi-label',label),$('strong','',value==null||value===''?'Chưa có dữ liệu':String(value)));return d};
const price=v=>typeof v==='number'&&Number.isFinite(v)?v.toLocaleString('vi-VN')+' ₫':null;
const date=v=>{if(!v)return null;const t=new Date(v);return Number.isNaN(t.getTime())?String(v):t.toLocaleString('vi-VN')};
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
