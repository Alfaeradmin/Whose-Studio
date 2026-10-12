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
})();
