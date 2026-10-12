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

async function backfillDocuments(){
 if(busy)return;
 const domain=$('kiotBackfillDomain').value;
 const label=$('kiotBackfillDomain').selectedOptions[0]?.textContent||domain;
 const key='whose:kiot:backfill:'+domain;
 let start=Number(sessionStorage.getItem(key)||0);
 if(!Number.isSafeInteger(start)||start<0)start=0;
 if(!window.confirm('Đưa lịch sử '+label+' vào hàng đợi xử lý từ trang '+(start+1)+'? Đây là đọc KiotViet, không tạo hay chỉnh chứng từ.'))return;
 busy=true;
 const btn=$('kiotBackfillStart'),out=$('kiotBackfillMessage');
 btn.disabled=true;
 let queued=0,duplicate=0;
 try{
  for(let page=start;page<10000;page++){
   out.textContent='Đọc '+label+' trang '+(page+1)+'…';
   const response=await authorizedFetch('/api/kiot-document-backfill',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({domain,page,confirm:'BACKFILL_KIOT_DOCUMENTS'}),cache:'no-store'
   });
   if(!response.ok){
    const issue=await response.json().catch(()=>({}));
    throw Error('Trang '+(page+1)+': '+(issue.error||'HTTP '+response.status));
   }
   const data=await response.json();
   if(!Number.isInteger(data.queued)||!Number.isInteger(data.duplicates))throw Error('ACK không hợp lệ');
   queued+=data.queued;duplicate+=data.duplicates;
   sessionStorage.setItem(key,String(page+1));
   out.textContent='Đã đưa vào hàng đợi '+queued+' chứng từ mới; '+duplicate+' bản trùng.';
   if(!data.hasMore){
    sessionStorage.removeItem(key);
    out.textContent+=' Hoàn thành đọc danh sách; worker tiếp tục lấy chi tiết và lưu sổ.';
    return;
   }
  }
  throw Error('Vượt giới hạn số trang');
 }catch(e){out.textContent='Tạm dừng: '+e.message+'. Có thể chạy lại từ trang đã lưu.';}
 finally{busy=false;btn.disabled=false;}
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