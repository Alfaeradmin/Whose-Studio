'use strict';
(()=>{
 const root=document.getElementById('appRoot');
 const sidebar=document.getElementById('wsSidebar');
 const products=document.getElementById('wsNavProducts');
 const calling=document.getElementById('wsNavCalling');
 const pageTitle=document.getElementById('wsPageTitle');
 const pageSubtitle=document.getElementById('wsPageSubtitle');
 const collapse=document.getElementById('wsCollapseToggle');
 const openButton=document.getElementById('wsSidebarMobileOpen');
 const closeButton=document.getElementById('wsSidebarMobileClose');
 const scrim=document.getElementById('wsMobileScrim');
 let active='products',busy=false;
 function isMobile(){return window.matchMedia('(max-width:800px)').matches}
 function setMobileOpen(open){
  root.classList.toggle('ws-mobile-open',open);
  scrim.hidden=!open;
  openButton.setAttribute('aria-expanded',String(open));
  sidebar.setAttribute('aria-hidden',String(!open&&isMobile()));
  if(open)closeButton.focus();
  else if(isMobile())openButton.focus();
 }
 function setCollapse(next){
  root.classList.toggle('ws-is-collapsed',next);
  collapse.setAttribute('aria-expanded',String(!next));
  const hint=next?'Mở rộng thanh điều hướng':'Thu gọn thanh điều hướng';
  collapse.setAttribute('aria-label',hint);
  collapse.title=hint;
  try{localStorage.setItem('whose-sidebar-collapsed-v2',next?'1':'0')}catch{}
 }
 try{setCollapse(localStorage.getItem('whose-sidebar-collapsed-v2')==='1')}catch{setCollapse(false)}
 function mark(page){
  active=page;
  for(const [name,button] of [['products',products],['calling',calling]]){
   const selected=name===page;
   button.classList.toggle('is-current',selected);
   if(selected)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');
  }
  pageTitle.textContent=page==='calling'?'Gọi hàng':'Sản phẩm';
  pageSubtitle.textContent=page==='calling'?' / Điều phối yêu cầu':' / Danh mục KiotViet';
  document.title=(page==='calling'?'Gọi hàng':'Sản phẩm')+' · Whose Studio';
 }
 async function navigate(page,updateUrl=true){
  if(busy||!['products','calling'].includes(page))return;
  busy=true;
  try{
   if(page==='calling'){
    await window.whoseCallingOpen?.();
    if(!document.getElementById('wcPage')||document.getElementById('wcPage').hidden)return;
   }else{
    window.whoseCallingClose?.();
   }
   mark(page);
   if(updateUrl&&location.hash!==('#'+page))history.pushState(null,'','#'+page);
   if(isMobile()&&root.classList.contains('ws-mobile-open'))setMobileOpen(false);
  }finally{busy=false}
 }
 products.addEventListener('click',()=>void navigate('products'));
 calling.addEventListener('click',()=>void navigate('calling'));
 collapse.addEventListener('click',()=>setCollapse(!root.classList.contains('ws-is-collapsed')));
 openButton.addEventListener('click',()=>setMobileOpen(true));
 closeButton.addEventListener('click',()=>setMobileOpen(false));
 scrim.addEventListener('click',()=>setMobileOpen(false));
 window.addEventListener('keydown',e=>{if(e.key==='Escape'&&root.classList.contains('ws-mobile-open'))setMobileOpen(false)});
 window.addEventListener('resize',()=>{
  if(!isMobile()&&root.classList.contains('ws-mobile-open'))setMobileOpen(false);
  sidebar.setAttribute('aria-hidden',String(isMobile()&&!root.classList.contains('ws-mobile-open')));
 });
 window.addEventListener('popstate',()=>{if(window.whoseSession?.())void navigate(location.hash==='#calling'?'calling':'products',false)});
 window.addEventListener('hashchange',()=>{if(window.whoseSession?.())void navigate(location.hash==='#calling'?'calling':'products',false)});
 window.addEventListener('whose:authenticated',()=>{if(location.hash==='#calling')void navigate('calling',false)});
 sidebar.setAttribute('aria-hidden',String(isMobile()));
 mark('products');
})();
