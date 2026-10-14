'use strict';
// UI context only. Access is still enforced by Whose Auth/RLS and the request RPC.
(()=>{
 const root=document.getElementById('appRoot');
 const picker=document.getElementById('wsWarehousePicker');
 const toggle=document.getElementById('wsWarehouseToggle');
 const options=document.getElementById('wsWarehouseOptions');
 const top=document.getElementById('wsWarehouseTop');
 const title=document.getElementById('wsWarehouseName');
 const hint=document.getElementById('wsWarehouseHint');
 const topName=document.getElementById('wsWarehouseTopName');
 let allowed=[],selected=null,userKey='',ready=false;
 const canUse=id=>allowed.some(x=>x.id===id);
 const isMobile=()=>window.matchMedia('(max-width:800px)').matches;
 const storageKey=id=>'whose-active-warehouse-v1:'+id;
 window.whoseWarehouse=()=>window.whoseSession?.()?selected:null;
 window.whoseAllowedWarehouses=()=>window.whoseSession?.()?allowed.slice():[];
 function emit(){
  window.dispatchEvent(new CustomEvent('whose:warehouse-change',{detail:{warehouse:selected}}));
 }
 function close(restoreFocus=false){
  picker.classList.remove('is-open');toggle.setAttribute('aria-expanded','false');options.hidden=true;
  if(restoreFocus)toggle.focus();
 }
 function choose(id,notify=true){
  if(!canUse(id))return false;
  const next=allowed.find(x=>x.id===id);
  if(!next)return false;
  const changed=selected?.id!==id;selected=next;
  title.textContent=next.name;hint.textContent='Đang thao tác';
  topName.textContent=next.name;top.disabled=false;toggle.disabled=false;
  top.setAttribute('aria-label','Kho thao tác: '+next.name+'. Bấm để đổi kho');
  for(const option of options.children){
   const active=option.dataset.id===id;
   option.setAttribute('aria-selected',String(active));
   option.classList.toggle('is-selected',active);
   option.querySelector('.ws-warehouse-check').textContent=active?'✓':'';
  }
  try{if(userKey)sessionStorage.setItem(storageKey(userKey),id)}catch{}
  close();
  if(changed&&notify)emit();
  return true;
 }
 function open(){
  if(!allowed.length)return;
  options.hidden=false;picker.classList.add('is-open');toggle.setAttribute('aria-expanded','true');
  const selectedOption=[...options.children].find(x=>x.dataset.id===selected?.id);
  (selectedOption||options.firstElementChild)?.focus();
 }
 function render(){
  options.replaceChildren();
  for(const branch of allowed){
   const option=document.createElement('button');option.type='button';option.className='ws-warehouse-option';option.dataset.id=branch.id;
   option.setAttribute('role','option');option.setAttribute('aria-selected',String(selected?.id===branch.id));
   const icon=document.createElement('span');icon.className='ws-warehouse-option-icon';icon.textContent=branch.name.toUpperCase().includes('LVS')?'L':'N';
   const label=document.createElement('span');label.className='ws-warehouse-option-main';
   const name=document.createElement('strong');name.textContent=branch.name;
   const secondary=document.createElement('small');secondary.textContent=branch.kind==='store'?'Chi nhánh cửa hàng':'Kho thao tác';
   label.append(name,secondary);
   const check=document.createElement('span');check.className='ws-warehouse-check';check.textContent=selected?.id===branch.id?'✓':'';
   option.append(icon,label,check);
   if(selected?.id===branch.id)option.classList.add('is-selected');
   option.addEventListener('click',()=>{choose(branch.id);if(isMobile())document.getElementById('wsSidebarMobileClose')?.click()});
   options.append(option);
  }
 }
 function bootstrap(){
  const session=window.whoseSession?.();
  if(!session?.user?.id){
   userKey='';allowed=[];selected=null;
   title.textContent='Chưa đăng nhập';hint.textContent='Đăng nhập để chọn kho';topName.textContent='Chọn kho thao tác';
   top.disabled=true;toggle.disabled=true;options.replaceChildren();close();return;
  }
  userKey=session.user.id;
  const branches=Array.isArray(session.branches)?session.branches.filter(x=>x?.id&&x.is_active!==false):[];
  const memberships=new Set((session.memberships||[]).filter(x=>x&&x.branch_id).map(x=>x.branch_id));
  allowed=branches.filter(b=>session.is_global_admin===true||memberships.has(b.id));
  allowed.sort((a,b)=>a.name.localeCompare(b.name,'vi'));
  if(!allowed.length){
   selected=null;title.textContent='Chưa được cấp quyền kho';hint.textContent='Liên hệ quản trị viên';
   topName.textContent='Chưa có kho';toggle.disabled=true;top.disabled=true;options.replaceChildren();close();emit();return;
  }
  let persisted=null;
  try{persisted=sessionStorage.getItem(storageKey(userKey))}catch{}
  const requested=selected?.id&&canUse(selected.id)?selected.id:persisted&&canUse(persisted)?persisted:allowed[0].id;
  render();choose(requested,false);render();
  if(!ready||selected?.id!==requested)emit();
  else emit(); // sync dependent screens after login refresh
  ready=true;
 }
 toggle.addEventListener('click',()=>{
  if(root.classList.contains('ws-is-collapsed')&&!isMobile())document.getElementById('wsCollapseToggle')?.click();
  if(options.hidden)open();else close();
 });
 top.addEventListener('click',()=>{
  if(!allowed.length)return;
  if(isMobile()){document.getElementById('wsSidebarMobileOpen')?.click()}
  else if(root.classList.contains('ws-is-collapsed'))document.getElementById('wsCollapseToggle')?.click();
  if(options.hidden)open();else close();
 });
 document.addEventListener('pointerdown',e=>{if(!picker.contains(e.target)&&!top.contains(e.target))close()});
 document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&!options.hidden){e.preventDefault();close(true)}
  if((e.key==='ArrowDown'||e.key==='ArrowUp')&&!options.hidden&&options.contains(document.activeElement)){
   e.preventDefault();
   const list=[...options.children],index=list.indexOf(document.activeElement);
   list[(index+(e.key==='ArrowDown'?1:-1)+list.length)%list.length]?.focus();
  }
 });
 window.addEventListener('whose:authenticated',bootstrap);
 window.addEventListener('whose:logged-out',bootstrap);
 bootstrap();
})();
