'use strict';
// Uses the existing Whose authenticated session, never prints or stores tokens.
(() => {
 const button=document.getElementById('kiotLiveConnectionCheck');
 const badge=document.getElementById('kiotLiveConnectionBadge');
 const message=document.getElementById('kiotLiveConnectionResult');
 const rows=document.getElementById('kiotLiveConnectionRows');
 if(!button||!badge||!message||!rows)return;
 const cell=(tr,text)=>{const td=document.createElement('td');td.textContent=String(text);tr.appendChild(td);};
 button.addEventListener('click',async()=>{
   if(button.disabled)return;
   button.disabled=true;badge.textContent='Đang kiểm tra';badge.className='status st-blue';
   message.textContent='Đang kiểm tra OAuth và quyền đọc KiotViet. Không có thao tác ghi.';
   rows.replaceChildren();
   try{
     const response=await authorizedFetch('/api/kiot-connection-check',{cache:'no-store'});
     const body=await response.json().catch(()=>({}));
     if(response.status===401||response.status===403){
       badge.textContent='Chưa được cấp quyền';badge.className='status st-gray';
       message.textContent='Phiên Whose chưa được xác nhận là Global Admin. Hãy đăng xuất, đăng nhập lại và thử lại.';
       return;
     }
     if(!response.ok&&response.status!==502)throw new Error('Kiểm tra dịch vụ không thành công (HTTP '+response.status+').');
     for(const [name,label] of [['branches','Chi nhánh'],['products','Sản phẩm']]){
       const datum=body[name]||{};
       const tr=document.createElement('tr');
       cell(tr,label);cell(tr,datum.ok?'Kết nối thành công':'Không đọc được');
       cell(tr,Number.isSafeInteger(datum.total)?datum.total:'—');
       cell(tr,Number.isFinite(datum.elapsedMs)?datum.elapsedMs+' ms':'—');
       rows.appendChild(tr);
     }
     const ready=body.branches?.ok===true&&body.products?.ok===true;
     badge.textContent=ready?'Kết nối thành công':'Cần kiểm tra API';
     badge.className='status '+(ready?'st-green':'st-gray');
     message.textContent=ready?'KiotViet đã phản hồi cả hai API. Chưa nhập dữ liệu hoặc thay đổi tồn kho.':'Một hoặc cả hai API chưa trả kết quả hợp lệ. Không có dữ liệu nào được ghi.';
   }catch(err){
     badge.textContent='Không thể kiểm tra';badge.className='status st-gray';
     message.textContent=err instanceof Error?err.message:'Không thể kết nối công cụ kiểm tra.';
   }finally{button.disabled=false;}
 });
 const workerCheck=document.getElementById('kiotWorkerCheck');
 const workerRun=document.getElementById('kiotWorkerRun');
 const workerResult=document.getElementById('kiotWorkerResult');
 if(workerCheck&&workerRun&&workerResult){
   workerCheck.addEventListener('click',async()=>{
     workerCheck.disabled=true;workerRun.disabled=true;
     workerResult.textContent='Đang xác minh cấu hình Worker…';
     try{
       const res=await authorizedFetch('/api/connector-worker',{cache:'no-store'});
       const data=await res.json().catch(()=>({}));
       if(!res.ok)throw new Error('Worker chưa thể xác minh (HTTP '+res.status+').');
       workerRun.disabled=data.workerConfigured!==true;
       workerResult.textContent=data.workerConfigured
         ?'Đã nhận cấu hình Worker · Loại khóa: '+String(data.keyType||'unknown')+' · Định dạng: '+(data.keyLengthValid?'hợp lệ sơ bộ':'không hợp lệ')+' · Ký tự trắng: '+(data.keyHasSurroundingWhitespace?'có':'không')+' · Dấu nháy thừa: '+(data.keyHasQuotes?'có':'không')+'. Webhook: '+(data.webhookConfigured?'đã đặt secret':'chưa có secret')+'. Đăng ký KiotViet: chưa xác minh.'
         :'Thiếu cấu hình Worker ở môi trường đang mở.';
     }catch(e){workerResult.textContent=e.message||'Không thể kiểm tra Worker.';}
     finally{workerCheck.disabled=false;}
   });
   workerRun.addEventListener('click',async()=>{
     if(workerRun.disabled)return;
     workerRun.disabled=true;workerResult.textContent='Đang thực hiện một lượt Inbox…';
     try{
       const res=await authorizedFetch('/api/connector-worker',{method:'POST',cache:'no-store'});
       const data=await res.json().catch(()=>({}));
       if(!res.ok)throw new Error('Worker không hoàn tất ('+String(data.error||'HTTP '+res.status)+').');
       workerResult.textContent='Đã kiểm tra hàng đợi: '+Number(data.claimed||0)
         +' sự kiện, '+Number(data.processed||0)+' hoàn tất, '+Number(data.retry||0)
         +' cần thử lại. Không ghi sang KiotViet.';
     }catch(e){workerResult.textContent=e.message||'Worker gặp lỗi.';}
     finally{workerRun.disabled=false;}
   });
 }
 const readinessButton=document.getElementById('kiotWebhookReadiness');
 const readinessResult=document.getElementById('kiotWebhookReadinessResult');
 if(readinessButton&&readinessResult){
  readinessButton.addEventListener('click',async()=>{
   readinessButton.disabled=true;readinessResult.textContent='Đang đọc danh sách webhook KiotViet…';
   try {
    const res=await authorizedFetch('/api/kiot-webhook-readiness',{cache:'no-store'});
    const data=await res.json().catch(()=>({}));
    if(!res.ok){readinessResult.textContent='Chưa đọc được danh sách webhook KiotViet (HTTP '+res.status+').';return;}
    readinessResult.textContent='KiotViet có '+Number(data.registeredTotal||0)+' webhook · Trỏ tới bản staging hiện tại: '+Number(data.matchingCurrentDeployment||0)+' · Đang hoạt động: '+Number(data.activeMatchingCurrentDeployment||0)+' · Secret Whose: '+(data.webhookSecretConfigured?'đã cấu hình':'chưa cấu hình') +'. Cấu trúc API: '+String(data.responseShape||'không rõ')+' / '+String(data.itemsShape||'không rõ')+' · Trường: '+(Array.isArray(data.responseKeys)?data.responseKeys.join(', '):'không có')+'. Chưa thực hiện đăng ký.';
   }catch{readinessResult.textContent='Không thể kiểm tra đăng ký webhook.';}
   finally{readinessButton.disabled=false;}
  });
 }
 const registerBtn=document.getElementById('kiotWebhookRegister');
 const registerResult=document.getElementById('kiotWebhookRegisterResult');
 if(registerBtn&&registerResult){
  registerBtn.addEventListener('click',async()=>{
   if(!window.confirm('Chạy ba bước: thử chữ ký, ghi sự kiện và Worker, rồi đăng ký product.update trên KiotViet nếu tất cả đạt? Chỉ tạo cấu hình webhook, không sửa hàng hóa hoặc tồn kho KiotViet.'))return;
   registerBtn.disabled=true;registerResult.textContent='Đang thử chữ ký, kiểm tra lưu sự kiện, Worker và đăng ký webhook nếu đạt…';
   try{
    const res=await authorizedFetch('/api/kiot-webhook-register',{method:'POST',cache:'no-store',
      headers:{'Content-Type':'application/json'},body:JSON.stringify({confirm:'REGISTER_PRODUCT_UPDATE'})});
    const data=await res.json().catch(()=>({}));
    if(!res.ok){
     const codes={PRODUCT_WEBHOOK_ALREADY_EXISTS:'KiotViet đã có webhook sản phẩm; không đăng ký trùng.',WEBHOOK_LIST_INCOMPLETE:'Chưa đọc đủ danh sách webhook; không đăng ký.',SIGNING_SECRET_NOT_CONFIGURED:'Chưa cấu hình secret hợp lệ.',INGRESS_SIGNING_KEYS_DIFFER:'Khóa HMAC tại Whose Preview và dịch vụ Webhook khác nhau. Chưa đăng ký KiotViet.',INGRESS_REJECT_TEST_FAILED:'Không đạt thử nghiệm từ chối chữ ký sai. Chưa đăng ký.',INGRESS_ACCEPT_TEST_FAILED:'Chữ ký đúng hoặc ghi nhận Inbox chưa đạt. Chưa đăng ký.',INGRESS_REPLAY_TEST_FAILED:'Phát hiện không chống trùng khi nhận lại sự kiện. Chưa đăng ký.',WORKER_PERSIST_TEST_FAILED:'Worker chưa xử lý sản phẩm thành công. Chưa đăng ký.',INGRESS_OR_WORKER_PREFLIGHT_UNAVAILABLE:'Kiểm thử đầu-cuối gián đoạn; chưa đăng ký.',CANONICAL_SAMPLE_UNAVAILABLE:'Không lấy được sản phẩm kiểm thử hợp lệ; chưa đăng ký.',PROVIDER_REGISTRATION_UNCERTAIN_CHECK_LIST_BEFORE_RETRY:'Chưa xác minh được kết quả, hãy kiểm tra danh sách webhook trước khi thử lại.'};
     registerResult.textContent=codes[data.error]||('Chưa đăng ký: '+String(data.error||'HTTP '+res.status)+'.');return;
    }
    registerResult.textContent='Đã đăng ký product.update thành công · ID '+String(data.id??'chưa có')+' · '+(data.isActive?'đã kích hoạt':'chưa kích hoạt')+'. Tiếp theo kiểm thử thay đổi sản phẩm thực tế.';
   }catch{registerResult.textContent='Mất kết nối hoặc chưa rõ kết quả; kiểm tra danh sách webhook trước khi thử lại.';}
   finally{registerBtn.disabled=false;}
  });
 }
 const operationalBtn=document.getElementById('kiotOperationalProbe');
 const operationalResult=document.getElementById('kiotOperationalResult');
 if(operationalBtn&&operationalResult)operationalBtn.addEventListener('click',async()=>{
  operationalBtn.disabled=true;operationalResult.textContent='Đang kiểm tra API nguồn KiotViet (chỉ đọc)…';
  try{
   const response=await authorizedFetch('/api/kiot-operational-readiness',{cache:'no-store'});
   if(!response.ok)throw Error('HTTP '+response.status);
   const data=await response.json();
   const label=(key,title)=>title+': '+(data[key]?.readable?'đọc được':'chưa đọc được')+
     ' · Tổng: '+(data[key]?.total??'chưa xác định');
   operationalResult.textContent=[label('orders','Đơn hàng'),label('invoices','Hóa đơn'),
     label('stock','Tồn kho')].join(' | ')+'. Chưa lưu dữ liệu và chưa bật tự động.';
  }catch{operationalResult.textContent='Chưa thể xác minh API. Không có dữ liệu bị thay đổi.';}
  finally{operationalBtn.disabled=false;}
 });
})();
