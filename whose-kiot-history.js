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
 '<div class="section-head"><div><h3>Tra soát tồn trực tiếp KiotViet</h3><p>Đọc tồn hiện tại từ API KiotViet; chỉ dành cho quản trị toàn hệ thống. Không chỉnh sửa tồn.</p></div></div>'+
 '<div class="ws-audit-toolbar"><input type="search" id="kiotLiveSku" placeholder="Mã SKU, ví dụ SP009461" aria-label="SKU tra soát KiotViet">'+
 '<button type="button" id="kiotLiveCheck">Đọc tồn gốc KiotViet</button></div>'+
 '<div id="kiotLiveStatus" role="status" aria-live="polite"></div>'+
 '<div class="table-wrap" id="kiotLiveTableWrap" hidden><table class="table"><thead><tr><th>Chi nhánh</th><th>KiotViet hiện tại</th><th>Khách đặt</th><th>Snapshot Whose</th><th>Chênh so snapshot</th><th>Lần lưu Whose</th></tr></thead><tbody id="kiotLiveRows"></tbody></table></div>'+
 '<div class="table-wrap"><table class="table"><thead id="kiotHistoryHead"></thead><tbody id="kiotHistoryRows"></tbody></table></div>'+
 '<div class="ws-audit-toolbar"><button type="button" id="kiotHistoryPrev">Trước</button>'+
 '<span id="kiotHistoryPage"></span><button type="button" id="kiotHistoryNext">Sau</button></div>';
 inventory.appendChild(panel);
 panel.querySelectorAll('[data-audit-kind]').forEach(btn=>btn.addEventListener('click',()=>{
  kind=btn.dataset.auditKind;page=0;fetchPage();
 }));
 el('kiotHistoryRefresh').addEventListener('click',()=>fetchPage());
 el('kiotLiveCheck').addEventListener('click',verifyLiveStock);
 el('kiotLiveSku').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();verifyLiveStock()}});
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
    '<td>'+clean(x.document_ref||(Array.isArray(x.possible_documents)&&x.possible_documents.length?('Có thể liên quan: '+x.possible_documents.map(d=>d.code||d.kiot_document_id).join(', ')+' (chưa xác minh)'):'Chưa xác định trên API'))+'</td></tr>').join('');
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
async function verifyLiveStock(){
 const input=el('kiotLiveSku'),message=el('kiotLiveStatus'),wrap=el('kiotLiveTableWrap');
 const body=el('kiotLiveRows'),button=el('kiotLiveCheck');
 if(!input||!message||!body)return;
 const sku=(input.value.trim()||el('kiotHistoryQuery')?.value.trim()||'').toUpperCase();
 if(!/^[A-Z0-9][A-Z0-9._-]{0,59}$/.test(sku)){
  message.textContent='Nhập đúng một mã SKU KiotViet để tra soát.';return;
 }
 input.value=sku;
 button.disabled=true;message.textContent='Đang xác minh số tồn trực tiếp trên KiotViet…';
 wrap.hidden=true;body.replaceChildren();
 try{
  const response=await authorizedFetch('/api/kiot-live-stock-audit?'+new URLSearchParams({sku}),{cache:'no-store'});
  if(!response.ok){
   if(response.status===403)throw Error('Chỉ quản trị toàn hệ thống được tra soát trực tiếp KiotViet.');
   if(response.status===401)throw Error('Cần đăng nhập lại Whose Studio.');
   throw Error('Không đọc được tồn KiotViet hoặc dữ liệu tồn trả về chưa đầy đủ (HTTP '+response.status+').');
  }
  const result=await response.json();
  const rows=Array.isArray(result.rows)?result.rows:[];
  for(const x of rows){
   const tr=document.createElement('tr');
   const date=x.snapshotAt?new Date(x.snapshotAt).toLocaleString('vi-VN'):'—';
   for(const value of [x.branchName||x.branchId,qty(x.liveOnHand),qty(x.liveReserved),
      qty(x.snapshotOnHand),x.deltaFromSnapshot==null?'—':qty(x.deltaFromSnapshot),date]){
    const td=document.createElement('td');td.textContent=String(value??'—');tr.appendChild(td);
   }
   body.appendChild(tr);
  }
  if(!rows.length){
   const td=document.createElement('td');td.colSpan=6;
   td.textContent='API chưa trả thông tin tồn theo chi nhánh; không được tự suy ra tồn bằng 0.';
   const tr=document.createElement('tr');tr.appendChild(td);body.appendChild(tr);
  }
  wrap.hidden=false;
  const checked=result.checkedAt?new Date(result.checkedAt).toLocaleString('vi-VN'):'hiện tại';
  let text='KiotViet ('+checked+') · '+result.product?.sku+' · tổng '+rows.length+
   ' chi nhánh: '+qty(result.providerSum)+'.';
  if(result.providerReportedTotal!==null&&result.providerReportedTotal!==undefined){
   text+=' Tổng tồn riêng KiotViet trả về: '+qty(result.providerReportedTotal)+
    ' · lệch so với tổng chi nhánh: '+qty(result.providerTotalGap)+'.';
  }else{
   text+=' API chi tiết không trả thêm một trường tổng tồn độc lập để so sánh.';
  }
  if(result.snapshotStatus!=='available')text+=' Snapshot Whose chưa sẵn sàng ('+result.snapshotStatus+').';
  if(Array.isArray(result.unmatchedSnapshots)&&result.unmatchedSnapshots.length)
   text+=' Có '+result.unmatchedSnapshots.length+' snapshot Whose không xuất hiện trong danh sách chi nhánh Kiot hiện tại.';
  message.textContent=text+' Chưa thể kết luận chứng từ gây chênh lệch chỉ từ số dư.';
 }catch(e){message.textContent=e.message||'Không thể tra soát SKU này.';}
 finally{button.disabled=false;}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',build);else build();
})();