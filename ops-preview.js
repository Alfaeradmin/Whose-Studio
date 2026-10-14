/* Whose Studio messenger preview. Explicitly synthetic, no network traffic. */
(()=>{
'use strict';
const M=window.WhoseOpsDemoModel,B=window.WhoseOpsBillMatch,$=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[x]));
const statuses={queued:'Chờ kho nhận',picking:'Đang soạn',ready:'Chờ vận chuyển',in_transit:'Đang giao',delivered:'Chờ quầy nhận',completed:'Đã hoàn tất',disputed:'Chênh lệch',cancelled:'Đã hủy'};
let state;
try{const raw=sessionStorage.getItem('whose:ops-chat-preview:v3');state=raw?JSON.parse(raw):M.initial();
 if(state?.version!==3||!Array.isArray(state.calls)||!Array.isArray(state.employees))state=M.initial();
}catch{state=M.initial()}
let branch='LVS',employeeId='',adminPerspective='store',selected=null,selectedWave=new Set();
let draft=[],draftZone='MAIN',draftReason='',draftNote='',notice='';
let suggestions=[],suggestionMessage='',catalogTimer=null,catalogRequest=0,selectedBill=null,billProbe=null;
const BRANCH_IDS={LVS:'43be6d1f-64d3-4738-9683-37ec6a7d14b5',NVT:'8924b841-7b2e-4552-b55c-151a70cece96'};
const pools=()=>branch==='LVS'?[['MAIN','Kho bán hàng'],['BACK','Kho tồn']]:[['MAIN','Kho Nguyễn Văn Tráng']];
const poolLabel=(b,z)=>b==='LVS'?(z==='MAIN'?'Kho bán hàng':z==='BACK'?'Kho tồn':'Chưa xác định'):
 z==='MAIN'?'Kho Nguyễn Văn Tráng':'Chưa xác định';
function realToken(){try{
 const s=JSON.parse(sessionStorage.getItem('whose-studio-auth-v1')||'null');
 return typeof s?.access_token==='string'&&s.access_token.length>20?s.access_token:null;
}catch{return null}}
function productImage(p){
 const u=p?.image;
 if(typeof u!=='string'||!/^https:\/\/cdn(?:2)?-retail-images\.kiotviet\.vn\//.test(u))
  return '<span class="thumb empty">Chưa có ảnh</span>';
 return '<img class="thumb" src="'+esc(u)+'" loading="lazy" alt="" referrerpolicy="no-referrer">';
}
function suggestionHTML(){
 if(!suggestions.length)return '<p class="suggest-empty">'+esc(suggestionMessage||'Tìm theo tên hoặc SKU trong danh mục Whose đã đồng bộ KiotViet.')+'</p>';
 return suggestions.map(p=>'<button type="button" class="suggest-choice" data-suggestion="'+esc(p.sku)+'">'+
 productImage(p)+'<span><strong>'+esc(p.name)+'</strong><small>'+esc(p.sku)+' · KiotViet</small></span>'+
 '<span class="suggest-pick">Chọn</span></button>').join('');
}
function paintSuggest(){
 const el=$('productSuggestions');
 if(el){el.hidden=false;el.innerHTML=suggestionHTML()}
}
async function searchCatalog(raw){
 const q=String(raw||'').trim(),seq=++catalogRequest;
 if(q.length<2){suggestions=[];suggestionMessage='Nhập tối thiểu 2 ký tự';paintSuggest();return;}
 const token=realToken();
 if(!token){suggestions=[];suggestionMessage='Đăng nhập Whose trên bản Preview để tìm danh mục thật, kèm hình ảnh sản phẩm.';paintSuggest();return;}
 suggestions=[];suggestionMessage='Đang tìm sản phẩm đã đồng bộ…';paintSuggest();
 try{
  const url='/api/ops-product-search?'+new URLSearchParams({q,branch:BRANCH_IDS[branch]});
  const res=await fetch(url,{headers:{Authorization:'Bearer '+token},cache:'no-store'});
  if(!res.ok)throw Error('Không đọc được danh mục Whose (HTTP '+res.status+').');
  const json=await res.json();
  if(seq!==catalogRequest)return;
  suggestions=Array.isArray(json.rows)?json.rows:[];suggestionMessage=suggestions.length?'':'Không tìm thấy sản phẩm.';
 }catch(e){if(seq!==catalogRequest)return;suggestions=[];suggestionMessage=e.message;}
 paintSuggest();
}
const person=()=>state.employees.find(e=>e.id===employeeId);
const save=()=>{try{sessionStorage.setItem('whose:ops-chat-preview:v3',JSON.stringify(state))}catch{}};
const n=x=>Number(x).toLocaleString('vi-VN');
const stamp=x=>new Date(x).toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'});
const date=x=>new Date(x).toLocaleDateString('vi-VN');
const side=()=>person()?.duty==='admin'?adminPerspective: ['seller','receiver'].includes(person()?.duty)?'store':'warehouse';
const allowed=(duty)=>person()?.duty==='admin'||person()?.duty===duty;
const current=()=>M.visible(state,branch,employeeId).find(x=>x.id===selected);
const qty=c=>c.lines.reduce((a,l)=>a+l.requested,0);
const picked=c=>c.lines.reduce((a,l)=>a+l.picked,0);
const badge=c=>'<span class="status '+esc(c.status)+'">'+esc(statuses[c.status]||c.status)+'</span>';
const actor=id=>state.employees.find(e=>e.id===id)?.name||'Nhân viên demo';
const age=t=>{let d=Math.max(0,Math.floor((Date.now()-t)/60000));return d<1?'Vừa gửi':d<60?d+' phút':Math.floor(d/60)+' giờ'};
const warn=(text,bad=false)=>{notice=(bad?'⚠ ':'✓ ')+text;draw();};
function chooseEmployee(){
 const rows=state.employees.filter(x=>x.branch===branch&&x.active);
 if(!rows.some(x=>x.id===employeeId))employeeId=rows[0]?.id||'';
 $('employee').innerHTML=rows.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.name)+' · '+esc(M.niceDuty[x.duty])+'</option>').join('');
 $('employee').value=employeeId;
 $('viewToggleBox').hidden=person()?.duty!=='admin';
 $('viewMode').value=adminPerspective;
}
function dataList(){
 const p=person();if(!p)return [];
 const filter=$('statusFilter').value,q=$('search').value.trim().toLowerCase();
 return M.visible(state,branch,p.id).filter(c=>(filter==='all'||filter==='active'&&M.activeStatuses.has(c.status)||c.status===filter)&&
  (!q||[c.id,c.zone,c.note,M.REASONS[c.reason],...c.lines.map(x=>x.sku)].some(v=>String(v||'').toLowerCase().includes(q))));
}
function stats(){
 const calls=state.calls.filter(c=>c.branch===branch);
 const values=[
  ['Yêu cầu mới',calls.filter(c=>c.status==='queued').length],
  ['Đang soạn',calls.filter(c=>c.status==='picking').length],
  ['Chờ giao / nhận',calls.filter(c=>['ready','in_transit','delivered'].includes(c.status)).length],
  ['Đã hoàn tất',calls.filter(c=>c.status==='completed').length]
 ];
 $('stats').innerHTML=values.map(([name,num])=>'<div class="stat"><span>'+name+'</span><strong>'+n(num)+'</strong></div>').join('');
}
function list(){
 const p=person();if(!p)return;
 const view=side();
 const rows=dataList();
 $('queueHeading').textContent=view==='store'?'Cửa hàng • tin yêu cầu':'Kho • hộp thư công việc';
 $('queueSubtitle').textContent=view==='store'?'Theo dõi yêu cầu đã gửi':'Chọn yêu cầu và xử lý đúng giỏ';
 $('queueCount').textContent=n(rows.length);
 const rendered=rows.slice(0,120);
 $('orderQueue').innerHTML=rendered.map(c=>{
  const check=view==='warehouse'&&allowed('picker')&&c.status==='queued';
  return '<div class="chat-item '+(selected===c.id?'active':'')+'" tabindex="0" role="button" data-open="'+esc(c.id)+'">'+
   '<div class="item-top"><span>'+
    (check?'<input type="checkbox" class="wave-select" data-wave="'+esc(c.id)+'" aria-label="Chọn '+esc(c.id)+'" '+
      (selectedWave.has(c.id)?'checked':'')+'>':'')+
    '<strong>'+esc(c.id)+'</strong></span>'+badge(c)+'</div>'+
   '<div class="item-preview">'+esc(c.lines.map(l=>l.sku+' ×'+l.requested).join(' · '))+'</div>'+
   '<small>'+esc(M.REASONS[c.reason]||'Chưa rõ lý do')+' · '+esc(poolLabel(c.branch,c.zone))+' · '+age(c.created)+'</small></div>';
 }).join('')+(rows.length>120?'<div class="notice">Đang hiển thị 120/'+n(rows.length)+' đơn. Dùng bộ lọc để thu hẹp.</div>':'')+
 (!rows.length?'<div class="notice">Không có yêu cầu phù hợp.</div>':'');
 $('queueBottom').hidden=false;
}
function roster(){
 const all=state.employees.filter(e=>e.branch===branch);
 $('shiftRoster').innerHTML=all.map(e=>'<div class="person"><strong>'+esc(e.name)+'</strong><small>'+esc(M.niceDuty[e.duty])+
  ' · '+esc(e.zone)+(e.id===employeeId?' · bạn đang xem':'')+'</small></div>').join('');
}
function firstBubble(c){
 const fromStore=side()==='store';
 return '<div class="message-row '+(fromStore?'out':'in')+'"><div class="message-avatar">CH</div><div class="bubble">'+
  '<div class="bubble-title">Yêu cầu mượn hàng · '+esc(c.id)+'</div>'+
  '<div class="field-line"><span class="hint">Lý do mượn:</span><strong>'+esc(M.REASONS[c.reason]||'Chưa rõ')+'</strong></div>'+
  '<div class="field-line"><span class="hint">Kho thao tác:</span><strong>'+esc(poolLabel(c.branch,c.zone))+'</strong></div>'+
  '<div class="field-line">'+c.lines.map(l=>'<span class="sku-chip">'+esc(l.sku)+' ×'+n(l.requested)+'</span>').join('')+'</div>'+
  (c.note?'<p>Ghi chú: '+esc(c.note)+'</p>':'')+
  '<div class="bubble-meta">Cửa hàng · '+esc(actor(c.createdBy))+' · '+stamp(c.created)+'</div>'+
  '</div></div>';
}
function eventBubble(ev){
 const storeAction=ev.action.includes('Cửa hàng')||ev.action.includes('Nhận lệch');
 const outgoing=(side()==='store')===storeAction;
 const wh=ev.action.includes('Scan')||ev.action.includes('soạn')||ev.action.includes('giỏ')||ev.action.includes('thiếu')||
  ev.action.includes('giao')||ev.action.includes('vận chuyển')||ev.action.includes('Nhận đơn');
 return '<div class="message-row '+(outgoing?'out':'in')+'"><div class="message-avatar">'+(storeAction?'CH':'K')+
  '</div><div class="bubble"><div class="bubble-title">'+esc(ev.action)+'</div>'+
  '<div class="bubble-meta">'+esc(actor(ev.actor))+' · '+stamp(ev.at)+'</div></div></div>';
}
function invoiceSummary(c){
 if(!['delivered','completed','disputed'].includes(c.status))
  return '<div class="borrow-audit"><div class="audit-banner">Đơn chưa bàn giao xong — chưa thể đối chiếu số đã mượn với hóa đơn.</div></div>';
 if(!B)return '<div class="notice warn">Module đối soát bill chưa tải xong.</div>';
 const allocations=state.links||[],invoices=state.invoices||[];
 let lines='';
 for(const line of c.lines){
  let m;try{m=B.stats(c,line.sku,allocations)}
  catch(e){lines+='<div class="audit-line"><strong>'+esc(line.sku)+'</strong><span>Chưa đủ dữ liệu đối soát</span></div>';continue;}
  const bills=B.linkedBills(c.id,allocations,invoices).filter(x=>x.sku===line.sku);
  const status=m.stillBorrowed>0?'pending':m.confirmed>0?'matched':'returned';
  lines+='<div class="audit-line '+status+'"><div class="audit-info"><strong>'+esc(line.sku)+'</strong>'+
   '<small>Đã nhận '+n(m.issued)+' · Đã match bán '+n(m.confirmed)+' · Đã trả '+n(m.returned)+'</small>'+
   (bills.length?'<div class="bill-tags">'+bills.map(x=>
    '<button type="button" data-bill="'+esc(x.invoiceId)+'">Bill '+esc(x.code)+' · ×'+n(x.qty)+'</button>').join('')+'</div>':'')+
   '</div><div class="audit-remaining">'+
   (m.stillBorrowed>0?'<b>'+n(m.stillBorrowed)+' chưa quyết toán</b><small>Chưa thấy bill khớp → cần dò hoặc nhập trả</small>':
    '<span class="settled">Đã quyết toán</span>')+
   (m.stillBorrowed>0&&side()==='warehouse'&&(allowed('picker')||allowed('lead'))?
    '<button class="btn small outline" data-return="'+esc(line.sku)+'" data-remaining="'+m.stillBorrowed+'">Xác nhận nhập trả</button>':'')+
   '</div></div>';
 }
 const suggestions=B.candidates(state.calls,invoices,allocations);
 const pending=suggestions.candidates.filter(x=>x.callId===c.id);
 const conflicts=suggestions.ambiguous.filter(x=>x.candidateCallIds.includes(c.id));
 let proposed='';
 if(pending.length)proposed+='<div class="audit-banner">Có '+pending.length+
  ' bill ứng viên chưa được xác nhận. Không tự trừ hàng mượn cho đến khi xác minh.</div>';
 if(conflicts.length)proposed+='<div class="audit-banner warn">'+conflicts.length+
  ' bill có nhiều yêu cầu cùng SKU, phải chọn chính xác phiếu gốc.</div>';
 const real=billProbe?.call===c.id?(billProbe.message||
  (billProbe.rows||[]).map(x=>'<div class="audit-line"><b>'+esc(x.code)+'</b><span>'+
  esc(x.sku)+' ×'+n(x.qty)+' · Trạng thái nguồn: '+esc(x.statusValue||'Chưa xác thực')+
  '</span></div>').join('')+
  '<p class="mini-disclaimer">Mới đọc '+n(billProbe.scanned)+' chứng từ / trang. Chưa chứng minh đầy đủ lịch sử.</p>'):'';
 return '<details class="borrow-audit" open><summary>Chi tiết hàng mượn · Khớp bill · Nhập trả</summary>'+
  '<div class="audit-intro">Nguồn: '+esc(poolLabel(c.branch,c.zone))+
   ' · Đối chiếu theo từng dòng SKU và số lượng, không khớp cả bill theo một mã.</div>'+
  lines+proposed+
  '<div class="audit-footer"><button class="btn small subtle" type="button" data-probe="'+esc(c.lines[0].sku)+
  '">Tra cứu hóa đơn KiotViet trực tiếp</button><small>Chỉ đọc, không thay đổi tồn. Yêu cầu đăng nhập Whose Preview.</small></div>'+
  (real?'<div class="audit-live">'+real+'</div>':'')+'</details>';
}
function billCard(id){
 const invoice=(state.invoices||[]).find(x=>x.id===id);if(!invoice)return '';
 const rel=B.billToCalls(id,state.links||[]);
 return '<div class="bill-card"><div class="row"><strong>Chi tiết bill '+esc(invoice.code)+
  '</strong><button type="button" class="btn small subtle" data-closebill>Đóng</button></div>'+
  '<p>Chi nhánh '+esc(invoice.branch)+' · '+esc(poolLabel(invoice.branch,invoice.warehouse))+
  ' · '+esc(new Date(invoice.at).toLocaleString('vi-VN'))+'</p>'+
  '<div class="bill-tags">'+invoice.lines.map(l=>'<span>'+esc(l.sku)+' ×'+n(l.qty)+'</span>').join('')+'</div>'+
  '<p><b>Đã xác nhận khớp với:</b></p>'+
  (rel.length?rel.map(x=>'<button class="btn small outline" type="button" data-open="'+esc(x.callId)+'">'+
    esc(x.callId)+' · '+esc(x.sku)+' ×'+n(x.qty)+'</button>').join(' '):
   '<div class="audit-banner warn">Chưa có liên kết yêu cầu nào đã xác nhận.</div>')+
  '<p class="mini-disclaimer">Dữ liệu bill trên trang này là DEMO. Dữ liệu KiotViet thật phải được xác minh riêng.</p></div>';
}
async function checkRealBills(sku){
 const c=current(),token=realToken();
 if(!c)return;
 if(!token){billProbe={call:c.id,message:'Cần đăng nhập tài khoản Whose tại Preview để đọc hóa đơn KiotViet.'};body();return}
 const since=new Date(Math.max(Date.now()-30*86400000,c.created-60000)).toISOString();
 billProbe={call:c.id,message:'Đang đọc chứng từ nguồn KiotViet (chỉ 10 hóa đơn/trang)…'};body();
 try{
  const r=await fetch('/api/ops-bill-probe?'+new URLSearchParams({
   branch:BRANCH_IDS[c.branch],sku,since,page:'0'
  }),{headers:{Authorization:'Bearer '+token},cache:'no-store'});
  if(!r.ok)throw Error('Không thể truy vấn hóa đơn (HTTP '+r.status+').');
  const data=await r.json();
  if(current()?.id!==c.id)return;
  billProbe={call:c.id,rows:data.rows||[],scanned:data.scanned,
   message:(data.rows||[]).length?'':('Chưa tìm thấy '+sku+' trong '+data.scanned+
    ' hóa đơn vừa kiểm tra. Chưa thể kết luận chưa bán; có thể còn trang khác.')};
 }catch(e){billProbe={call:c.id,message:e.message};}
 body();
}

function body(){
 const p=person();if(!p)return;
 const c=current();
 $('roleChip').textContent=side()==='store'?'Góc nhìn cửa hàng':'Góc nhìn kho';
 if(c){
  $('detailTitle').textContent='Hội thoại '+c.id;
  $('detailSub').textContent='Cửa hàng '+branch+' ↔ Kho nội bộ • '+statuses[c.status];
  const evs=(c.events||[]).filter((e,i)=>i>0);
  $('detailContent').innerHTML='<div class="day-divider">'+date(c.created)+' · LỊCH SỬ YÊU CẦU</div>'+
   firstBubble(c)+evs.map(eventBubble).join('')+
   '<div class="timestamp">Phiếu '+esc(c.id)+' · '+esc(statuses[c.status])+' · mỗi mã thuộc một giỏ riêng</div>';
 }else{
  $('detailTitle').textContent='Cửa hàng '+branch+' ↔ Kho';
  $('detailSub').textContent='Trao đổi công việc bằng phiếu có cấu trúc';
  $('detailContent').innerHTML='<div class="empty-state"><strong>Giao tiếp như nhắn tin</strong>'+
   'Chọn một yêu cầu ở bên trái để xem toàn bộ dòng thời gian.<p>Không có ô gửi tin nhắn tự do: chỉ mã hàng, lý do mượn, ghi chú và cập nhật tiến độ.</p></div>';
 }
 if(c)$('detailContent').innerHTML+=invoiceSummary(c)+(selectedBill?billCard(selectedBill):'');
 const role=p.duty==='admin'?side()+' (admin)':M.niceDuty[p.duty];
 if(notice)$('detailContent').innerHTML+='<div class="notice '+(notice.startsWith('⚠')?'warn':'success')+'">'+esc(notice)+'</div>';
 renderComposer(c,p);
}
function storeComposer(c,p){
 if(c?.status==='delivered'&&allowed('receiver'))return receiveComposer(c);
 if(!allowed('seller')){
  if(c?.status==='delivered'&&allowed('receiver'))return receiveComposer(c);
  return '<div class="notice">Bạn được phân công vị trí <b>'+esc(M.niceDuty[p.duty])+
   '</b>. Chỉ nhân viên bán hàng trong ca mới có thể gửi yêu cầu.</div>';
 }
 const reasonOptions='<option value="" disabled '+(!draftReason?'selected':'')+'>Chọn lý do mượn…</option>'+Object.entries(M.REASONS).map(([k,v])=>'<option value="'+k+'" '+(draftReason===k?'selected':'')+'>'+esc(v)+'</option>').join('');
 const skuChips=draft.map(x=>'<span class="draft-pill">'+(x.image?productImage(x):'')+esc(x.sku)+' ×'+x.qty+
  '<button type="button" data-remove="'+esc(x.sku)+'" aria-label="Bỏ '+esc(x.sku)+'">×</button></span>').join('');
 return '<div class="composer-title"><span>Soạn yêu cầu gửi kho</span><span class="label">Chỉ mã · lý do mượn · ghi chú</span></div>'+
  '<div class="composer-grid"><label class="field">Mã sản phẩm<input id="skuInput" type="search" placeholder="Scan / nhập SKU" autocomplete="off" maxlength="40"></label>'+
   '<label class="field">SL<input id="qtyInput" type="number" value="1" min="1" max="100"></label>'+
   '<button type="button" id="addSku" class="btn outline">+ Thêm mã</button></div>'+
  '<div class="product-suggestions" id="productSuggestions" hidden></div>'+
   (draft.length?'<div class="draft-products">'+skuChips+'</div>':'')+
   '<div class="composer-extra"><label class="field">Lý do mượn<select id="borrowReason">'+reasonOptions+'</select></label>'+
    '<label class="field">Ghi chú<input id="borrowNote" maxlength="240" value="'+esc(draftNote)+'" placeholder="Ví dụ: khách đang thử size M"></label></div>'+
   '<div class="composer-foot"><label class="field">Khu vực kho<select id="borrowZone">'+
    pools().map(([z,name])=>'<option value="'+z+'" '+(draftZone===z?'selected':'')+'>'+esc(name)+'</option>').join('')+'</select></label>'+
    '<button id="sendBorrow" class="btn" '+(!draft.length?'disabled':'')+'>Gửi yêu cầu →</button></div>';
}
function receiveComposer(c){
 return '<div class="composer-title">Xác nhận hàng đã nhận tại quầy</div>'+
  '<form id="receiveForm"><div class="composer-grid">'+c.lines.map(l=>'<label class="field">'+esc(l.sku)+' · Kho giao '+l.picked+
   '<input type="number" data-receive="'+esc(l.sku)+'" value="'+l.picked+'" min="0" max="'+l.picked+'"></label>').join('')+'</div>'+
  '<div class="composer-foot"><label class="field" style="flex:1">Lý do nếu nhận thiếu<input id="receiveReason" maxlength="300" placeholder="Chỉ nhập khi có chênh lệch"></label>'+
   '<button class="btn" type="submit">Xác nhận nhận hàng</button></div></form>';
}
function warehouseComposer(c,p){
 if(c&&allowed('runner')&&(c.status==='ready'||c.status==='in_transit')){
  return '<div class="composer-title">Bàn giao kho → cửa hàng</div>'+
   (c.status==='ready'?'<button class="btn" data-action="take">Tôi nhận giỏ để giao</button>':
   c.runner===p.id?'<button class="btn" data-action="deliver">Đã giao giỏ đến quầy</button>':
   '<div class="notice">Giỏ đang được người vận chuyển khác phụ trách.</div>');
 }
 if(allowed('picker')){
  const claim='<div class="action-strip"><button class="btn outline" type="button" data-action="claim" '+
   (!selectedWave.size?'disabled':'')+'>Nhận lượt soạn ('+selectedWave.size+'/8)</button>'+
   '<span class="label">Tick đơn cùng khu vực trong danh sách trái</span></div>';
  if(c?.status==='picking'&&c.picker===p.id){
   return '<div class="composer-title">Soạn giỏ '+esc(c.id)+' · '+esc(c.zone)+'</div>'+
   '<div class="action-strip"><input type="search" id="scanInput" placeholder="Scan SKU vào giỏ đang chọn" autocomplete="off">'+
    '<button class="btn" type="button" data-action="scanInput">Scan +1</button></div>'+
    '<div class="draft-products">'+c.lines.map(l=>'<span class="draft-pill">'+esc(l.sku)+' · '+l.picked+'/'+l.requested+
     ' <button type="button" data-action="scan" data-sku="'+esc(l.sku)+'" '+(l.picked>=l.requested?'disabled':'')+'>+1</button>'+
     ' <button type="button" data-action="short" data-sku="'+esc(l.sku)+'" '+(l.picked>=l.requested?'disabled':'')+'>Báo thiếu</button></span>').join('')+'</div>'+
    '<div class="composer-foot"><span class="label">Đúng mã · đúng giỏ · đúng người</span>'+
     '<button class="btn" data-action="ready">Đã soạn xong</button></div>';
  }
  return '<div class="composer-title">Hộp nhận việc của kho</div>'+
   claim+(c?'<p>Giỏ đang chọn: '+esc(c.id)+' · '+esc(statuses[c.status])+'</p>':'');
 }
 if(allowed('runner')){
  return '<div class="composer-title">Bàn giao kho → cửa hàng</div>'+
   (c?.status==='ready'?'<button class="btn" data-action="take">Tôi nhận giỏ để giao</button>':
   c?.status==='in_transit'&&c.runner===p.id?'<button class="btn" data-action="deliver">Đã giao giỏ đến quầy</button>':
   '<div class="notice">Chọn yêu cầu đã soạn xong hoặc giỏ bạn đang giao.</div>');
 }
 return '<div class="notice">Góc nhìn kho dành cho nhân viên soạn và vận chuyển theo vị trí trong ca.</div>';
}
function renderComposer(c,p){
 $('composerArea').innerHTML=side()==='store'?storeComposer(c,p):warehouseComposer(c,p);
}
function draw(){
 chooseEmployee();
 if(!selected) selected=M.visible(state,branch,employeeId).find(c=>M.activeStatuses.has(c.status))?.id||null;
 stats();list();roster();body();save();
}
function perform(action,sku){
 const p=person(),c=current();
 if(action==='claim'){
  if(!selectedWave.size)throw Error('Chưa chọn yêu cầu.');
  const wave=M.claimWave(state,employeeId,[...selectedWave]);
  selected=[...selectedWave][0];selectedWave.clear();warn('Kho đã nhận lượt '+wave);return;
 }
 if(!c)throw Error('Hãy chọn một hội thoại.');
 if(action==='scanInput'||action==='scan'){
  const product=(action==='scanInput'?$('scanInput')?.value:sku||'').trim().toUpperCase();
  M.scan(state,employeeId,c.id,product);warn('Đã scan +1 '+product+' vào '+c.id);return;
 }
 if(action==='short'){
  const reason=prompt('Vì sao thiếu '+sku+'? Bắt buộc ghi lý do.');
  if(reason===null)return;
  M.short(state,employeeId,c.id,sku,reason);warn('Đã ghi nhận thiếu mã '+sku);return;
 }
 if(action==='ready'){M.ready(state,employeeId,c.id);warn('Giỏ đã sẵn sàng bàn giao.');return;}
 if(action==='take'){M.take(state,employeeId,c.id);warn('Đã nhận giỏ vận chuyển.');return;}
 if(action==='deliver'){M.deliver(state,employeeId,c.id);warn('Đã giao tới quầy.');return;}
}
function addSku(){
 const sku=($('skuInput')?.value||'').trim().toUpperCase(),qty=Number($('qtyInput')?.value);
 if(!/^[A-Z0-9._-]{1,40}$/.test(sku)||!Number.isInteger(qty)||qty<1||qty>100)throw Error('Mã SKU hoặc số lượng không hợp lệ.');
 draftReason=$('borrowReason').value;draftZone=$('borrowZone').value;draftNote=$('borrowNote').value;
 const row=draft.find(x=>x.sku===sku);
 if(row){if(row.qty+qty>100)throw Error('Vượt số lượng cho một mã.');row.qty+=qty}
 else if(draft.length<30){const cat=suggestions.find(x=>x.sku===sku);draft.push({sku,qty,name:cat?.name||null,image:cat?.image||null});}
 else throw Error('Một yêu cầu tối đa 30 mã.');
 notice='';draw();
 $('skuInput')?.focus();
}
function send(){
 if(!draft.length)throw Error('Cần thêm ít nhất một mã sản phẩm.');
 draftReason=$('borrowReason').value;draftZone=$('borrowZone').value;draftNote=$('borrowNote').value;
 if(!Object.hasOwn(M.REASONS,draftReason))throw Error('Vui lòng chọn lý do mượn trước khi gửi.');
 const c=M.createCall(state,employeeId,branch,draftZone,draft,draftNote,draftReason);
 selected=c.id;draft=[];draftNote='';notice='';
 $('statusFilter').value='all';draw();
 $('detailContent').scrollTop=$('detailContent').scrollHeight;
}
document.addEventListener('click',e=>{
 const el=e.target;
 if(el.matches('[data-wave]'))return;
 const suggestion=el.closest('[data-suggestion]');
 if(suggestion){
  const prod=suggestions.find(x=>x.sku===suggestion.dataset.suggestion);
  if(!prod)return;
  if($('skuInput'))$('skuInput').value=prod.sku;
  if($('productSuggestions'))$('productSuggestions').hidden=true;
  try{addSku()}catch(e){warn(e.message,true)}return;
 }
 const bill=el.closest('[data-bill]');
 if(bill){selectedBill=bill.dataset.bill;body();return;}
 if(el.closest('[data-closebill]')){selectedBill=null;body();return;}
 const returned=el.closest('[data-return]');
 if(returned){
  try{
   const c=current(),sku=returned.dataset.return;
   const count=Number(prompt('Kho đã nhận trả bao nhiêu '+sku+'?',returned.dataset.remaining));
   if(!Number.isInteger(count)||count<1)return;
   const reason=prompt('Lý do / tình trạng hàng nhập trả (bắt buộc):');
   if(reason===null)return;
   M.confirmReturn(state,employeeId,c.id,sku,count,reason);
   warn('Đã ghi nhận hàng trả về kho (DEMO).');
  }catch(e){warn(e.message,true)}
  return;
 }
 const probe=el.closest('[data-probe]');
 if(probe){void checkRealBills(probe.dataset.probe);return;}
 const open=el.closest('[data-open]');
 if(open){selected=open.dataset.open;selectedBill=null;billProbe=null;notice='';draw();return;}
 if(el.closest('[data-remove]')){
  draftReason=$('borrowReason').value;draftZone=$('borrowZone').value;draftNote=$('borrowNote').value;
  draft=draft.filter(x=>x.sku!==el.closest('[data-remove]').dataset.remove);draw();return;
 }
 try{
  if(el.closest('#addSku'))return addSku();
  if(el.closest('#sendBorrow'))return send();
  const b=el.closest('[data-action]');
  if(b)return perform(b.dataset.action,b.dataset.sku);
 }catch(err){warn(err.message,true)}
});
document.addEventListener('change',e=>{
 if(e.target.id==='borrowReason'){draftReason=e.target.value;return}
 if(e.target.id==='borrowZone'){draftZone=e.target.value;return}
 if(e.target.matches('[data-wave]')){
  const id=e.target.dataset.wave,c=state.calls.find(x=>x.id===id);
  if(e.target.checked){
   const jobs=[...selectedWave].map(x=>state.calls.find(z=>z.id===x));
   if(selectedWave.size>=8||jobs.some(x=>x.zone!==c.zone||x.branch!==c.branch)){
    e.target.checked=false;warn('Tối đa 8 giỏ cùng chi nhánh và khu vực.',true);return;
   }selectedWave.add(id);
  }else selectedWave.delete(id);
  renderComposer(current(),person());
 }
});
document.addEventListener('input',e=>{
 if(e.target.id==='borrowNote')draftNote=e.target.value;
 if(e.target.id==='skuInput'){
  clearTimeout(catalogTimer);
  catalogTimer=setTimeout(()=>{void searchCatalog(e.target.value)},180);
 }
});
document.addEventListener('keydown',e=>{
 if((e.key==='Enter'||e.key===' ')&&e.target.matches('[data-open]')){e.preventDefault();selected=e.target.dataset.open;notice='';draw();return}
 if(e.key==='Enter'&&e.target.id==='skuInput'){e.preventDefault();try{addSku()}catch(err){warn(err.message,true)}}
 if(e.key==='Enter'&&e.target.id==='scanInput'){e.preventDefault();try{perform('scanInput')}catch(err){warn(err.message,true)}}
});
document.addEventListener('submit',e=>{
 if(e.target.id==='receiveForm'){
  e.preventDefault();
  try{const amounts={};document.querySelectorAll('[data-receive]').forEach(x=>amounts[x.dataset.receive]=Number(x.value));
   const c=M.receive(state,employeeId,selected,amounts,$('receiveReason').value);
   warn(c.status==='disputed'?'Đã ghi nhận chênh lệch nhận.':'Cửa hàng đã xác nhận nhận đủ.');
  }catch(err){warn(err.message,true)}
 }
});
$('branch').addEventListener('change',()=>{branch=$('branch').value;employeeId='';selected=null;selectedWave.clear();notice='';draftZone='MAIN';suggestions=[];billProbe=null;selectedBill=null;draw()});
$('employee').addEventListener('change',()=>{employeeId=$('employee').value;selected=null;selectedWave.clear();notice='';selectedBill=null;draw()});
$('viewMode').addEventListener('change',()=>{if(person()?.duty!=='admin'){warn('Chỉ admin được đổi góc nhìn.',true);return}
 adminPerspective=$('viewMode').value;selectedWave.clear();notice='';draw()});
$('statusFilter').addEventListener('change',()=>{list()});
$('search').addEventListener('input',()=>{list()});
$('seedMore').addEventListener('click',()=>{M.seed(state,branch,40);warn('Đã thêm 40 yêu cầu mô phỏng.')});
$('resetDemo').addEventListener('click',()=>{if(!confirm('Đặt lại dữ liệu mô phỏng? Không ảnh hưởng Whose/KiotViet.'))return;
 state=M.initial();selected=null;selectedWave.clear();draft=[];draftNote='';notice='';draw()});
draw();
})();
