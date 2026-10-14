'use strict';
(()=>{
 let initialized=false,initPromise=null,role='store',draft=null,searchTimer=null,searchController=null;
 const el=id=>document.getElementById(id);
 const node=(tag,cls,content)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(content!==undefined)n.textContent=String(content);return n};
 const active=()=>window.whoseWarehouse?.()||null;
 const session=()=>window.whoseSession?.()||null;
 const currentRole=()=>{
  const user=session(),branch=active();if(!user||!branch)return null;
  if(user.is_global_admin)return 'admin';
  const roles=(user.memberships||[]).filter(m=>m.branch_id===branch.id).map(m=>m.role);
  if(roles.includes('admin')||roles.includes('manager'))return 'manager';
  if(roles.includes('warehouse'))return 'warehouse';
  if(roles.includes('store'))return 'store';
  return null;
 };
 function render(){
  const branch=active(),permission=currentRole();
  el('wrBranchTitle').textContent=branch?.name||'Chưa được chọn kho thao tác';
  el('wrPageSub').textContent=(branch?.name||'Chọn kho thao tác')+' · Cửa hàng ↔ Kho · nội bộ cùng chi nhánh';
  const isManager=permission==='admin'||permission==='manager';
  if(!isManager)role=permission==='warehouse'?'warehouse':'store';
  el('wrRoleStore').disabled=!isManager&&role!=='store';
  el('wrRoleWarehouse').disabled=!isManager&&role!=='warehouse';
  for(const value of ['store','warehouse']){
   const b=el(value==='store'?'wrRoleStore':'wrRoleWarehouse');
   b.classList.toggle('active',role===value);
   b.setAttribute('aria-pressed',String(role===value));
  }
  el('wrRoleTitle').textContent=role==='store'?'Bộ phận cửa hàng':'Bộ phận kho';
  el('wrComposeTitle').textContent=role==='store'?'Cửa hàng gửi yêu cầu → Kho tiếp nhận':'Kho tiếp nhận, soạn và bàn giao cho cửa hàng';
  el('wrComposeHint').textContent=role==='store'?'Tạo yêu cầu theo SKU, số lượng và lý do để nhân viên kho xử lý.':'Kho xử lý các yêu cầu nội bộ trong cùng chi nhánh và ghi nhận bàn giao.';
  const canDraft=Boolean(branch)&&(role==='store'||isManager);
  el('wrNew').disabled=!canDraft;el('wrComposeNew').disabled=!canDraft;
  el('wrNew').title=canDraft?'Soạn bản nháp yêu cầu nội bộ':'Góc nhìn kho không tạo yêu cầu cho cửa hàng';
  el('wrComposeNew').title=el('wrNew').title;
  el('wrThreadStatus').textContent=draft?'Bản nháp':'Chưa kích hoạt';
  const thread=el('wrThread');thread.replaceChildren();
  if(draft&&draft.branchId===branch?.id){
   const info=node('div','wr-draft-caption','BẢN NHÁP TRÊN TRÌNH DUYỆT · CHƯA GỬI');
   const box=node('article','wr-message wr-internal-draft');
   box.append(node('small','','Cửa hàng → Kho · '+branch.name),node('div','wr-message-title','Yêu cầu lấy sản phẩm'));
   const line=node('div','wr-line');line.append(node('strong','',draft.sku),node('span','','SL '+draft.qty));box.append(line,node('p','',draft.note));
   const warning=node('div','wr-internal-note','Đây là bản xem trước. Chưa có phiếu nào được tạo trên Whose hoặc KiotViet.');
   const edit=node('button','wr-button','Chỉnh sửa bản nháp');edit.type='button';edit.onclick=()=>openDraft(true);
   thread.append(info,box,warning,edit);
  }else{
   const placeholder=node('div','wr-thread-placeholder');
   placeholder.append(node('span','','↔'),node('h3','','Hai bộ phận, một hộp thoại chung'),node('p','','Cửa hàng gửi thẻ SKU và lý do. Kho tiếp nhận, soạn và bàn giao; cửa hàng ghi nhận bán hoặc hoàn trả. Chỉ hiển thị giao dịch thực tế sau khi backend nội bộ được triển khai.'));
   thread.append(placeholder);
  }
  el('wrThreadName').textContent='Cửa hàng ↔ Kho';
  el('wrThreadSubtitle').textContent=branch?.name||'Chọn kho thao tác';
  el('wrCount').textContent='Chưa kích hoạt';
 }
 function hideSuggestions(){const p=el('wrProductResults');if(p){p.hidden=true;p.replaceChildren()}}
 function openDraft(edit=false){
  if(!active()||!(role==='store'||['admin','manager'].includes(currentRole())))return;
  el('wrForm').reset();el('wrFormStatus').textContent='Đây là bản nháp thử giao diện, không gửi dữ liệu vào Whose.';
  el('wrModalContext').textContent=(active()?.name||'Kho thao tác')+' · Cửa hàng gửi Kho';
  if(edit&&draft&&draft.branchId===active()?.id){el('wrSku').value=draft.sku;el('wrQty').value=draft.qty;el('wrNote').value=draft.note}
  hideSuggestions();el('wrNewModal').hidden=false;el('wrSku').focus();
 }
 function closeDraft(){el('wrNewModal').hidden=true;hideSuggestions()}
 async function productSearch(query){
  if(searchController)searchController.abort();
  if(query.length<2){hideSuggestions();return}
  const controller=new AbortController();searchController=controller;
  try{
   const token=await window.whoseAccessToken?.();if(!token)return;
   const r=await fetch('/api/kiot-products?'+new URLSearchParams({view:'catalog',page:'0',q:query}),{headers:{Authorization:'Bearer '+token},signal:controller.signal,cache:'no-store'});
   if(!r.ok)throw Error('Không thể đọc danh mục');
   const data=await r.json();if(controller.signal.aborted)return;
   const suggestions=el('wrProductResults');suggestions.replaceChildren();
   for(const p of (data.rows||[]).slice(0,8)){
    if(!p.sku)continue;
    const b=node('button','wr-product-option');b.type='button';b.setAttribute('role','option');
    const pic=node('img');if(typeof p.imageUrl==='string'&&p.imageUrl.startsWith('https://')){pic.src=p.imageUrl;pic.alt='';pic.loading='lazy'}else pic.hidden=true;
    const detail=node('span');detail.append(node('strong','',p.name||p.sku),node('small','',p.sku));
    b.append(pic,detail);b.onclick=()=>{el('wrSku').value=p.sku;el('wrSelectedProduct').textContent=p.name||p.sku;hideSuggestions();el('wrQty').focus()};
    suggestions.append(b);
   }
   suggestions.hidden=!suggestions.children.length;
  }catch(e){if(e.name!=='AbortError')hideSuggestions()}
 }
 function submit(event){
  event.preventDefault();
  const branch=active(),sku=el('wrSku').value.trim(),qty=Number(el('wrQty').value),note=el('wrNote').value.trim();
  if(!branch||!sku||!note||!Number.isInteger(qty)||qty<1||qty>1000000){el('wrFormStatus').textContent='Nhập SKU, số lượng hợp lệ và lý do gọi hàng.';return}
  draft={branchId:branch.id,sku,qty,note};closeDraft();render();
 }
 function onWarehouseChange(){
  if(!initialized)return;
  closeDraft();draft=null;
  if(!['admin','manager'].includes(currentRole()))role=currentRole()==='warehouse'?'warehouse':'store';
  render();
 }
 async function init(){
  if(initialized)return;if(initPromise)return initPromise;
  initPromise=(async()=>{
   const mount=el('wrMount');const r=await fetch('/calling-chat.html',{cache:'no-store'});if(!r.ok)throw Error('Không tải được giao diện');
   mount.innerHTML=await r.text();
   for(const id of ['wrNew','wrComposeNew'])el(id).onclick=()=>openDraft();
   for(const id of ['wrClose','wrCancel','wrModalBackdrop'])el(id).onclick=closeDraft;
   el('wrForm').addEventListener('submit',submit);
   el('wrRoleStore').onclick=()=>{if(['admin','manager'].includes(currentRole())){role='store';render()}};
   el('wrRoleWarehouse').onclick=()=>{if(['admin','manager'].includes(currentRole())){role='warehouse';render()}};
   el('wrSku').addEventListener('input',()=>{el('wrSelectedProduct').textContent='Danh mục sản phẩm Whose đã đồng bộ KiotViet';clearTimeout(searchTimer);searchTimer=setTimeout(()=>void productSearch(el('wrSku').value.trim()),260)});
   el('wrSku').addEventListener('keydown',e=>{if(e.key==='Escape')hideSuggestions()});
   document.addEventListener('pointerdown',e=>{if(!e.target.closest('.wr-sku-field'))hideSuggestions()});
   document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!el('wrNewModal').hidden)closeDraft()});
   window.addEventListener('whose:warehouse-change',onWarehouseChange);
   initialized=true;render();
  })();
  try{await initPromise}catch(e){initPromise=null;throw e}
 }
 window.whoseCallingOpen=async()=>{
  try{await init();el('wrMount').hidden=false;el('wrPage').hidden=false;document.querySelector('.products-page').hidden=true;render();return true}
  catch(e){console.error('[Whose/departments]',e);return false}
 };
 window.whoseCallingClose=()=>{const page=el('wrPage');if(page)page.hidden=true;el('wrMount').hidden=true;document.querySelector('.products-page').hidden=false;closeDraft()};
})();
