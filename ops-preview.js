/* Whose Store↔Warehouse interactive preview. All data is SAMPLE ONLY. */
(()=>{
'use strict';
const M=window.WhoseOpsDemoModel,$=id=>document.getElementById(id);
const safe=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const statuses={queued:'Chờ soạn',picking:'Đang soạn',ready:'Chờ vận chuyển',in_transit:'Đang vận chuyển',delivered:'Chờ xác nhận nhận',completed:'Đã nhận đủ',disputed:'Có lệch nhận',cancelled:'Đã hủy'};
let state;
try{const raw=sessionStorage.getItem('whose:ops-preview:v1');state=raw?JSON.parse(raw):M.initial();
 if(!state||state.version!==1||!Array.isArray(state.calls)||!Array.isArray(state.employees))state=M.initial();
}catch{state=M.initial()}
let branch='LVS',employeeId='',selectedId=null,selectedWave=new Set(),notice='';
const save=()=>{try{sessionStorage.setItem('whose:ops-preview:v1',JSON.stringify(state))}catch{}};
const person=()=>state.employees.find(e=>e.id===employeeId);
const current=()=>state.calls.find(c=>c.id===selectedId&&c.branch===branch);
const fmt=x=>Number(x).toLocaleString('vi-VN');
const age=x=>{const min=Math.max(0,Math.floor((Date.now()-x)/60000));
 return min<1?'Vừa gửi':min<60?min+' phút trước':Math.floor(min/60)+' giờ trước';};
const label=x=>statuses[x]||x;
const toast=(s,bad=false)=>{notice=(bad?'⚠ ':'✓ ')+s;render()};
const lineCounts=c=>c.lines.reduce((s,l)=>s+l.requested,0);
const linesPicked=c=>c.lines.reduce((s,l)=>s+l.picked,0);
function selectEmployee(){
 const list=state.employees.filter(e=>e.branch===branch&&e.active);
 if(!list.some(e=>e.id===employeeId))employeeId=list[0]?.id||'';
 $('employee').innerHTML=list.map(e=>'<option value="'+safe(e.id)+'">'+safe(e.name)+' — '+
  safe(M.niceDuty[e.duty])+' · '+safe(e.zone)+'</option>').join('');
 $('employee').value=employeeId;
}
function renderStats(){
 const items=state.calls.filter(c=>c.branch===branch);
 const metric=[
  ['Cần soạn',items.filter(c=>c.status==='queued').length,'Chờ kho nhận'],
  ['Đang soạn',items.filter(c=>c.status==='picking').length,'Đã nhận lượt'],
  ['Chờ vận chuyển',items.filter(c=>c.status==='ready').length,'Đã xếp giỏ'],
  ['Đang giao / chờ nhận',items.filter(c=>['in_transit','delivered'].includes(c.status)).length,'Có người chịu trách nhiệm'],
  ['Đã hoàn tất',items.filter(c=>c.status==='completed').length,'Xác nhận từ cửa hàng']
 ];
 $('stats').innerHTML=metric.map(m=>'<div class="stat"><span>'+m[0]+'</span><strong>'+fmt(m[1])+'</strong><br><small>'+m[2]+'</small></div>').join('');
}
function renderQueue(){
 const p=person();if(!p)return;
 const filter=$('statusFilter').value,query=$('search').value.trim().toLowerCase();
 const all=M.visible(state,branch,p.id);
 const rows=all.filter(c=>(filter==='all'||filter==='active'&&M.activeStatuses.has(c.status)||filter===c.status)&&
  (!query||[c.id,c.zone,c.note,...c.lines.map(l=>l.sku)].some(t=>String(t||'').toLowerCase().includes(query))));
 $('queueCount').textContent=fmt(rows.length);
 $('queueSubtitle').textContent=p.duty==='picker'?
  'Ưu tiên trước · cùng zone · scan từng giỏ':'Đã lọc theo chi nhánh và vị trí trong ca';
 const visible=rows.slice(0,100);
 $('orderQueue').innerHTML=visible.map(c=>{
  const check=p.duty==='picker'&&c.status==='queued'?
  '<input type="checkbox" aria-label="Chọn '+safe(c.id)+' vào lượt soạn" data-wave="'+safe(c.id)+'" '+
   (selectedWave.has(c.id)?'checked':'')+'>':'';
  return '<div class="queue-card '+(c.id===selectedId?'selected':'')+'" data-open="'+safe(c.id)+
   '" tabindex="0" role="group"><div class="heading"><div class="row" style="justify-content:start">'+check+
   '<b>'+safe(c.id)+'</b></div><span class="status '+safe(c.status)+'">'+label(c.status)+'</span></div>'+
   '<div class="meta"><span class="tote">GIỎ '+safe(c.id.split('-').pop())+'</span> · '+safe(c.zone)+
   (c.priority?' · <span class="priority">ƯU TIÊN</span>':'')+
   '</div><small>'+safe(c.lines.map(l=>l.sku+' ×'+l.requested).join(' · '))+
   '</small><small>'+age(c.created)+' · '+c.version+' thay đổi</small></div>';
 }).join('')+
 (rows.length>100?'<div class="notice">Hiển thị 100/'+fmt(rows.length)+' kết quả. Dùng bộ lọc để tìm đơn.</div>':'')+
 (!rows.length?'<div class="notice">Không có yêu cầu thuộc bộ lọc và vị trí trong ca.</div>':'');
}
function roster(){
 const rows=state.employees.filter(e=>e.branch===branch);
 $('shiftRoster').innerHTML=rows.map(e=>'<div class="person"><div class="avatar">'+safe(e.name.slice(0,2))+'</div>'+
  '<div><strong>'+safe(e.name)+'</strong><span>'+safe(M.niceDuty[e.duty])+' · '+safe(e.zone)+
  (e.id===employeeId?' · đang thao tác':'')+'</span></div></div>').join('');
}
function summary(c){
 return '<div class="box"><div class="row wrap"><span class="tote">GIỎ '+safe(c.id)+' · '+safe(c.zone)+'</span>'+
  '<span class="status '+safe(c.status)+'">'+label(c.status)+'</span></div>'+
  '<p class="helper">'+safe(c.note||'Yêu cầu bổ sung hàng')+' · '+age(c.created)+
  ' · Phiên bản '+c.version+'</p>'+
  c.lines.map(l=>'<div class="call-line"><div><strong>'+safe(l.sku)+'</strong>'+
   (l.shortage?'<small>Thiếu: '+safe(l.shortage)+'</small>':'')+'</div>'+
   '<div class="amount">'+l.picked+' / '+l.requested+' soạn</div></div>').join('')+
  '<div class="progressbar"><span style="width:'+Math.floor(100*linesPicked(c)/lineCounts(c))+'%"></span></div></div>';
}
function events(c){
 if(!c)return '';
 return '<div class="box"><h3>Nhật ký giỏ · '+safe(c.id)+'</h3>'+
  c.events.slice(-8).reverse().map(x=>'<div class="call-line"><small>'+
   new Date(x.at).toLocaleTimeString('vi-VN')+' · '+safe(x.action)+'</small></div>').join('')+'</div>';
}
function sellerView(c){
 return '<h3 class="panel-title">Gọi hàng từ quầy bán</h3><p class="helper">Tạo các yêu cầu độc lập, kể cả khi nhiều khách đang chờ. Kho nhận theo khu vực; mỗi đơn có giỏ riêng.</p>'+
 '<form id="callForm" class="box"><h3>Tạo yêu cầu mới</h3><div class="inline-form">'+
 '<label>Khu vực kho<select id="newZone"><option value="MAIN">MAIN · kho chính</option><option value="BACK">BACK · kho phía sau</option></select></label>'+
 '<label>Mã SKU<input id="newSku" value="DEMO-TEE-01" maxlength="40" required></label>'+
 '<label>Số lượng<input id="newQty" type="number" value="1" min="1" max="100" required></label>'+
 '<label>Ghi chú<input id="newNote" maxlength="240" placeholder="Khách đang đợi, màu size…"></label>'+
 '<button class="btn full" type="submit">Gửi yêu cầu tới kho</button></div></form>'+
 (c?summary(c)+events(c):'<div class="notice">Chọn một yêu cầu trong danh sách để xem trạng thái xử lý.</div>');
}
function pickerView(c,p){
 const queued=M.visible(state,branch,p.id).filter(x=>x.status==='queued');
 let html='<h3 class="panel-title">Soạn hàng theo lượt · không trộn giỏ</h3>'+
 '<p class="helper">Chọn tối đa 8 yêu cầu cùng khu vực để nhận một lượt. Hệ thống gom lộ trình lấy SKU, nhưng mỗi sản phẩm vẫn được scan vào đúng giỏ được chọn.</p>'+
 '<div class="box"><div class="row"><strong>Đơn đang chọn: '+selectedWave.size+' / 8</strong>'+
 '<button class="btn small" type="button" data-act="claim" '+(!selectedWave.size?'disabled':'')+'>Nhận lượt soạn</button></div>'+
 '<p>Chỉ chọn các đơn trạng thái Chờ soạn ở cột bên trái · Cùng MAIN hoặc cùng BACK.</p></div>';
 const mine=M.visible(state,branch,p.id).filter(x=>x.status==='picking'&&x.picker===p.id);
 if(mine.length){
  const wave=c?.wave&&c.picker===p.id?c.wave:mine[0].wave;
  const group=mine.filter(x=>x.wave===wave);
  html+='<div class="box"><h3>Lượt '+safe(wave)+'</h3><p>Đi lấy hàng theo SKU; đặt vào giỏ theo số trên phiếu, không tự gộp số lượng.</p>'+
   '<div class="wave-list">'+group.map(x=>'<button type="button" class="'+(c?.id===x.id?'active':'')+
    '" data-act="open" data-id="'+safe(x.id)+'">GIỎ '+safe(x.id.split('-').pop())+' · '+
    linesPicked(x)+'/'+lineCounts(x)+'</button>').join('')+'</div>'+
   '<div class="call-line"><strong>Gợi ý lấy trong lượt</strong><span class="label">Số lượng cần soạn</span></div>';
  const needed=new Map();
  group.forEach(x=>x.lines.forEach(l=>needed.set(l.sku,(needed.get(l.sku)||0)+l.requested-l.picked)));
  html+=[...needed].map(([sku,n])=>'<div class="call-line"><span>'+safe(sku)+'</span><strong>'+n+'</strong></div>').join('')+'</div>';
 }
 if(c&&c.status==='picking'&&c.picker===p.id){
  html+=summary(c)+'<div class="box"><h3>Scan vào đúng giỏ '+safe(c.id.split('-').pop())+'</h3>'+
   '<div class="row"><input id="scanSku" type="search" autocomplete="off" placeholder="Quét hoặc nhập SKU rồi Enter" style="flex:1;min-width:0"><button class="btn" data-act="scanInput">+1</button></div>'+
   c.lines.map(l=>'<div class="call-line"><div><strong>'+safe(l.sku)+'</strong><small>'+
    l.picked+'/'+l.requested+' ·'+(l.shortage?' Đã báo thiếu':' Chưa báo thiếu')+'</small></div>'+
    '<div class="row"><button class="btn small outline" data-act="scan" data-id="'+safe(c.id)+'" data-sku="'+safe(l.sku)+
    '" '+(l.picked>=l.requested?'disabled':'')+'>Scan +1</button>'+
    '<button class="btn small subtle" data-act="short" data-id="'+safe(c.id)+'" data-sku="'+safe(l.sku)+
    '" '+(l.picked>=l.requested?'disabled':'')+'>Báo thiếu</button></div></div>').join('')+
   '<button class="btn" style="margin-top:10px;width:100%" data-act="ready" data-id="'+safe(c.id)+'">Đã soạn xong giỏ</button></div>';
 }else if(!mine.length)html+='<div class="notice">Chưa nhận lượt nào. Chọn các yêu cầu cùng zone rồi bấm Nhận lượt soạn.</div>';
 if(c)html+=events(c);
 return html;
}
function runnerView(c){
 let html='<h3 class="panel-title">Vận chuyển từ kho tới quầy</h3><p class="helper">Mỗi lượt giao vẫn chứa các giỏ riêng biệt. Nhân viên vận chuyển ghi nhận nhận giỏ và giao tới cửa hàng.</p>';
 if(!c)return html+'<div class="notice">Chọn giỏ có trạng thái Chờ vận chuyển.</div>';
 html+=summary(c);
 if(c.status==='ready')html+='<button class="btn" data-act="take" data-id="'+safe(c.id)+'">Tôi nhận giỏ này để giao</button>';
 if(c.status==='in_transit')html+='<button class="btn" data-act="deliver" data-id="'+safe(c.id)+'">Đã giao tới quầy</button>';
 return html+events(c);
}
function receiverView(c){
 let html='<h3 class="panel-title">Cửa hàng nhận hàng từ kho</h3><p class="helper">Nhân viên ở quầy đếm thực nhận. Thiếu khi giao phải có lý do, không tự coi đã nhận đủ.</p>';
 if(!c)return html+'<div class="notice">Chọn giỏ có trạng thái Chờ xác nhận nhận.</div>';
 html+=summary(c);
 if(c.status==='delivered'){
  html+='<form id="receiveForm" class="box"><h3>Đếm hàng đã nhận</h3>'+
   c.lines.map(l=>'<label class="call-line"><strong>'+safe(l.sku)+' · Kho giao '+l.picked+
    '</strong><input type="number" data-receive="'+safe(l.sku)+'" value="'+l.picked+
    '" min="0" max="'+l.picked+'" style="width:95px"></label>').join('')+
   '<label class="inline-form single" style="margin:10px 0">Lý do chênh lệch (nếu có)<input id="receiveReason" maxlength="300" placeholder="Số giao khác số nhận, tình trạng kiện…"></label>'+
   '<button class="btn" style="width:100%" type="submit">Xác nhận thực nhận</button></form>';
 }
 return html+events(c);
}
function leadView(c){
 const people=state.employees.filter(p=>p.branch===branch);
 return '<h3 class="panel-title">Điều hành ca & phân vị trí</h3>'+
 '<p class="helper">Mỗi người thao tác theo vị trí đang được phân trong ca. Hãy thử đổi vị trí để thấy hàng đợi thay đổi ngay. Bản demo chỉ lưu trong phiên trình duyệt.</p>'+
 '<div class="box"><h3>Nhân sự ca · '+safe(branch)+'</h3>'+
 people.map(p=>'<div class="call-line"><div><strong>'+safe(p.name)+'</strong><small>'+safe(p.id)+'</small></div>'+
 '<div class="row"><select data-duty="'+safe(p.id)+'">'+M.DUTIES.map(d=>'<option '+(p.duty===d?'selected':'')+' value="'+d+'">'+
 safe(M.niceDuty[d])+'</option>').join('')+'</select>'+
 '<select data-zone="'+safe(p.id)+'">'+['MAIN','BACK','ALL'].map(z=>'<option '+(p.zone===z?'selected':'')+' value="'+z+'">'+z+'</option>').join('')+
 '</select><button class="btn small" data-act="assign" data-id="'+safe(p.id)+'">Lưu</button></div></div>').join('')+'</div>'+
 (c?summary(c)+events(c):'<div class="notice">Trưởng ca thấy toàn bộ yêu cầu và các trường hợp đang chờ xử lý.</div>');
}
function renderDetail(){
 const p=person();if(!p)return;
 const eligible=M.visible(state,branch,p.id);
 const c=eligible.find(x=>x.id===selectedId)||null;
 if(!c&&selectedId)selectedId=null;
 $('roleChip').textContent=M.niceDuty[p.duty]+' · '+p.zone;
 $('detailTitle').textContent=p.duty==='seller'?'Quầy gọi hàng':
  p.duty==='picker'?'Bàn soạn kho':p.duty==='runner'?'Bàn vận chuyển':p.duty==='receiver'?'Xác nhận tại quầy':'Điều hành ca';
 $('detailSub').textContent=p.name+' · Chi nhánh '+branch;
 const html=p.duty==='seller'?sellerView(c):p.duty==='picker'?pickerView(c,p):
  p.duty==='runner'?runnerView(c):p.duty==='receiver'?receiverView(c):leadView(c);
 $('detailContent').innerHTML=(notice?'<div class="notice '+(notice[0]==='⚠'?'warn':'ok')+'">'+safe(notice)+'</div>':'')+html;
}
function render(){
 selectEmployee();renderStats();renderQueue();roster();renderDetail();save();
}
function doAction(type,id,el){
 const p=person(),c=state.calls.find(x=>x.id===id);
 if(type==='open'){selectedId=id;notice='';render();return;}
 if(type==='claim'){
  if(!selectedWave.size)throw Error('CHƯA CHỌN ĐƠN');
  const wave=M.claimWave(state,p.id,[...selectedWave]);
  const first=[...selectedWave][0];selectedWave.clear();selectedId=first;
  toast('Đã nhận '+wave+'. Hàng được chia theo giỏ riêng.');return;
 }
 if(type==='assign'){
  const duty=document.querySelector('[data-duty="'+CSS.escape(id)+'"]').value;
  const zone=document.querySelector('[data-zone="'+CSS.escape(id)+'"]').value;
  M.assign(state,p.id,id,duty,zone);
  toast('Đã phân công vị trí cho ca mô phỏng.');return;
 }
 if(!c)throw Error('CHƯA CHỌN GIỎ');
 if(type==='scan'||type==='scanInput'){
  const sku=type==='scanInput' ? $('scanSku').value.trim().toUpperCase():el.dataset.sku;
  M.scan(state,p.id,c.id,sku);selectedId=c.id;toast('Ghi nhận +1 '+sku+' trong GIỎ '+c.id);return;
 }
 if(type==='short'){
  const reason=prompt('Lý do thiếu SKU '+el.dataset.sku+'? (ít nhất 4 ký tự)');
  if(reason===null)return;
  M.short(state,p.id,c.id,el.dataset.sku,reason);toast('Đã ghi nhận lý do thiếu.');return;
 }
 if(type==='ready'){M.ready(state,p.id,c.id);toast('Giỏ '+c.id+' đã chờ bàn giao.');return;}
 if(type==='take'){M.take(state,p.id,c.id);toast('Đã nhận giỏ để giao.');return;}
 if(type==='deliver'){M.deliver(state,p.id,c.id);toast('Đã bàn giao đến quầy.');return;}
}
document.addEventListener('click',e=>{
 const action=e.target.closest('[data-act]');
 if(action){try{doAction(action.dataset.act,action.dataset.id||selectedId,action)}catch(err){toast(err.message,true)}return;}
 const card=e.target.closest('[data-open]');
 if(card&&!e.target.closest('[data-wave]')){selectedId=card.dataset.open;notice='';render();}
});
document.addEventListener('change',e=>{
 if(!e.target.matches('[data-wave]'))return;
 const id=e.target.dataset.wave,c=state.calls.find(x=>x.id===id);
 if(e.target.checked){
  const list=[...selectedWave].map(x=>state.calls.find(y=>y.id===x));
  if(selectedWave.size>=8||list.some(x=>x.branch!==c.branch||x.zone!==c.zone)){
   e.target.checked=false;toast('Một lượt tối đa 8 giỏ và chỉ gồm giỏ cùng zone.',true);return;
  }
  selectedWave.add(id);
 }else selectedWave.delete(id);
 // Render detail only to preserve currently-focused checkbox.
 renderDetail();
});
document.addEventListener('keydown',e=>{
 if(e.key==='Enter'&&e.target.matches('[data-open]')){selectedId=e.target.dataset.open;render();}
 if(e.key==='Enter'&&e.target.id==='scanSku'){e.preventDefault();
  try{doAction('scanInput',selectedId,e.target)}catch(err){toast(err.message,true)}}
});
document.addEventListener('submit',e=>{
 if(e.target.id==='callForm'){
  e.preventDefault();
  try{
   const sku=$('newSku').value.trim().toUpperCase(),qty=Number($('newQty').value);
   const c=M.createCall(state,employeeId,branch,$('newZone').value,[{sku,qty}],$('newNote').value);
   selectedId=c.id;toast('Đã gửi yêu cầu '+c.id+' tới kho (demo).');
  }catch(err){toast(err.message,true)}
 }
 if(e.target.id==='receiveForm'){
  e.preventDefault();
  try{
   const map={};document.querySelectorAll('[data-receive]').forEach(input=>map[input.dataset.receive]=Number(input.value));
   const c=M.receive(state,employeeId,selectedId,map,$('receiveReason').value);
   toast(c.status==='disputed'?'Đã ghi nhận chênh lệch để điều tra.':'Đã xác nhận nhận đủ giỏ.');
  }catch(err){toast(err.message,true)}
 }
});
$('branch').addEventListener('change',()=>{
 branch=$('branch').value;employeeId='';selectedId=null;selectedWave.clear();notice='';render();
});
$('employee').addEventListener('change',()=>{
 employeeId=$('employee').value;selectedId=null;selectedWave.clear();notice='';render();
});
$('statusFilter').addEventListener('change',renderQueue);
$('search').addEventListener('input',renderQueue);
$('seedMore').addEventListener('click',()=>{M.seed(state,branch,40);toast('Đã thêm 40 yêu cầu mô phỏng.');});
$('resetDemo').addEventListener('click',()=>{
 if(!confirm('Đặt lại dữ liệu mô phỏng? Không ảnh hưởng Whose/KiotViet.'))return;
 state=M.initial();selectedId=null;selectedWave.clear();notice='';render();
});
render();
})();
