'use strict';
(()=>{
 let initialized=false,starting=null,mode='store',filter='open',rows=[],currentId=null,detail=null,pulling=false,working=false;
 let busy=false,seq=0,authEpoch=0,latestSignature='',lastListSignature='',timer=null,searchTimer=null,searchAbort=null,cart=[],idempotency=null,createMode='new',suggestions=[],suggestionIndex=0,searchGeneration=0,searchCache=new Map(),pendingAction=null,mobilePane='inbox';
 const el=id=>document.getElementById(id);
 const node=(tag,cls,t)=>{const x=document.createElement(tag);if(cls)x.className=cls;if(t!==undefined)x.textContent=String(t);return x};
 const branch=()=>window.whoseWarehouse?.()||null;
 const requestType=()=>window.WhoseRequestType;
 const session=()=>window.whoseSession?.()||null;
 const num=x=>Number(x||0).toLocaleString('vi-VN');
 const fmt=x=>{const d=new Date(x);return Number.isNaN(d.getTime())?'—':d.toLocaleString('vi-VN',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})};
 const labels={submitted:'Chờ kho nhận',accepted:'Kho đã nhận',picking:'Đang soạn',ready:'Chờ bàn giao',handed_over:'Đã giao · chờ nhận',received:'Cửa hàng đang giữ',return_requested:'Chờ kho nhận trả',completed:'Hoàn tất',cancelled:'Đã hủy'};
 const events={created:'Cửa hàng gọi hàng',added_sku:'Cửa hàng bổ sung sản phẩm',claim:'Kho tiếp nhận',pick:'Kho vừa soạn',ready:'Kho báo soạn xong',handoff:'Kho đã bàn giao',receive:'Cửa hàng xác nhận nhận',request_return:'Cửa hàng gửi trả',receive_return:'Kho đã nhận hàng trả',cancel:'Hủy yêu cầu',note:'Ghi chú'};
 const roles=()=>{
  const s=session(),b=branch();return s&&b?requestType().perspectives(s,b.id):[];
 };
 function showPane(next){
  if(!['inbox','chat','detail'].includes(next))return;
  mobilePane=next;
  const page=el('wcPage');if(!page)return;
  page.dataset.mobilePane=next;
  el('wcMobileNav')?.querySelectorAll('[data-wc-pane]').forEach(button=>{
   const current=button.dataset.wcPane===next;
   if(current)button.setAttribute('aria-current','step');else button.removeAttribute('aria-current');
   button.disabled=button.dataset.wcPane!=='inbox'&&!currentId;
  });
 }
 function setMode(next){
  const available=roles();if(!available.includes(next))return;
  mode=next;paintRole();paintChat();
 }
 function paintRole(){
  const allowed=roles();if(!allowed.includes(mode))mode=allowed[0]||'store';
  for(const name of ['store','warehouse']){
   const button=el(name==='store'?'wcRoleStore':'wcRoleWarehouse');
   button.classList.toggle('active',mode===name);
   button.disabled=!allowed.includes(name);
   button.setAttribute('aria-pressed',String(mode===name));
  }
  const store=allowed.includes('store');
  el('wcNew').disabled=!store||!branch();
  el('wcNoteInput').disabled=!detail;
  el('wcSendNote').disabled=!detail;
 }
 async function http(query={},post){
  const token=await window.whoseAccessToken?.();
  if(!token)throw Error('Phiên đăng nhập đã hết hạn');
  const response=await fetch('/api/whose-chat'+(post?'':'?'+new URLSearchParams(query)),{
   method:post?'POST':'GET',
   headers:{Authorization:'Bearer '+token,...(post?{'Content-Type':'application/json'}:{})},
   body:post?JSON.stringify(post):undefined,cache:'no-store'
  });
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(result.error||'Không thể kết nối Whose');
  return result;
 }
 const status=message=>{if(el('wcSyncLabel'))el('wcSyncLabel').textContent=message};
 const fits=row=>filter==='all'||(filter==='done'?['completed','cancelled'].includes(row.status):!['completed','cancelled'].includes(row.status));
 function paintInbox(force=false){
  const q=el('wcSearch').value.trim().toLowerCase();
  const selection=rows.filter(r=>fits(r)&&(!q||[r.id,r.purpose,labels[r.status],r.status].join(' ').toLowerCase().includes(q)));
  const signature=JSON.stringify([currentId,filter,q,selection.map(r=>[r.id,r.status,r.updated_at,r.purpose])]);
  if(signature===lastListSignature&&!force)return;
  lastListSignature=signature;
  const holder=el('wcInboxList'),top=holder.scrollTop;holder.replaceChildren();el('wcCount').textContent=num(selection.length);
  if(!selection.length){holder.append(node('div','wc-empty-list',rows.length?'Không có hội thoại phù hợp bộ lọc.':'Chưa có yêu cầu nội bộ. Cửa hàng có thể bắt đầu cuộc hội thoại đầu tiên.'));return}
  const frag=document.createDocumentFragment();
  for(const r of selection){
   const button=node('button','wc-conversation'+(r.id===currentId?' is-selected':''));button.type='button';button.setAttribute('aria-label','Mở yêu cầu '+r.id.slice(0,8));
   const avatar=node('span','wc-conversation-avatar','↗'),body=node('span','wc-conversation-body');
   body.append(node('strong','','#'+r.id.slice(0,8).toUpperCase()));
   const classification=requestType().classify(r.purpose);
   const kind=node('span','wc-request-type',classification.label);kind.dataset.type=classification.kind;body.append(kind);
   if(r.priority==='urgent')body.append(node('span','wc-priority-tag','Gấp · ưu tiên'));
   const meta=node('span','wc-conversation-meta'),tag=node('span','wc-mini-status',labels[r.status]||r.status);tag.dataset.status=r.status;meta.append(tag,node('small','',fmt(r.updated_at)));body.append(meta,node('p','',r.purpose));
   button.append(avatar,body);button.onclick=()=>void select(r.id,{focus:true});frag.append(button);
  }
  holder.append(frag);holder.scrollTop=top;
 }
 const productThumb=prod=>{
  const wrapper=node('div','wc-rail-product-thumb','▣');
  const raw=prod?.attributes?.kiotviet?.thumbnail;
  if(typeof raw==='string'&&raw.startsWith('https://')){
   const img=node('img');img.alt='';img.loading='lazy';img.src=raw;img.onerror=()=>wrapper.replaceChildren(node('span','','▣'));wrapper.replaceChildren(img);
  }return wrapper;
 };
 function paintRail(){
  const d=detail,meta=el('wcRailMeta'),products=el('wcRailLines');meta.replaceChildren();products.replaceChildren();
  if(!d){el('wcRailTitle').textContent='Chưa chọn hội thoại';el('wcRailNote').textContent='Chọn hội thoại để xem số lượng, sản phẩm và các thao tác.';el('wcLineCount').textContent='0 SKU';products.append(node('div','wc-rail-empty','Danh sách sản phẩm sẽ xuất hiện tại đây.'));return}
  const r=d.thread,lines=d.lines||[];
  el('wcRailTitle').textContent='#'+r.id.slice(0,8).toUpperCase();
  const typed=requestType().classify(r.purpose);
  el('wcRailNote').textContent=typed.label+' · '+typed.note;
  el('wcLineCount').textContent=lines.length+' SKU';
  const requested=lines.reduce((sum,x)=>sum+Number(x.qty_requested||0),0),picked=lines.reduce((sum,x)=>sum+Number(x.qty_picked||0),0);
  for(const [name,value] of [['Yêu cầu',num(requested)],['Đã soạn',num(picked)],['Ưu tiên',r.priority==='urgent'?'Gấp':'Bình thường'],['Tạo lúc',fmt(r.created_at)]]){
   const item=node('span');item.append(node('small','',name),node('strong','',value));meta.append(item);
  }
  for(const row of lines){
   const card=node('article','wc-rail-product'),top=node('div','wc-rail-product-top'),copy=node('div','wc-rail-product-info');
   copy.append(node('strong','',row.sku),node('small','',row.product_name));
   top.append(productThumb(row.product),copy);card.append(top);
   const counts=node('div','wc-rail-product-stats');
   for(const [label,v] of [['Gọi',row.qty_requested],['Soạn',row.qty_picked],['Giao',row.qty_handed],['Giữ',Math.max(0,row.qty_received-row.qty_returned)],['Đã trả',row.qty_returned]])if(Number(v)>0||label==='Gọi')counts.append(node('span','',label+' '+num(v)));
   card.append(counts);
   const actions=node('div','wc-rail-product-actions');
   const s=r.status;
   let kind='',limit=0,actionLabel='';
   if(mode==='warehouse'&&['accepted','picking'].includes(s)){kind='pick';limit=row.qty_requested-row.qty_picked;actionLabel='Ghi nhận soạn'}
   if(mode==='store'&&['received','return_requested'].includes(s)){kind='request_return';limit=row.qty_received-row.qty_return_requested;actionLabel='Trả kho'}
   if(mode==='warehouse'&&s==='return_requested'){kind='receive_return';limit=row.qty_return_requested-row.qty_returned;actionLabel='Xác nhận nhập trả'}
   if(kind&&limit>0){
    const qty=node('input');qty.type='number';qty.min='1';qty.max=String(limit);qty.step='1';qty.value=String(Math.min(limit,1));qty.setAttribute('aria-label','Số lượng '+row.sku);
    const btn=node('button','',actionLabel);btn.type='button';
    btn.onclick=()=>{const quantity=Number(qty.value);if(!Number.isInteger(quantity)||quantity<1||quantity>limit){status('Số lượng không hợp lệ');return}void act(kind,row.id,quantity)};
    actions.append(qty,btn);card.append(actions);
   }
   products.append(card);
  }
 }
 function paintChat(){
  paintRole();
  paintRail();
  const host=el('wcMessages');
  const atEnd=host.scrollHeight-host.scrollTop-host.clientHeight<110,oldTop=host.scrollTop;
  host.replaceChildren();
  if(!detail){
   const placeholder=node('div','wc-chat-placeholder');
   placeholder.append(node('div','wc-placeholder-icon','↔'),node('strong','','Một hộp chat cho hai bộ phận'),node('p','','Nhân viên cửa hàng gọi sản phẩm; nhân viên kho tiếp nhận, soạn, giao và nhận trả. Mọi thao tác đều có dấu vết.'));
   host.append(placeholder);
   el('wcChatTitle').textContent='Cửa hàng ↔ Kho';el('wcChatSub').textContent=branch()?.name||'Chọn kho thao tác';
   el('wcChatStatus').textContent='Chưa chọn';
   el('wcChatActions').replaceChildren();
   return;
  }
  const d=detail,r=d.thread,me=session()?.user?.id;
  el('wcChatTitle').textContent='#'+r.id.slice(0,8).toUpperCase()+' · Cửa hàng ↔ Kho';
  el('wcChatSub').textContent=(branch()?.name||'')+' · '+fmt(r.created_at);
  el('wcChatStatus').textContent=labels[r.status]||r.status;
  host.append(node('div','wc-day-label','LỊCH SỬ YÊU CẦU · '+fmt(r.created_at)));
  if(d.historyTruncated)host.append(node('div','wc-empty-list','Chỉ hiển thị 500 sự kiện gần nhất; lịch sử cũ hơn chưa được tải. Không dùng màn này để kết luận đã có đủ lịch sử.'));
  for(const e of d.events||[]){
   const isMine=e.actor_id===me,outer=node('div','wc-bubble-wrap'+(isMine?' is-self':'')),bubble=node('div','wc-bubble');
   const head=node('div','wc-bubble-head');head.append(node('strong','',isMine?'Bạn':e.event_type==='created'||e.event_type==='receive'||e.event_type==='request_return'?'Cửa hàng / nhân viên':'Kho / nhân viên'),node('time','',fmt(e.created_at)));
   bubble.append(head,node('div','wc-bubble-title',events[e.event_type]||e.event_type));
   if(e.body)bubble.append(node('p','',e.body));
   if(e.event_type==='created'){
    const cards=node('div','wc-bubble-lines');
    cards.append(node('small','','DANH SÁCH SKU HIỆN TẠI'));
    for(const line of d.lines||[]){
     const item=node('div','wc-bubble-line'),label=node('div');label.append(node('strong','',line.sku),node('small','',line.product_name));item.append(label,node('span','','×'+num(line.qty_requested)));cards.append(item);
    }
    bubble.append(cards);
   }
   if(e.event_type==='added_sku'&&e.qty)bubble.append(node('p','','Tổng bổ sung: '+num(e.qty)+' sản phẩm'));
   if(e.line_id){
    const line=(d.lines||[]).find(x=>x.id===e.line_id);
    if(line)bubble.append(node('p','','SKU '+line.sku+(e.qty?' · SL '+num(e.qty):'')));
   }
   outer.append(bubble);host.append(outer);
  }
  if(!d.events?.length)host.append(node('div','wc-empty-list','Chưa có lịch sử xác minh.'));
  paintActions(r);
  host.scrollTop=atEnd||oldTop===0?host.scrollHeight:oldTop;
 }
 function paintActions(r){
  const actions=el('wcChatActions');actions.replaceChildren();
  const add=(name,kind,style)=>{const button=node('button','wc-action-button'+(style?' '+style:''),name);button.type='button';button.disabled=busy;button.onclick=()=>void act(kind);actions.append(button)};
  if(mode==='warehouse'){
   if(r.status==='submitted')add('Nhận yêu cầu','claim');
   if(['accepted','picking'].includes(r.status))add('Soạn xong / chờ giao','ready');
   if(r.status==='ready')add('Xác nhận bàn giao','handoff');
  }else{
   if(['submitted','accepted','picking'].includes(r.status)){const more=node('button','wc-action-button','+ Thêm SKU vào chat');more.type='button';more.onclick=()=>openNew('add');actions.append(more)}
   if(r.status==='handed_over')add('Xác nhận đã nhận hàng','receive');
   if(r.status==='submitted'&&r.requester_id===session()?.user?.id)add('Hủy yêu cầu','cancel','danger');
  }
  if(['completed','cancelled'].includes(r.status))el('wcNoteInput').placeholder='Cuộc hội thoại đã đóng';
  else el('wcNoteInput').placeholder='Nhắn ghi chú nghiệp vụ cho '+(mode==='store'?'kho':'cửa hàng')+'…';
 }
 async function select(id,{force=false,focus=false}={}){
  const b=branch();if(!b||!id)return;
  const request=++seq,epoch=authEpoch;const changed=currentId!==id;
  currentId=id;if(focus)showPane('chat');else showPane(mobilePane);paintInbox();
  if(changed){detail=null;latestSignature='';paintChat();status('Đang mở hội thoại…')}
  try{
   const data=await http({chat_id:id});if(request!==seq||epoch!==authEpoch||branch()?.id!==b.id)return;
   if(data.thread.branch_id!==b.id)return;
   const signature=JSON.stringify([data.thread.status,data.thread.updated_at,data.lines.map(x=>[x.id,x.qty_picked,x.qty_handed,x.qty_received,x.qty_return_requested,x.qty_returned]),data.events.map(e=>e.id)]);
   if(!force&&signature===latestSignature)return;
   latestSignature=signature;detail=data;paintChat();status('Đã cập nhật · '+new Date().toLocaleTimeString('vi-VN'));
  }catch(e){if(request!==seq||epoch!==authEpoch)return;status('Không đọc được hội thoại: '+e.message)}
 }
 async function refresh(quiet=false){
  if(pulling)return;const b=branch();if(!b)return status('Chưa chọn kho thao tác');
  const epoch=authEpoch;
  pulling=true;if(!quiet)status('Đang đồng bộ…');
  try{
   const response=await http({branch_id:b.id});
   if(epoch!==authEpoch||branch()?.id!==b.id)return;
   rows=requestType().sortedQueue(response.rows||[]);
   paintInbox();
   if(currentId&&rows.some(x=>x.id===currentId))await select(currentId);
   else if(rows.length){const first=rows.find(x=>!['completed','cancelled'].includes(x.status))||rows[0];await select(first.id)}
   else{currentId=null;detail=null;latestSignature='';paintChat();status('Chưa có yêu cầu nội bộ')}
   if(!currentId)status('Đã cập nhật · '+new Date().toLocaleTimeString('vi-VN'));
  }catch(e){if(epoch!==authEpoch)return;status('Lỗi kết nối: '+e.message);if(!quiet)el('wcInboxList').replaceChildren(node('div','wc-empty-list','Không tải được yêu cầu. '+e.message))}
  finally{pulling=false;if(epoch===authEpoch&&branch()?.id&&branch().id!==b.id)void refresh(true)}
 }
 async function act(kind,lineId=null,qty=null){
  if(!detail||busy)return;
  let note=el('wcNoteInput').value.trim();
  if(kind==='ready'){
   const remaining=(detail.lines||[]).reduce((a,l)=>a+l.qty_requested-l.qty_picked,0);
   if(remaining>0&&!note){status('Còn hàng chưa soạn: nhập lý do vào ô ghi chú trước khi bấm Soạn xong');el('wcNoteInput').focus();return}
  }
  if(kind==='cancel'&&note.length<3){status('Nhập lý do hủy vào ô ghi chú trước khi hủy');el('wcNoteInput').focus();return}
  if(kind==='note'&&!note)return;
  const before=detail.thread.id,b=branch()?.id,actor=session()?.user?.id,epoch=authEpoch;
  // Preserve the same operation token after an uncertain network result. A retry
  // must not record a second pick, handoff, receipt or return in Supabase.
  const signature=JSON.stringify([before,kind,lineId,qty,note]);
  if(!pendingAction||pendingAction.signature!==signature)pendingAction={signature,key:crypto.randomUUID()};
  const token=pendingAction.key;
  busy=true;paintActions(detail.thread);el('wcSendNote').disabled=true;status('Đang ghi nhận '+(events[kind]||kind)+'…');
  let committed=false;
  try{
   const response=await http({}, {action:'act',chat_id:before,kind,line_id:lineId,qty,note:note||null,idempotency_key:token});
   committed=true;
   if(epoch!==authEpoch||branch()?.id!==b||session()?.user?.id!==actor)return;
   pendingAction=null;
   el('wcNoteInput').value='';
   // The commit is authoritative. Do not block acknowledgement on a full workspace reload.
   if(detail?.thread?.id===before&&response.result?.status){
    detail.thread={...detail.thread,status:response.result.status,updated_at:new Date().toISOString()};paintChat();
   }
   status('Đã ghi nhận · '+new Date().toLocaleTimeString('vi-VN'));
   void select(before,{force:true}).then(()=>refresh(true));
  }catch(e){
   if(epoch!==authEpoch)return;
   if(committed){status('Thao tác đã ghi nhận, nhưng chưa cập nhật giao diện. Hãy làm mới để xem dữ liệu mới.');}
   else status('Chưa xác nhận kết quả: '+e.message+' · Bấm lại sẽ dùng cùng mã thao tác để tránh ghi trùng.');
  }
  finally{busy=false;if(epoch===authEpoch&&detail)paintActions(detail.thread);el('wcSendNote').disabled=!detail}
 }
 function closeNew(){el('wcCreateOverlay').hidden=true;hideSuggestions()}
 function hideSuggestions(){
  clearTimeout(searchTimer);searchGeneration++;if(searchAbort)searchAbort.abort();searchAbort=null;
  suggestions=[];suggestionIndex=0;
  const host=el('wcSuggestions');if(host){host.hidden=true;host.replaceChildren()}
  const field=el('wcProductSearch');if(field){field.setAttribute('aria-expanded','false');field.removeAttribute('aria-activedescendant')}
 }
 function searchFeedback(message){
  const label=el('wcSearchFeedback');if(label)label.textContent=message;
 }
 function addProduct(p){
  if(!p||!p.sku)return;
  const same=cart.find(item=>item.sku===p.sku);
  if(same){
   if(same.qty<1000000)same.qty+=1;
   else{searchFeedback('Đã đạt số lượng tối đa cho SKU này');return}
  }else if(cart.length<40)cart.push({sku:p.sku,name:p.name||p.sku,qty:1,imageUrl:p.imageUrl||null});
  else{searchFeedback('Một yêu cầu chứa tối đa 40 SKU');return}
  paintCart();
  const field=el('wcProductSearch');field.value='';hideSuggestions();
  searchFeedback('Đã thêm '+p.sku+' · tiếp tục tìm sản phẩm khác');
  field.focus();
 }
 function paintSuggestions(products){
  suggestions=(products||[]).filter(p=>p&&p.sku);
  suggestionIndex=0;
  const host=el('wcSuggestions'),field=el('wcProductSearch');
  host.replaceChildren();
  if(!suggestions.length){
   host.hidden=true;field.setAttribute('aria-expanded','false');
   searchFeedback('Không tìm thấy sản phẩm phù hợp trong danh mục Whose');
   return;
  }
  suggestions.forEach((p,i)=>{
   const button=node('button','wc-suggestion');button.type='button';button.setAttribute('role','option');
   button.id='wcSuggestion'+i;button.setAttribute('aria-selected',String(i===0));
   const thumb=node('span','wc-suggestion-thumb');
   if(p.imageUrl&&p.imageUrl.startsWith('https://')){
    const image=node('img');image.src=p.imageUrl;image.alt='';image.loading='lazy';
    image.onerror=()=>thumb.replaceChildren(node('span','','▣'));thumb.append(image);
   }else thumb.append(node('span','','▣'));
   const info=node('span','wc-suggestion-copy');
   const sku=node('strong','',p.sku),name=node('small','',p.name||p.sku);
   info.append(sku,name);
   const action=node('span','wc-suggestion-add',cart.some(x=>x.sku===p.sku)?'+1':'+ Thêm');
   button.append(thumb,info,action);
   button.onclick=()=>addProduct(p);
   button.onmouseenter=()=>highlightSuggestion(i);
   host.append(button);
  });
  host.hidden=false;field.setAttribute('aria-expanded','true');
  highlightSuggestion(0);
  searchFeedback(suggestions.length+' sản phẩm phù hợp · ↑↓ để chọn, Enter để thêm');
 }
 function highlightSuggestion(i){
  if(!suggestions.length)return;
  suggestionIndex=(i+suggestions.length)%suggestions.length;
  const host=el('wcSuggestions');
  [...host.children].forEach((x,j)=>{const active=j===suggestionIndex;x.classList.toggle('is-highlighted',active);x.setAttribute('aria-selected',String(active))});
  el('wcProductSearch').setAttribute('aria-activedescendant','wcSuggestion'+suggestionIndex);
 }
 function paintCart(){
  const holder=el('wcCart');holder.replaceChildren();el('wcCartCount').textContent=cart.length+' SKU';
  if(!cart.length){holder.append(node('div','wc-cart-empty','Tìm sản phẩm ở trên để thêm nhiều SKU vào cùng một yêu cầu.'));return}
  for(const p of cart){
   const row=node('div','wc-cart-row'),label=node('span');
   label.append(node('strong','',p.sku),node('small','',p.name||'Sản phẩm'));
   const quantity=node('input');quantity.type='number';quantity.min='1';quantity.max='1000000';quantity.step='1';quantity.value=p.qty;quantity.setAttribute('aria-label','Số lượng '+p.sku);
   quantity.onchange=()=>{p.qty=Number(quantity.value)||0};
   const remove=node('button','','×');remove.type='button';remove.title='Bỏ '+p.sku;remove.onclick=()=>{cart=cart.filter(x=>x.sku!==p.sku);paintCart()};
   row.append(label,quantity,remove);holder.append(row);
  }
 }
 function openNew(next='new'){
  if(!roles().includes('store')||!branch())return;
  if(next==='add'&&(!detail||!['submitted','accepted','picking'].includes(detail.thread.status)))return;
  createMode=next;cart=[];idempotency=crypto.randomUUID();el('wcCreateForm').reset();el('wcFormError').textContent='';
  el('wcCreateBranch').textContent=branch().name+' · Cửa hàng → Kho';
  el('wcCreateTitle').textContent=next==='add'?'Bổ sung SKU vào hội thoại':'Gọi hàng mới';
  el('wcPurposeTypeLabel').hidden=next==='add';
  el('wcSubmitCreate').textContent=next==='add'?'Bổ sung vào chat':'Gửi yêu cầu cho kho';
  const priority=el('wcPriority').closest('label');if(priority)priority.hidden=next==='add';
  paintCart();hideSuggestions();el('wcCreateOverlay').hidden=false;searchFeedback('Nhập tên, SKU hoặc quét barcode; dùng Enter để thêm nhanh');el('wcProductSearch').focus();
 }
 async function suggest(raw){
  const query=String(raw||'').normalize('NFC').trim().slice(0,90);
  const ticket=++searchGeneration;
  if(searchAbort)searchAbort.abort();
  if(query.length<2){suggestions=[];el('wcSuggestions').hidden=true;searchFeedback(query?'Nhập thêm để tìm sản phẩm nhanh':'Nhập tên, SKU hoặc quét barcode');return []}
  const cacheKey=query.toLocaleLowerCase('vi-VN');
  const cached=searchCache.get(cacheKey);
  if(cached){paintSuggestions(cached);return cached}
  const controller=new AbortController();searchAbort=controller;
  searchFeedback('Đang tìm sản phẩm…');
  try{
   const token=await window.whoseAccessToken?.();if(!token)throw Error('Phiên đăng nhập đã hết hạn');
   if(ticket!==searchGeneration||controller.signal.aborted)return [];
   const response=await fetch('/api/product-quick-search?'+new URLSearchParams({q:query}),{
    headers:{Authorization:'Bearer '+token},cache:'no-store',signal:controller.signal
   });
   if(!response.ok)throw Error('Không thể tra cứu danh mục Whose');
   const data=await response.json();
   if(ticket!==searchGeneration||controller.signal.aborted||el('wcCreateOverlay').hidden)return [];
   const list=Array.isArray(data.rows)?data.rows:[];
   searchCache.set(cacheKey,list);
   if(searchCache.size>65)searchCache.delete(searchCache.keys().next().value);
   paintSuggestions(list);
   return list;
  }catch(e){
   if(e.name==='AbortError'||ticket!==searchGeneration)return [];
   searchFeedback('Tìm kiếm tạm thời gián đoạn. Hãy thử lại.');
   el('wcSuggestions').hidden=true;
   return [];
  }
 }
 async function create(e){
  e.preventDefault();if(busy)return;
  const b=branch(),purpose=el('wcPurpose').value.trim(),priority=el('wcPriority').value,actor=session()?.user?.id,epoch=authEpoch;
  if(!b||!roles().includes('store'))return;
  const lines=cart.map(x=>({sku:x.sku,qty:Number(x.qty)}));
  if(!lines.length||lines.some(x=>!Number.isInteger(x.qty)||x.qty<1||x.qty>1000000)||purpose.length<3){el('wcFormError').textContent='Thêm ít nhất một SKU, kiểm tra số lượng và nhập mục đích gọi hàng.';return}
  busy=true;el('wcSubmitCreate').disabled=true;el('wcFormError').textContent='';
  try{
   if(createMode==='add'){
    if(!currentId)throw Error('Chưa chọn hội thoại');
    const id=currentId;await http({}, {action:'add',chat_id:id,lines,note:purpose,idempotency_key:idempotency});
    if(epoch!==authEpoch||session()?.user?.id!==actor||branch()?.id!==b.id)return;
    closeNew();cart=[];await refresh();await select(id,{force:true});
   }else{
    const fullPurpose=requestType().formatPurpose(el('wcPurposeType').value,purpose);
    const out=await http({}, {action:'create',branch_id:b.id,lines,purpose:fullPurpose,priority,idempotency_key:idempotency});
    if(epoch!==authEpoch||session()?.user?.id!==actor||branch()?.id!==b.id)return;
    closeNew();cart=[];currentId=out.id;lastListSignature='';await refresh();await select(out.id,{force:true});
   }
  }catch(error){if(epoch===authEpoch)el('wcFormError').textContent=error.message}
  finally{busy=false;if(epoch===authEpoch)el('wcSubmitCreate').disabled=false}
 }
 function warehouseChanged(){
  if(!initialized)return;
  seq++;rows=[];currentId=null;detail=null;latestSignature='';lastListSignature='';pendingAction=null;closeNew();showPane('inbox');
  el('wcBranchName').textContent=(branch()?.name||'Chưa chọn kho thao tác')+' · Cửa hàng ↔ Kho';
  paintInbox(true);paintChat();void refresh();
 }
 async function init(){
  if(initialized)return;
  if(starting)return starting;
  starting=(async()=>{
   const res=await fetch('/calling-chat-box.html',{cache:'no-store'});
   if(!res.ok)throw Error('Không tải được giao diện chat');
   el('wrMount').innerHTML=await res.text();
   el('wcNew').onclick=()=>openNew('new');el('wcRefresh').onclick=()=>void refresh();
   el('wcMobileNav').querySelectorAll('[data-wc-pane]').forEach(button=>button.onclick=()=>showPane(button.dataset.wcPane));
   showPane('inbox');
   el('wcCreateForm').addEventListener('submit',e=>void create(e));
   for(const id of ['wcCloseCreate','wcModalBackdrop','wcCancelCreate'])el(id).onclick=closeNew;
   el('wcNoteForm').addEventListener('submit',e=>{e.preventDefault();void act('note')});
   el('wcNoteInput').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();void act('note')}});
   el('wcSearch').oninput=()=>paintInbox(true);
   document.querySelectorAll('.wc-filter-bar button').forEach(btn=>btn.onclick=()=>{
    filter=btn.dataset.filter;document.querySelectorAll('.wc-filter-bar button').forEach(x=>x.classList.toggle('active',x===btn));paintInbox(true);
   });
   el('wcRoleStore').onclick=()=>setMode('store');el('wcRoleWarehouse').onclick=()=>setMode('warehouse');
   el('wcProductSearch').oninput=()=>{
    clearTimeout(searchTimer);
    const text=el('wcProductSearch').value.trim();
    searchGeneration++;if(searchAbort)searchAbort.abort();
    if(text.length<2){hideSuggestions();searchFeedback('Nhập ít nhất 2 ký tự');return}
    searchTimer=setTimeout(()=>void suggest(text),140);
   };
   el('wcProductSearch').onkeydown=async e=>{
    if(e.key==='ArrowDown'||e.key==='ArrowUp'){
     e.preventDefault();if(suggestions.length&&!el('wcSuggestions').hidden)highlightSuggestion(suggestionIndex+(e.key==='ArrowDown'?1:-1));return;
    }
    if(e.key==='Escape'){e.preventDefault();hideSuggestions();return}
    if(e.key!=='Enter')return;
    e.preventDefault();
    const text=el('wcProductSearch').value.trim();
    if(!text)return;
    // Scanner may press Enter before the debounce timer has elapsed.
    clearTimeout(searchTimer);
    let list=suggestions;
    if(!list.length||el('wcSuggestions').hidden)list=await suggest(text);
    if(!list.length)return;
    const exact=list.find(p=>p.sku.toLowerCase()===text.toLowerCase()||p.barcode?.toLowerCase()===text.toLowerCase());
    addProduct(exact||list[suggestionIndex]||list[0]);
   };
   document.addEventListener('pointerdown',e=>{if(!e.target.closest('.wc-sku-field'))hideSuggestions()});
   document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!el('wcCreateOverlay').hidden)closeNew()});
   window.addEventListener('whose:warehouse-change',warehouseChanged);
   window.addEventListener('whose:logged-out',()=>{
    authEpoch++;busy=false;seq++;rows=[];currentId=null;detail=null;latestSignature='';lastListSignature='';pendingAction=null;
    searchCache.clear();closeNew();showPane('inbox');paintInbox(true);paintChat();
   });
   initialized=true;paintRole();paintChat();
   timer=setInterval(()=>{if(!document.hidden&&!el('wcPage').hidden&&!busy)void refresh(true)},11000);
  })();
  try{await starting}catch(e){starting=null;throw e}
 }
 window.whoseCallingOpen=async()=>{
  try{
   await init();el('wrMount').hidden=false;el('wcPage').hidden=false;
   const products=document.querySelector('.products-page');if(products)products.hidden=true;
   el('wcBranchName').textContent=(branch()?.name||'Chưa chọn kho thao tác')+' · Cửa hàng ↔ Kho';
   paintRole();await refresh();return true;
  }catch(e){console.error('[Whose/chat] failed',e);return false}
 };
 window.whoseCallingClose=()=>{
  const page=el('wcPage');if(page)page.hidden=true;
  const modal=el('wcCreateOverlay');if(modal)modal.hidden=true;
  const mount=el('wrMount');if(mount)mount.hidden=true;
  const products=document.querySelector('.products-page');if(products)products.hidden=false;
 };
})();
