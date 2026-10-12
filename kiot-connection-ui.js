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
})();
