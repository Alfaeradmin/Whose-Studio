'use strict';
(()=>{
let initialized=false,initPromise=null,scope=[],requests=[],selectedId=null,filter='all',focusedBranch='',lastDetailId=null,lastDetailVersion=null;
let polling=null,reloading=false,detailSequence=0,searchTimer=null,searchAbort=null,productSkuChosen=null;
const el=id=>document.getElementById(id);
const make=(tag,cls,value)=>{const x=document.createElement(tag);if(cls)x.className=cls;if(value!==undefined)x.textContent=String(value);return x};
const number=x=>Number(x).toLocaleString('vi-VN');
const time=x=>{const d=x?new Date(x):null;return d&&!Number.isNaN(d.getTime())?d.toLocaleString('vi-VN'):'—'};
const branch=id=>scope.find(b=>b.id===id)?.name||'Chi nhánh';
const statusName=s=>({'submitted':'Chờ tiếp nhận','completed':'Hoàn tất','cancelled':'Đã hủy','in_progress':'Đang xử lý','accepted':'Đã tiếp nhận','pending':'Đang chờ'}[s]||s||'Chưa xác định');
async function api(resource,params={},post){
 const token=await window.whoseAccessToken?.();if(!token)throw Error('Phiên đăng nhập hết hạn');
 const r=await fetch('/api/backend?'+new URLSearchParams({resource,...params}),{
  method:post?'POST':'GET',
  headers:{Authorization:'Bearer '+token,...(post?{'Content-Type':'application/json'}:{})},
  body:post?JSON.stringify(post):undefined,cache:'no-store'
 });
 const data=await r.json().catch(()=>({}));if(!r.ok)throw Error(data.error||'Không đọc được dữ liệu Whose');
 return data;
}
function fillBranches(){
 for(const id of ['wrBranch','wrFrom','wrTo']){
  const select=el(id),old=select.value;
  select.replaceChildren(new Option(id==='wrBranch'?'Tất cả chi nhánh':'Chọn chi nhánh',''));
  for(const b of scope)select.add(new Option(b.name,b.id));
  if(scope.some(x=>x.id===old))select.value=old;
 }
 if(focusedBranch&&scope.some(x=>x.id===focusedBranch))el('wrBranch').value=focusedBranch;
}
function paintInbox(){
 const list=el('wrConversations'),scroll=list.scrollTop,q=el('wrFilter').value.trim().toLowerCase(),branchId=el('wrBranch').value;
 const rows=requests.filter(r=>(filter==='all'||r.status===filter)&&(!branchId||r.origin_branch_id===branchId||r.destination_branch_id===branchId)&&
 (!q||[r.id,r.note,branch(r.origin_branch_id),branch(r.destination_branch_id)].some(v=>String(v||'').toLowerCase().includes(q))));
 list.replaceChildren();el('wrCount').textContent=number(rows.length)+' yêu cầu';
 if(!rows.length){
  const empty=make('div','wr-empty',requests.length?'Không có yêu cầu phù hợp. Hãy thử đổi bộ lọc.':'Chưa có yêu cầu được ghi nhận. Tạo yêu cầu đầu tiên để bắt đầu trao đổi.');
  list.append(empty);return;
 }
 const fragment=document.createDocumentFragment();
 for(const r of rows){
  const button=make('button','wr-conversation'+(selectedId===r.id?' active':''));
  button.type='button';button.setAttribute('aria-label','Xem yêu cầu từ '+branch(r.origin_branch_id));
  if(selectedId===r.id)button.setAttribute('aria-current','true');
  const avatar=make('span','wr-avatar','↗'),body=make('span','wr-conversation-main');
  body.append(make('strong','wr-conversation-title',branch(r.origin_branch_id)+' → '+branch(r.destination_branch_id)));
  const meta=make('div','wr-conversation-meta'),badge=make('span','wr-inbox-state',statusName(r.status));badge.dataset.state=r.status||'';
  meta.append(badge,make('small','',time(r.created_at)));body.append(meta);
  const note=make('p','',r.note||'Yêu cầu hàng hóa');
  body.append(note);button.append(avatar,body);button.addEventListener('click',()=>void selectRequest(r.id));
  fragment.append(button);
 }
 list.append(fragment);list.scrollTop=scroll;
}
async function selectRequest(id,{refresh=false}={}){
 const r=requests.find(x=>x.id===id);if(!r)return;
 const seq=++detailSequence;
 selectedId=id;
 const newSelection=lastDetailId!==id;
 paintInbox();
 el('wrThreadName').textContent=branch(r.origin_branch_id)+' → '+branch(r.destination_branch_id);
 el('wrThreadSubtitle').textContent='Yêu cầu '+String(r.id).slice(0,8).toUpperCase()+' · '+time(r.created_at);
 el('wrThreadStatus').textContent=statusName(r.status);
 el('wrThreadStatus').dataset.state=r.status||'';
 const thread=el('wrThread');
 if(newSelection){
  thread.replaceChildren(make('div','wr-empty','Đang tải nội dung yêu cầu…'));
 }
 try{
  const [linesResult,eventsResult]=await Promise.all([
    api('request_lines',{request_id:id,limit:100}),
    api('request_events',{request_id:id,limit:100})
  ]);
  if(seq!==detailSequence)return;
  const lines=linesResult.rows||[],events=eventsResult.rows||[];
  const version=JSON.stringify([r.updated_at||r.status,lines.map(x=>[x.id,x.requested_qty,x.note]),events.map(x=>[x.id,x.event_type,x.created_at])]);
  if(!newSelection&&refresh&&version===lastDetailVersion)return;
  lastDetailId=id;lastDetailVersion=version;
  const wasAtBottom=thread.scrollHeight-thread.scrollTop-thread.clientHeight<100;
  const oldScroll=thread.scrollTop;
  thread.replaceChildren();
  const initial=make('article','wr-message system');
  initial.append(make('small','',time(r.created_at)+' · Tạo yêu cầu'),make('p','',r.note||'Yêu cầu gọi hàng'));
  thread.append(initial);
  const card=make('article','wr-message');
  card.append(make('small','','DANH SÁCH GỌI HÀNG'),make('div','wr-message-title',number(lines.length)+' dòng sản phẩm'));
  if(!lines.length)card.append(make('p','','Chưa có dòng sản phẩm trong yêu cầu này.'));
  for(const line of lines){
   const row=make('div','wr-line');
   row.append(make('strong','',line.sku||'SKU chưa rõ'),make('span','','SL '+number(line.requested_qty||0)));
   card.append(row);
   if(line.note)card.append(make('p','',line.note));
  }
  thread.append(card);
  for(const event of events.slice().reverse()){
   const message=make('article','wr-message system');
   message.append(make('small','',time(event.created_at)),make('p','',event.event_type||'Ghi nhận thao tác'));
   thread.append(message);
  }
  const details=make('div','wr-meta');
  [['Cửa hàng',branch(r.origin_branch_id)],['Kho nhận',branch(r.destination_branch_id)],['Số SKU',number(lines.length)],['Tạo lúc',time(r.created_at)]].forEach(([a,b])=>{
   const row=make('span');row.append(make('small','',a),make('strong','',b));details.append(row);
  });
  el('wrSummary').replaceChildren(details);
  thread.scrollTop=(newSelection||wasAtBottom)?thread.scrollHeight:oldScroll;
 }catch(error){
  if(seq!==detailSequence)return;
  if(newSelection)thread.replaceChildren(make('p','wr-info','Không đọc được chi tiết: '+error.message));
 }
}
async function reload(quiet=false){
 if(reloading)return;
 reloading=true;
 try{
  if(!quiet)el('wrConnection').textContent='Đang cập nhật…';
  const [branches,items]=await Promise.all([api('branches',{limit:100}),api('requests',{limit:100})]);
  scope=branches.rows||[];requests=items.rows||[];
  fillBranches();paintInbox();
  if(selectedId)await selectRequest(selectedId,{refresh:true});
  el('wrConnection').textContent='Cập nhật lúc '+new Date().toLocaleTimeString('vi-VN');
 }catch(error){el('wrConnection').textContent='Không thể cập nhật · '+error.message}
 finally{reloading=false}
}
function hideSuggestions(){const panel=el('wrProductResults');if(panel){panel.hidden=true;panel.replaceChildren()}}
function openNew(){
 el('wrForm').reset();productSkuChosen=null;el('wrSelectedProduct').textContent='Tìm theo danh mục sản phẩm đồng bộ từ KiotViet';
 hideSuggestions();el('wrFormStatus').textContent='';
 if(focusedBranch&&scope.some(x=>x.id===focusedBranch))el('wrFrom').value=focusedBranch;
 el('wrNewModal').hidden=false;el('wrSku').focus();
}
function closeNew(){el('wrNewModal').hidden=true;hideSuggestions()}
async function productSearch(query){
 if(searchAbort)searchAbort.abort();
 if(query.length<2){hideSuggestions();return}
 const abort=new AbortController();searchAbort=abort;
 const token=await window.whoseAccessToken?.();if(!token)return;
 try{
  const r=await fetch('/api/kiot-products?'+new URLSearchParams({view:'catalog',page:'0',q:query}),{headers:{Authorization:'Bearer '+token},signal:abort.signal,cache:'no-store'});
  const data=await r.json();if(!r.ok||abort.signal.aborted)return;
  const panel=el('wrProductResults');panel.replaceChildren();
  const results=(data.rows||[]).slice(0,9);
  if(!results.length){panel.hidden=true;return}
  for(const item of results){
   const button=make('button','wr-product-option');button.type='button';button.setAttribute('role','option');
   const image=make('img');if(item.imageUrl&&item.imageUrl.startsWith('https://')){image.src=item.imageUrl;image.alt='';image.loading='lazy'}else image.hidden=true;
   const text=make('span');text.append(make('strong','',item.name||item.sku),make('small','',item.sku||''));
   button.append(image,text);button.addEventListener('click',()=>{
    el('wrSku').value=item.sku;productSkuChosen=item.sku;
    el('wrSelectedProduct').textContent=item.name||item.sku;
    hideSuggestions();el('wrQty').focus();
   });
   panel.append(button);
  }
  panel.hidden=false;
 }catch(error){if(error.name!=='AbortError')hideSuggestions()}
}
async function submit(event){
 event.preventDefault();
 const from=el('wrFrom').value,to=el('wrTo').value,sku=el('wrSku').value.trim(),quantity=Number(el('wrQty').value),note=el('wrNote').value.trim(),status=el('wrFormStatus');
 if(!from||!to||from===to||!sku||!note||!Number.isInteger(quantity)||quantity<1||quantity>1000000){
  status.textContent='Chọn hai chi nhánh khác nhau, SKU, số lượng nguyên và lý do hợp lệ.';return;
 }
 el('wrSend').disabled=true;status.textContent='Đang gửi…';
 try{
  await api('requests',{},{origin_branch_id:from,destination_branch_id:to,note,lines:[{sku,qty:quantity,note}]});
  closeNew();await reload();
 }catch(error){status.textContent='Không gửi được yêu cầu: '+error.message}
 finally{el('wrSend').disabled=false}
}
async function init(){
 if(initialized)return;
 if(initPromise)return initPromise;
 initPromise=(async()=>{
  const mount=el('wrMount');
  const r=await fetch('/calling-chat.html',{cache:'no-store'});
  if(!r.ok)throw Error('Không tải được giao diện');
  mount.innerHTML=await r.text();
  el('wrReload').addEventListener('click',()=>void reload());
  el('wrFilter').addEventListener('input',paintInbox);
  el('wrBranch').addEventListener('change',()=>{focusedBranch=el('wrBranch').value;paintInbox()});
  document.querySelectorAll('.wr-chips button').forEach(button=>button.addEventListener('click',()=>{
   filter=button.dataset.status;
   document.querySelectorAll('.wr-chips button').forEach(x=>{x.classList.toggle('active',x===button);x.setAttribute('aria-pressed',String(x===button))});
   paintInbox();
  }));
  for(const id of ['wrNew','wrComposeNew'])el(id).addEventListener('click',openNew);
  for(const id of ['wrClose','wrCancel','wrModalBackdrop'])el(id).addEventListener('click',closeNew);
  el('wrForm').addEventListener('submit',event=>void submit(event));
  el('wrSku').addEventListener('input',()=>{
   productSkuChosen=null;clearTimeout(searchTimer);
   const value=el('wrSku').value.trim();
   searchTimer=setTimeout(()=>void productSearch(value),260);
  });
  el('wrSku').addEventListener('keydown',e=>{if(e.key==='Escape')hideSuggestions()});
  document.addEventListener('pointerdown',e=>{
   if(!e.target.closest('.wr-sku-label'))hideSuggestions();
  });
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!el('wrNewModal').hidden)closeNew()});
  initialized=true;
  polling=setInterval(()=>{if(!document.hidden&&window.whoseSession?.()&&!el('wrPage').hidden)void reload(true)},25000);
 })();
 try{await initPromise}catch(error){initialized=false;initPromise=null;throw error}
}
window.whoseCallingOpen=async()=>{
 try{
  await init();
  el('wrMount').hidden=false;
  el('wrPage').hidden=false;
  const products=document.querySelector('.products-page');if(products)products.hidden=true;
  await reload(true);
  return true;
 }catch(error){
  const products=document.querySelector('.products-page');if(products)products.hidden=false;
  const mount=el('wrMount');if(mount)mount.hidden=true;
  console.error('[Whose/Calling] Unable to open workspace',error.message);
  return false;
 }
};
window.whoseCallingClose=()=>{
 const page=el('wrPage');if(page)page.hidden=true;
 const mount=el('wrMount');if(mount)mount.hidden=true;
 const products=document.querySelector('.products-page');if(products)products.hidden=false;
};
})();
