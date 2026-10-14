'use strict';
(()=>{
 const svg='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
 const selects=[...document.querySelectorAll('.ws-filter-rail select.products-select')];
 let opened=null;
 function close(){if(opened){opened.classList.remove('is-open');opened.querySelector('.ws-dropdown-menu').hidden=true;opened.querySelector('.ws-dropdown-trigger').setAttribute('aria-expanded','false');opened=null;}}
 selects.forEach(select=>{
  const wrap=document.createElement('div');wrap.className='ws-dropdown';select.parentNode.insertBefore(wrap,select);wrap.append(select);
  const trigger=document.createElement('button');trigger.type='button';trigger.className='ws-dropdown-trigger';trigger.setAttribute('aria-haspopup','listbox');trigger.setAttribute('aria-expanded','false');
  const title=document.createElement('span');trigger.append(title);trigger.insertAdjacentHTML('beforeend',svg);
  const menu=document.createElement('div');menu.className='ws-dropdown-menu';menu.hidden=true;menu.setAttribute('role','listbox');menu.setAttribute('aria-label',select.getAttribute('aria-label')||'Bộ lọc');wrap.append(trigger,menu);
  function paint(){
   const chosen=select.selectedOptions[0];title.textContent=chosen?.textContent||'Chọn bộ lọc';trigger.disabled=select.disabled;
   menu.replaceChildren();
   [...select.options].forEach(o=>{
    const btn=document.createElement('button');btn.type='button';btn.className='ws-dropdown-option';btn.setAttribute('role','option');btn.setAttribute('aria-selected',String(select.value===o.value));btn.disabled=o.disabled;
    const label=document.createElement('span');label.textContent=o.textContent;
    const check=document.createElement('span');check.className='ws-dropdown-check';check.textContent=select.value===o.value?'✓':'';
    btn.append(label,check);btn.onclick=()=>{select.value=o.value;select.dispatchEvent(new Event('change',{bubbles:true}));paint();close();trigger.focus()};
    menu.append(btn);
   });
  }
  trigger.onclick=()=>{if(opened===wrap){close();return}close();paint();menu.hidden=false;wrap.classList.add('is-open');trigger.setAttribute('aria-expanded','true');opened=wrap;};
  select.addEventListener('change',paint);
  new MutationObserver(paint).observe(select,{childList:true,subtree:true,attributes:true,attributeFilter:['disabled']});
  paint();
 });
 document.addEventListener('pointerdown',e=>{if(opened&&!opened.contains(e.target))close()});
 document.addEventListener('keydown',e=>{if(e.key==='Escape')close()});
})();
