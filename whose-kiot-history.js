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

 '<div class="section-head"><div><h3>Truy chứng từ trực tiếp từ KiotViet</h3><p>Đọc chứng từ gốc theo từng trang 8 phiếu. Chỉ hiển thị dòng có SKU; không coi số lượng trong chứng từ là biến động tồn.</p></div></div>'+
 '<div class="ws-audit-toolbar"><label for="kiotTraceDomain">Loại chứng từ</label>'+
 '<select id="kiotTraceDomain"><option value="invoices">Hóa đơn bán</option><option value="orders">Đặt hàng</option>'+
 '<option value="purchaseorders">Nhập hàng</option><option value="transfers">Chuyển hàng</option>'+
 '<option value="returns">Trả hàng</option></select>'+
 '<button type="button" id="kiotTraceStart">Đọc trang đầu</button>'+
 '<button type="button" id="kiotTraceNext" disabled>Đọc trang tiếp</button></div>'+
 '<div id="kiotTraceMessage" role="status" aria-live="polite"></div>'+
 '<div class="table-wrap" id="kiotTraceTableWrap" hidden style="max-height:360px;overflow:auto"><table class="table"><thead><tr>'+
 '<th>Thời điểm</th><th>Chứng từ</th><th>Chi nhánh</th><th>SL dòng</th><th>SL nhận</th><th>Trạng thái</th></tr></thead>'+
 '<tbody id="kiotTraceRows"></tbody></table></div>'+

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
 el('kiotTraceStart').addEventListener('click',()=>scanTrace(true));
 el('kiotTraceNext').addEventListener('click',()=>scanTrace(false));
 el('kiotTraceDomain').addEventListener('change',()=>{
  tracePage=0;traceCriteria='';el('kiotTraceNext').disabled=true;
  el('kiotTraceTableWrap').hidden=true;el('kiotTraceMessage').textContent='';
 });
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

let tracePage=0,traceCriteria='',traceRequest=0;
async function scanTrace(reset){
 const sku=(el('kiotLiveSku')?.value||el('kiotHistoryQuery')?.value||'').trim().toUpperCase();
 const domain=el('kiotTraceDomain')?.value||'';
 const info=el('kiotTraceMessage'),next=el('kiotTraceNext'),start=el('kiotTraceStart');
 const body=el('kiotTraceRows'),wrap=el('kiotTraceTableWrap');
 if(!/^[A-Z0-9][A-Z0-9._-]{0,59}$/.test(sku)){
  info.textContent='Nhập SKU tại ô Tra soát tồn trực tiếp trước khi truy chứng từ.';return;
 }
 const criterion=sku+':'+domain;
 if(reset||criterion!==traceCriteria){tracePage=0;traceCriteria=criterion;}
 const page=tracePage,requestId=++traceRequest;
 start.disabled=true;next.disabled=true;info.textContent='Đang đọc chứng từ KiotViet trang '+(page+1)+'…';
 wrap.hidden=true;body.replaceChildren();
 try{
  const response=await authorizedFetch('/api/kiot-document-trace?'+new URLSearchParams({
   sku,domain,page:String(page)
  }),{cache:'no-store'});
  if(!response.ok){
   if(response.status===403)throw Error('Chỉ quản trị toàn hệ thống được tra cứu chứng từ gốc.');
   if(response.status===401)throw Error('Cần đăng nhập lại Whose Studio.');
   throw Error('KiotViet chưa trả đủ chứng từ (HTTP '+response.status+'). Không kết luận không có giao dịch.');
  }
  const data=await response.json();
  if(requestId!==traceRequest)return;
  for(const doc of data.matchedDocuments||[]){
   for(const line of doc.lines||[]){
    const tr=document.createElement('tr');
    const when=doc.time?new Date(doc.time).toLocaleString('vi-VN'):'Chưa có';
    const branch=doc.fromBranchId&&doc.toBranchId?
      doc.fromBranchId+' → '+doc.toBranchId:doc.branchId||'Không rõ';
    for(const value of [when,doc.code||doc.id,branch,
       qty(line.quantity),qty(line.receivedQuantity),doc.status]){
     const cell=document.createElement('td');cell.textContent=String(value??'—');tr.appendChild(cell);
    }
    body.appendChild(tr);
   }
  }
  if(!body.children.length){
   const tr=document.createElement('tr'),cell=document.createElement('td');cell.colSpan=6;
   cell.textContent='Không tìm thấy SKU trong '+data.checkedDocuments+
    ' chứng từ của trang này; có thể còn ở các trang khác.';
   tr.appendChild(cell);body.appendChild(tr);
  }
  wrap.hidden=false;
  info.textContent='Kiểm tra '+data.checkedDocuments+' chứng từ trên trang '+(page+1)+
    ' / tổng '+qty(data.totalDocuments)+' chứng từ thuộc loại đã chọn. Tìm thấy '+
    (data.matchedDocuments||[]).length+' chứng từ chứa SKU. '+
    (data.hasMore?'Còn trang chưa kiểm tra.':'Đã tới cuối danh sách loại chứng từ này.')+
    ' Đây là nội dung chứng từ, không xác nhận tác động tồn.';
  if(data.hasMore){tracePage=page+1;next.disabled=false;}
  else{tracePage=page;next.disabled=true;}
 }catch(e){
  if(requestId===traceRequest)info.textContent=e.message||'Không thể truy chứng từ.';
  tracePage=page;next.disabled=false;
 }finally{if(requestId===traceRequest){start.disabled=false;}}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',build);else build();
})();