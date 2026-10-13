/* Whose KiotViet event stream control — admin-confirmed provider subscriptions only. */
(()=>{
'use strict';
const $=id=>document.getElementById(id);
const types=[
 {value:'stock.update',label:'Tồn kho'},
 {value:'invoice.update',label:'Hóa đơn'},
 {value:'order.update',label:'Đơn đặt hàng'}
];
let busy=false;
function init(){
 const settings=$('settings');
 if(!settings||$('kiotEventControl'))return;
 const panel=document.createElement('section');panel.id='kiotEventControl';panel.className='card card-pad';
 panel.style.marginBottom='16px';
 panel.innerHTML='<div class="section-head"><div><h2>Dòng sự kiện KiotViet</h2>'+
  '<p>Webhook → Hàng đợi bền vững → đọc lại chứng từ/tồn → sổ lịch sử Whose</p></div></div>'+
  '<div id="kiotEventReadiness" role="status" aria-live="polite"></div>'+
  '<div id="kiotEventActions" class="ws-event-actions"></div>'+
  '<p class="muted">Tồn trước/sau là dữ liệu quan sát. KiotViet stock.update không cung cấp mã chứng từ gây biến động; chỉ liên kết nguồn khi đã xác minh.</p>'+
  '<button class="btn" type="button" id="kiotEventCheck">Kiểm tra trạng thái</button>'+
  '<div class="ws-event-backfill"><label for="kiotBackfillDomain">Đọc lại lịch sử chứng từ</label>'+
  '<select id="kiotBackfillDomain"><option value="invoices">Hóa đơn</option><option value="orders">Đặt hàng</option>'+
  '<option value="purchaseorders">Nhập hàng</option><option value="transfers">Chuyển hàng</option>'+
  '<option value="returns">Trả hàng</option></select>'+
  '<button class="btn" type="button" id="kiotBackfillStart">Đưa vào hàng đợi</button>'+
  '<output id="kiotBackfillMessage" aria-live="polite"></output></div>';
 settings.insertBefore(panel,settings.firstChild);
 $('kiotEventCheck').addEventListener('click',refresh);
 $('kiotBackfillStart').addEventListener('click',backfillDocuments);
 $('kiotBackfillDomain').addEventListener('change',loadBackfillProgress);
 const observer=new MutationObserver(()=>{
  if(settings.classList.contains('active')&&document.body.classList.contains('is-authenticated'))refresh();
 });
 observer.observe(settings,{attributes:true,attributeFilter:['class']});
}
async function refresh(){
 if(busy)return;
 const panel=$('kiotEventControl');
 if(!panel)return;
 const permitted=$('staffRole')?.textContent?.includes('Quản trị toàn hệ thống');
 panel.hidden=!permitted;
 if(!permitted)return;
 const output=$('kiotEventReadiness'),host=$('kiotEventActions');
 output.textContent='Đang xác minh webhook và hàng đợi…';
 try{
  const response=await authorizedFetch('/api/kiot-event-status',{cache:'no-store'});
  if(!response.ok)throw Error('Không thể đọc trạng thái kết nối');
  const data=await response.json();
  const audit=data.audit||{};
  output.textContent=(data.providerReadable?'Danh sách webhook Kiot đã đọc.':'Chưa xác nhận được danh sách webhook đầy đủ.')+
   ' · '+Number(audit.stockEvents||0).toLocaleString('vi-VN')+' sự kiện tồn lưu trữ'+
   ' · '+Number(audit.documents||0).toLocaleString('vi-VN')+' phiên bản chứng từ'+
   (data.hasCronSecret&&data.inboxWorkerConfigured?' · Worker có cấu hình bảo vệ.':' · Worker tự động chưa đủ cấu hình.');
  host.replaceChildren();
  void loadBackfillProgress();
  for(const entry of types){
   const status=data.eventTypes?.[entry.value]||{};
   const row=document.createElement('div');row.className='setting-row';
   const label=document.createElement('div');
   const heading=document.createElement('b');heading.textContent=entry.label;
   const caption=document.createElement('small');
   caption.textContent=status.active?'Đã đăng ký và đang hoạt động':status.registered?
    'Đã tồn tại webhook — cần kiểm tra URL/trạng thái':'Chưa đăng ký webhook';
   label.append(heading,caption);
   const button=document.createElement('button');button.type='button';button.className='btn';
   button.textContent=status.active?'Đã hoạt động':'Đăng ký';
   button.disabled=status.active||status.registered||!data.listComplete||busy;
   button.addEventListener('click',()=>register(entry.value));
   row.append(label,button);host.append(row);
  }
 }catch(e){output.textContent=e.message||'Không thể kiểm tra kết nối';}
}

async function loadBackfillProgress(){
 const domain=$('kiotBackfillDomain')?.value;
 const out=$('kiotBackfillMessage'),button=$('kiotBackfillStart');
 if(!domain||!out||!button)return;
 try{
  const r=await authorizedFetch('/api/kiot-document-backfill?'+new URLSearchParams({domain}),{cache:'no-store'});
  if(!r.ok)throw Error('Checkpoint chưa khả dụng (HTTP '+r.status+').');
  const d=await r.json();
  button.disabled=Boolean(d.complete)||busy;
  button.textContent=d.complete?'Đã xếp hàng đợi xong':'Đọc và đưa trang tiếp';
  out.textContent=d.complete?
   'Đã xếp hàng đợi đủ '+d.nextPage+' trang. Worker vẫn cần xử lý chứng từ; đây chưa phải xác nhận sổ cái đầy đủ.':
   'Checkpoint Supabase · Trang kế tiếp: '+(Number(d.nextPage)+1)+
   (d.updatedAt?' · Lần lưu: '+new Date(d.updatedAt).toLocaleString('vi-VN'):' · Chưa bắt đầu');
 }catch(e){
  button.disabled=true;
  out.textContent='Không đọc được checkpoint trên máy chủ: '+e.message+
   '. Không tiếp tục theo số trang của trình duyệt để tránh bỏ sót.';
 }
}
async function backfillDocuments(){
 if(busy)return;
 const domain=$('kiotBackfillDomain').value;
 const label=$('kiotBackfillDomain').selectedOptions[0]?.textContent||domain;
 if(!window.confirm('Đọc trang chứng từ '+label+' kế tiếp từ checkpoint Supabase và đưa vào hàng đợi? Chỉ đọc KiotViet; không sửa tồn.'))return;
 busy=true;
 const btn=$('kiotBackfillStart'),out=$('kiotBackfillMessage');
 btn.disabled=true;
 out.textContent='Đang đọc một trang và xác nhận lưu hàng đợi…';
 try{
  const response=await authorizedFetch('/api/kiot-document-backfill',{
   method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({domain,confirm:'BACKFILL_KIOT_DOCUMENTS'}),cache:'no-store'
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(response.status===409?
   'Tiến độ đã đổi do một phiên khác xử lý. Hãy làm mới để tiếp tục.':
   (data.error||'HTTP '+response.status));
  if(data.alreadyComplete){
   out.textContent='Đã hoàn tất việc xếp hàng đợi cho loại chứng từ này.';
  }else{
   out.textContent='Đã đọc trang '+(Number(data.page)+1)+' · '+
    Number(data.queued||0).toLocaleString('vi-VN')+' chứng từ mới · '+
    Number(data.duplicates||0).toLocaleString('vi-VN')+' bản trùng.'+
    (data.complete?' Đã xếp hàng đợi hết danh sách, worker vẫn cần xử lý.':' Có thể tiếp tục trang sau.');
  }
 }catch(e){out.textContent='Chưa hoàn tất: '+e.message+' Không tự bỏ qua trang lỗi.';}
 finally{busy=false;await loadBackfillProgress();}
}

async function register(type){
 if(busy)return;
 const label=types.find(x=>x.value===type)?.label||type;
 if(!window.confirm('Đăng ký webhook '+label+' từ KiotViet về Whose? Hệ thống sẽ kiểm tra chữ ký, hàng đợi và quyền trước khi đăng ký.'))return;
 busy=true;
 const output=$('kiotEventReadiness');
 output.textContent='Đang kiểm tra điều kiện đăng ký '+label+'…';
 try{
  const response=await authorizedFetch('/api/kiot-event-register',{
   method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({type,confirm:'REGISTER_KIOT_'+type.toUpperCase()}),cache:'no-store'
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(data.error||'Không thể đăng ký webhook');
  output.textContent='Đã xác nhận webhook '+label+'.';
 }catch(e){output.textContent='Chưa đăng ký: '+String(e.message||'Lỗi chưa rõ')+'. Không thay đổi tồn KiotViet.';}
 finally{busy=false;await refresh();}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();