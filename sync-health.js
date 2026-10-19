'use strict';
(()=>{
 const node=id=>document.getElementById(id);
 const host=node('wsConnectorHealth'),button=node('wsHealthRefresh');
 if(!host||!button)return;
 let request=0;
 const fmt=value=>value?new Date(value).toLocaleString('vi-VN',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}):'Chưa có dữ liệu';
 const pair=(name,value)=>{
  const row=document.createElement('div');row.className='ws-health-row';
  const label=document.createElement('span');label.textContent=name;
  const content=document.createElement('strong');content.textContent=String(value);
  row.append(label,content);return row;
 };
 async function refresh(){
  const staff=window.whoseSession?.();
  const ticket=++request;
  host.hidden=!staff?.is_global_admin;
  button.hidden=!staff?.is_global_admin;
  if(!staff?.is_global_admin)return;
  button.disabled=true;
  host.replaceChildren(pair('Trạng thái','Đang đọc dữ liệu Whose…'));
  try{
   const token=await window.whoseAccessToken?.();
   if(!token)throw Error('Phiên đăng nhập không hợp lệ');
   const response=await fetch('/api/kiot-sync-health',{headers:{Authorization:'Bearer '+token},cache:'no-store'});
   const data=await response.json().catch(()=>({}));
   if(!response.ok)throw Error(data.error||'Không thể kiểm tra trạng thái');
   if(ticket!==request||!window.whoseSession?.()?.is_global_admin)return;
   const counts=data.counts||{},signals=data.signals||{};
   host.replaceChildren(
    pair('Sản phẩm đã lưu',counts.products??'—'),
    pair('Tồn kho đã lưu',counts.inventorySnapshots??'—'),
    pair('Cập nhật sản phẩm',fmt(data.last?.products)),
    pair('Cập nhật tồn',fmt(data.last?.inventory)),
    pair('Sự kiện biến động tồn',counts.stockEvents??'—'),
    pair('Chứng từ đã ghi nhận',counts.documents??'—'),
    pair('Hàng đợi / cần điều tra',(counts.inboxPending??0)+' / '+(counts.inboxQuarantined??0)),
    pair('Đồng bộ realtime','CHƯA XÁC MINH')
   );
   if(signals.catalog==='old-observation'||signals.inventory==='old-observation'){
    const msg=document.createElement('p');msg.className='ws-health-warning';
    msg.textContent='Bản ghi gần nhất đã cũ. Cần đối chiếu trực tiếp với KiotViet; không coi tồn đang hiển thị là realtime.';
    host.append(msg);
   }
   const note=document.createElement('p');note.className='ws-health-disclaimer';
   note.textContent='Số liệu lưu tại Whose; chưa chứng minh lịch sử đầy đủ hoặc webhook đang hoạt động.';
   host.append(note);
  }catch(e){
   if(ticket===request)host.replaceChildren(pair('Chưa kiểm chứng được',e.message));
  }finally{if(ticket===request)button.disabled=false}
 }
 button.addEventListener('click',()=>void refresh());
 window.addEventListener('whose:authenticated',()=>void refresh());
 window.addEventListener('whose:logged-out',()=>{request++;host.hidden=true;button.hidden=true;host.replaceChildren()});
 if(window.whoseSession?.())void refresh();
})();
