'use strict';
(()=>{
let ready=false,scope=[],requests=[],selected=null,filter='all',timer=null,focusedBranch='';
const el=id=>document.getElementById(id);
const n=(tag,cls,value)=>{const x=document.createElement(tag);if(cls)x.className=cls;if(value!==undefined)x.textContent=String(value);return x};
const fmt=x=>{try{return new Date(x).toLocaleString('vi-VN')}catch{return '—'}};
const label=id=>scope.find(b=>b.id===id)?.name||'Chi nhánh chưa xác định';
async function call(resource,extra={},post){
 const token=await window.whoseAccessToken?.();if(!token)throw Error('Cần đăng nhập lại');
 const url='/api/backend?'+new URLSearchParams({resource,...extra});
 const r=await fetch(url,{method:post?'POST':'GET',headers:{Authorization:'Bearer '+token,...(post?{'Content-Type':'application/json'}:{})},body:post?JSON.stringify(post):undefined,cache:'no-store'});
 const data=await r.json().catch(()=>({}));if(!r.ok)throw Error(data.error||'Không thể đọc dữ liệu Whose');
 return data;
}
async function init(){
 if(ready)return;ready=true;
 const mount=el('wrMount');const response=await fetch('/calling-chat.html',{cache:'no-store'});if(!response.ok)throw Error('Không tải được giao diện gọi hàng');
 mount.innerHTML=await response.text();
 el('wrReload').onclick=reload;
 el('wrFilter').oninput=paintInbox;
 el('wrBranch').onchange=()=>{focusedBranch=el('wrBranch').value;paintInbox()};
 document.querySelectorAll('.wr-chips button').forEach(b=>b.onclick=()=>{filter=b.dataset.status;document.querySelectorAll('.wr-chips button').forEach(x=>x.classList.toggle('active',x===b));paintInbox()});
 for(const id of ['wrNew','wrComposeNew'])el(id).onclick=openNew;
 for(const id of ['wrClose','wrCancel','wrModalBackdrop'])el(id).onclick=closeNew;
 el('wrForm').onsubmit=submit;
 await reload();
 timer=setInterval(()=>{if(!document.hidden&&!el('wrPage').hidden)reload(true)},25000);
}
function fillBranches(){
 for(const id of ['wrBranch','wrFrom','wrTo']){
  const select=el(id),previous=select.value;select.replaceChildren(new Option(id==='wrBranch'?'Tất cả chi nhánh được cấp quyền':'Chọn chi nhánh', ''));
  for(const b of scope)select.add(new Option(b.name,b.id));
  if(scope.some(x=>x.id===previous))select.value=previous;
 }
 if(focusedBranch&&scope.some(x=>x.id===focusedBranch))el('wrBranch').value=focusedBranch;
}
async function reload(quiet=false){
 try{
  if(!quiet)el('wrConnection').textContent='Đang tải dữ liệu…';
  const [br,req]=await Promise.all([call('branches',{limit:100}),call('requests',{limit:100})]);
  scope=br.rows||[];requests=req.rows||[];fillBranches();paintInbox();if(selected)await selectRequest(selected.id);
  el('wrConnection').textContent='Đã cập nhật · '+new Date().toLocaleTimeString('vi-VN');
 }catch(e){el('wrConnection').textContent='Không thể đọc dữ liệu: '+e.message}
}
function paintInbox(){
 const list=el('wrConversations'),q=el('wrFilter').value.trim().toLowerCase(),branch=el('wrBranch').value;list.replaceChildren();
 const rows=requests.filter(r=>(filter==='all'||r.status===filter)&&(!branch||r.origin_branch_id===branch||r.destination_branch_id===branch)&&(!q||String(r.id+' '+(r.note||'')).toLowerCase().includes(q)));
 el('wrCount').textContent=rows.length+' yêu cầu';
 if(!rows.length){list.append(n('div','wr-empty','Chưa có yêu cầu phù hợp. Các cuộc hội thoại sẽ xuất hiện khi có yêu cầu thực tế.'));return}
 for(const r of rows){const b=n('button','wr-conversation'+(selected?.id===r.id?' active':'')),avatar=n('span','wr-avatar','↗'),body=n('span','wr-conversation-main');
  body.append(n('strong','',label(r.origin_branch_id)+' → '+label(r.destination_branch_id)),n('small','',fmt(r.created_at)),n('p','',r.note||'Yêu cầu SKU có cấu trúc'));
  b.append(avatar,body);b.onclick=()=>selectRequest(r.id);list.append(b)}
}
async function selectRequest(id){
 const r=requests.find(x=>x.id===id);if(!r)return;
 selected=r;paintInbox();el('wrThreadName').textContent=label(r.origin_branch_id)+' → '+label(r.destination_branch_id);
 el('wrThreadSubtitle').textContent='Mã yêu cầu: '+r.id;el('wrThreadStatus').textContent=r.status||'Chưa xác định';
 const thread=el('wrThread');thread.replaceChildren();
 const initial=n('article','wr-message system');initial.append(n('small','',fmt(r.created_at)+' · Tạo yêu cầu'),n('p','',r.note||'Yêu cầu gọi hàng'));thread.append(initial);
 try{
  const lines=await call('request_lines',{request_id:id,limit:100});
  const card=n('article','wr-message');card.append(n('small','','Các sản phẩm được yêu cầu'));
  for(const row of lines.rows||[]){const line=n('div','wr-line');line.append(n('strong','',row.sku),n('span','','SL '+row.requested_qty));card.append(line);if(row.note)card.append(n('p','',row.note))}
  if(!(lines.rows||[]).length)card.append(n('p','','Chưa có dòng sản phẩm.'));
  thread.append(card);
  const events=await call('request_events',{request_id:id,limit:50});
  for(const ev of (events.rows||[]).reverse()){const box=n('article','wr-message system');box.append(n('small','',fmt(ev.created_at)),n('p','',ev.event_type||'Ghi nhận thao tác'));thread.append(box)}
  el('wrSummary').replaceChildren(n('div','wr-meta',''));
  const info=el('wrSummary').firstChild;
  [['Từ',label(r.origin_branch_id)],['Đến',label(r.destination_branch_id)],['Số SKU',(lines.rows||[]).length],['Tạo lúc',fmt(r.created_at)]].forEach(([a,b])=>{const x=n('span');x.append(n('small','',a),n('strong','',b));info.append(x)});
 }catch(e){thread.append(n('p','wr-info','Không đọc được chi tiết: '+e.message))}
 thread.scrollTop=thread.scrollHeight;
}
function openNew(){fillBranches();el('wrForm').reset();el('wrFormStatus').textContent='';el('wrNewModal').hidden=false}
function closeNew(){el('wrNewModal').hidden=true}
async function submit(e){
 e.preventDefault();const from=el('wrFrom').value,to=el('wrTo').value,sku=el('wrSku').value.trim(),qty=Number(el('wrQty').value),note=el('wrNote').value.trim(),status=el('wrFormStatus');
 if(!from||!to||from===to||!sku||!note||!Number.isInteger(qty)||qty<1){status.textContent='Chọn hai chi nhánh khác nhau, SKU, số lượng và lý do hợp lệ.';return}
 el('wrSend').disabled=true;status.textContent='Đang gửi yêu cầu…';
 try{await call('requests',{},{origin_branch_id:from,destination_branch_id:to,note,lines:[{sku,qty,note}]});closeNew();await reload()}
 catch(err){status.textContent='Không gửi được: '+err.message}
 finally{el('wrSend').disabled=false}
}
window.whoseCallingOpen=async()=>{
 try{await init();el('wrPage').hidden=false;el('wrMount').hidden=false;document.querySelector('.products-page').hidden=true;await reload(true)}
 catch(e){alert('Không mở được Gọi hàng: '+e.message)}
};
window.whoseCallingClose=()=>{if(el('wrPage'))el('wrPage').hidden=true;el('wrMount').hidden=true;document.querySelector('.products-page').hidden=false};
})();