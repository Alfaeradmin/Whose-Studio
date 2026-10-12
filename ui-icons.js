/*
 * WHOSE UI Kit — SVG icon registry v1.0.0.
 * Whose-owned, fixed icon paths only. No user-supplied HTML, fonts or CDN.
 * Add future icons here; never paste mixed emoji/glyphs into controls.
 */
const WHOSE_ICON_PATHS=Object.freeze({
  menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',
  search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  refresh:'<path d="M20 6v5h-5M4 18v-5h5"/><path d="M5.7 9A7 7 0 0 1 18.5 6L20 11M4 13l1.5 5A7 7 0 0 0 18.3 15"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  'log-out':'<path d="M10 17l5-5-5-5m5 5H3"/><path d="M12 3h6a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3h-6"/>',
  chevron:'<path d="m9 18 6-6-6-6"/>',
  check:'<path d="m4 12 5 5L20 6"/>',
  alert:'<path d="m10.3 3.9-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3.1l-8-14a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4m0 4h.01"/>',
  'circle-info':'<circle cx="12" cy="12" r="10"/><path d="M12 11v5m0-8h.01"/>'
});
function whoseIconMarkup(name){
  if(!Object.prototype.hasOwnProperty.call(WHOSE_ICON_PATHS,name)) return '';
  return '<svg viewBox="0 0 24 24" role="presentation" focusable="false" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">'+WHOSE_ICON_PATHS[name]+'</svg>';
}
function mountWhoseIcons(root){
  if(!root || typeof root.querySelectorAll!=='function')return;
  root.querySelectorAll('[data-ws-icon]').forEach(node=>{
    const html=whoseIconMarkup(node.getAttribute('data-ws-icon'));
    if(html)node.innerHTML=html;
  });
}
if(typeof window!=='undefined' && typeof document!=='undefined'){
  window.WhoseUIIcons=Object.freeze({markup:whoseIconMarkup,mount:mountWhoseIcons});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>mountWhoseIcons(document),{once:true});
  else mountWhoseIcons(document);
}
if(typeof module!=='undefined' && module.exports)module.exports={WHOSE_ICON_PATHS,whoseIconMarkup,mountWhoseIcons};
