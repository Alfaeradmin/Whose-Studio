/* Whose KiotViet audit timeline — historical observations, not inferred source attribution. */
(()=>{
'use strict';
const el=id=>document.getElementById(id);
const clean=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','&#39;':'&#39;'}[c]));
const qty=value=>value==null?'—':Number(value).toLocaleString('vi-VN');
let kind='stock',page=0,loadSeq=0;
function build(){
 const inventory=el('inventory');if(!inventory||el('kiotHistoryPanel'))return;
 const panel=document.createElement('section');panel.id='kiotHistoryPanel';panel.className='card card-pad ws-audit-panel';
 panel.innerHTML='<div class="section-head"><div><h2>Sổ lịch sử KiotViet</h2><p>Biến động tồn đã quan sát và chứng từ nguồn được lưu độc lập, không tự gán nguyên nhân.</p></div></div>'+
 '<div class="ws-audit-toolbar"><button type="button" data-audit-kind="stock">Biến động tồn</button>'+
 '<button type="button" data-audit-kind="documents">Chứng từ KiotViet</button>'+
 '<input id="kiotHistoryQuery" type="search" placeholder="SKU / mã chứng từ" aria-label="Tìm lịch sử">'+
 '<button type="button" id="kiotHistoryRefresh">Làm mới</button></div>'+
 '<div id="kiotHistoryMessage" role="status" aria-live="polite"></div>'+
 '<div class="table-wrap"><table class="table"><thead id="kiotHistoryHead"></thead><tbody id="kiotHistoryRows"></tbody></table></div>'+
 '<div class="ws-audit-toolbar"><button type="button" id="kiotHistoryPrev">Trước</button>'+
 '<span id="kiotHistoryPage"></span><button type="button" id="kiotHistoryNext">Sau</button></div>';
 inventory.appendChild(panel);
 panel.querySelectorAll('[data-audit-kind]').forEach(btn=>btn.addEventListener('click',()=>{
  kind=btn.dataset.auditKind;page=0;fetchPage();
 }));
 el('kiotHistoryRefresh').addEventListener('click',()=>fetchPage());
 el('kiotHistoryQuery').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();page=0;fetchPage();}});
 el('kiotHistoryPrev').addEventListener('click',()=>{page=Math.max(0,page-1);fetchPage()});
 el('kiotHistoryNext').addEventListener('click',()=>{page++;fetchPage()});
 const observer=new MutationObserver(()=>{if(inventory.classList.contains('active')&&panel.dataset.loaded!=='yes'){
  panel.dataset.loaded='yes';fetchPage();
 }});
 observer.observe(inventory,{attributes:true,attributeFilter:['class']});
 if(inventory.classList.contains('active'))fetchPage();
 const poll=setInterval(()=>{if(!document.hidden&&inventory.classList.contains('active'))fetchPage(true)},30000);
 window.addEventListener('pagehide',()=>clearInterval(poll),{once:true});
}
async function fetchPage(silent=false){
 const seq=++loadSeq;
 const message=el('kiotHistoryMessage'),body=el('kiotHistoryRows');
 if(!message||!body)return;
 if(!silent)message.textContent='Đang đọc lịch sử…';
 const branch=el('whoseInventoryBranch')?.value||'';
 const params=new URLSearchParams({type:kind,page:String(page),q:el('kiotHistoryQuery').value.trim(),branch});
 try{
  const r=await authorizedFetch('/api/kiot-history?'+params,{cache:'no-store'});
  if(seq!==loadSeq)return;
  if(!r.ok)throw Error('Không thể đọc sổ lịch sử');
  const data=await r.json();
  if(seq!==loadSeq)return;
  const rows=Array.isArray(data.rows)?data.rows:[];
  const asDate=x=>x?new Date(x).toLocaleString('vi-VN'):'—';
  if(kind==='stock'){
   el('kiotHistoryHead').innerHTML='<tr><th>Thời điểm nhận</th><th>Chi nhánh / SKU</th><th>Trước → Sau</th><th>Chênh lệch</th><th>Chứng từ nguồn</th></tr>';
   body.innerHTML=rows.map(x=>'<tr><td>'+clean(asDate(x.recorded_at))+'</td><td><strong>'+clean(x.sku)+'</strong><div class="muted">'+clean(x.branch_name)+'</div></td>'+
    '<td>'+qty(x.before_on_hand)+' → '+qty(x.after_on_hand)+'</td><td>'+qty(x.delta_on_hand)+'</td>'+
    '<td>'+clean(x.document_ref||'Chưa xác định trên API')+'</td></tr>').join('');
  }else{
   el('kiotHistoryHead').innerHTML='<tr><th>Ghi nhận</th><th>Chi nhánh</th><th>Loại</th><th>Mã / ID chứng từ</th><th>Trạng thái</th></tr>';
   body.innerHTML=rows.map(x=>'<tr><td>'+clean(asDate(x.captured_at))+'</td><td>'+clean(x.branch_name||'Chưa ánh xạ')+'</td>'+
   '<td>'+clean(x.domain)+'</td><td><strong>'+clean(x.code||x.kiot_document_id)+'</strong></td><td>'+clean(x.source_status)+'</td></tr>').join('');
  }
  if(!rows.length)body.innerHTML='<tr><td colspan="5">Chưa có sự kiện hoặc chứng từ phù hợp được ghi nhận. Snapshot tồn ban đầu không được suy diễn thành giao dịch.</td></tr>';
  const total=Number(data.total||0);
  el('kiotHistoryPage').textContent=(page+1)+' · '+qty(total)+' kết quả';
  el('kiotHistoryPrev').disabled=page===0;
  el('kiotHistoryNext').disabled=(page+1)*50>=total;
  panelLoaded();
  message.textContent=rows.length?'Dữ liệu chứng từ và biến động tồn được lưu riêng; chưa có chứng từ xác nhận thì hiển thị chưa xác định.':'';
 }catch(e){if(seq===loadSeq)message.textContent='Không thể tải lịch sử. Vui lòng thử lại.';}
}
function panelLoaded(){const panel=el('kiotHistoryPanel');if(panel)panel.dataset.loaded='yes'}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',build);else build();
})();