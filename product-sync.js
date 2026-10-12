/* Whose Product Sync v1. Source KiotViet only read, Whose-only verified import.
 * Never synthesize images, quantities, product counts or completion state. */
(() => {
'use strict';
const el=id=>document.getElementById(id);
const ui={
  mode:'whose',page:0,query:'',filter:'all',rows:[],hasMore:false,
  total:null,stats:null,admin:false,busy:false,syncing:false,stop:false,
  resumePage:0,seen:false,requestId:0,sessionUser:null
};
const api='/api/kiot-products';
const escDate=value=>{
  if(!value)return 'Chưa đồng bộ';
  const dt=new Date(value);
  return Number.isNaN(dt.getTime())?'Chưa đồng bộ':
    dt.toLocaleString('vi-VN',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
};
const fmt=n=>Number.isFinite(Number(n))?Number(n).toLocaleString('vi-VN'):'—';
const showStatus=(text,kind='info')=>{
  el('psStatus').textContent=text;
  el('psStatus').dataset.kind=kind;
};
async function request(url,options={}){
  const response=await authorizedFetch(url,{cache:'no-store',...options});
  const data=await response.json().catch(()=>({}));
  if(!response.ok){
    const extra=data.upstreamStatus?' (Kiot HTTP '+data.upstreamStatus+')':'';
    const error=new Error((data.error||'Không thể tải dữ liệu sản phẩm.')+extra);
    error.status=response.status;throw error;
  }
  return data;
}
function node(tag,cls,content){
  const n=document.createElement(tag);
  if(cls)n.className=cls;
  if(content!==undefined)n.textContent=String(content);
  return n;
}
function makeCard(p){
  const card=node('article','ps-product');
  const pic=node('div','ps-product-image');
  const safe=typeof p.imageUrl==='string'?p.imageUrl:
    (p.metadata?.thumbnail||null);
  const img=typeof safe==='string'&&/^https:\/\//i.test(safe)?safe:null;
  const fallback=node('div','ps-image-placeholder','Chưa có ảnh');
  if(img){
    const image=node('img');
    image.src=img;
    image.alt='Ảnh sản phẩm '+p.name;
    image.loading='lazy';
    image.decoding='async';
    image.referrerPolicy='no-referrer';
    image.onerror=()=>{image.remove();pic.append(fallback);};
    pic.append(image);
  }else pic.append(fallback);
  card.append(pic);
  const info=node('div','ps-product-info');
  info.append(node('div','ps-product-sku',p.sku||'—'));
  info.append(node('div','ps-product-title',p.name||'—'));
  const category=p.category??p.metadata?.category;
  info.append(node('div','ps-product-sub',category||'Chưa phân loại'));
  const price=p.basePrice??p.metadata?.basePrice;
  if(typeof price==='number'&&Number.isFinite(price))info.append(node('div','ps-product-price',fmt(price)+' ₫'));
  const flags=node('div','ps-product-flags');
  const numPhotos=Array.isArray(p.images)?p.images.length:
    (Array.isArray(p.metadata?.images)?p.metadata.images.length:0);
  flags.append(node('span','ps-tag'+(numPhotos?' photo':''),numPhotos?numPhotos+' ảnh Kiot':'Chưa có ảnh'));
  const active=p.active??p.metadata?.sourceActive;
  flags.append(node('span','ps-tag'+(active==null?' unknown':''),
    active===true?'Đang sử dụng':active===false?'Ngừng sử dụng':'Chưa rõ trạng thái'));
  info.append(flags);card.append(info);
  return card;
}
function render(){
  const box=el('psCards');box.replaceChildren();
  let list=ui.rows;
  if(ui.mode==='kiot'){
    const term=ui.query.toLocaleLowerCase('vi-VN');
    if(term)list=list.filter(p=>((p.name||'')+' '+(p.sku||'')).toLocaleLowerCase('vi-VN').includes(term));
    if(ui.filter!=='all')list=list.filter(p=>{
      const has=Array.isArray(p.metadata?.images)&&p.metadata.images.length>0;
      return ui.filter==='with'?has:!has;
    });
  }
  if(!list.length){
    const empty=node('div','ps-empty');
    empty.append(node('strong','',ui.rows.length?'Không tìm thấy trong trang này':
      ui.mode==='whose'?'Chưa có sản phẩm được lưu tại Whose':'KiotViet chưa trả về sản phẩm'));
    empty.append(node('span','',ui.mode==='whose'?
      'Global Admin có thể xem trước rồi đồng bộ danh mục từ KiotViet.':
      'Vui lòng kiểm tra bộ lọc hoặc chuyển sang trang khác.'));
    box.append(empty);
  }else{
    const fragment=document.createDocumentFragment();
    for(const product of list)fragment.append(makeCard(product));
    box.append(fragment);
  }
  el('psPrev').disabled=ui.busy||ui.syncing||ui.page===0;
  el('psNext').disabled=ui.busy||ui.syncing||!ui.hasMore;
  const offset=ui.page*(ui.mode==='whose'?48:100);
  el('psPagingInfo').textContent=ui.mode==='kiot'
    ?'Trang '+(ui.page+1)+' · '+fmt(ui.total)+' SKU tại KiotViet'+
      (ui.query||ui.filter!=='all'?' · bộ lọc chỉ áp dụng trang hiện tại':'')
    :'Trang '+(ui.page+1)+' · '+(ui.query?'Kết quả tìm kiếm Whose':'Danh mục Whose');
  el('psShowWhose').classList.toggle('active',ui.mode==='whose');
  el('psShowWhose').setAttribute('aria-pressed',String(ui.mode==='whose'));
  el('psShowKiot').classList.toggle('active',ui.mode==='kiot');
  el('psShowKiot').setAttribute('aria-pressed',String(ui.mode==='kiot'));
  el('psSyncAll').disabled=!ui.admin||ui.busy||ui.syncing||
    !Number.isInteger(ui.total)||ui.total===0||ui.mode!=='kiot';
  el('psSyncAll').textContent=ui.resumePage>0?'Tiếp tục đồng bộ':'Đồng bộ từ KiotViet';
  el('psRefresh').disabled=ui.busy||ui.syncing;
  el('psShowKiot').disabled=!ui.admin||ui.busy||ui.syncing;
  el('psShowWhose').disabled=ui.syncing;
  el('psSearch').disabled=ui.syncing;
  el('psImageFilter').disabled=ui.syncing;
}
function setStats(stats){
  if(!stats)return;
  ui.stats=stats;
  el('psTotal').textContent=fmt(stats.total);
  el('psWithImages').textContent=fmt(stats.withImages);
  el('psLastSync').textContent=escDate(stats.lastSyncedAt);
}
async function load(){
  if(!state.session)return;
  const requestId=++ui.requestId;
  ui.busy=true;render();
  const view=ui.mode;
  showStatus(view==='whose'?'Đang đọc danh mục Whose…':'Đang xem trước danh mục KiotViet…');
  try{
    let data;
    if(view==='whose'){
      const qs=new URLSearchParams({view:'catalog',page:String(ui.page)});
      if(ui.query)qs.set('q',ui.query);
      if(ui.filter!=='all')qs.set('images',ui.filter);
      data=await request(api+'?'+qs);
    }else data=await request(api+'?view=preview&page='+ui.page);
    if(requestId!==ui.requestId)return;
    ui.rows=data.rows;
    ui.hasMore=Boolean(data.hasMore);
    if(view==='kiot'){
      ui.total=data.total;
      el('psContext').textContent='Xem trực tiếp KiotViet · '+fmt(data.total)+
        ' sản phẩm nguồn. Chỉ Global Admin được đồng bộ; bộ lọc chỉ áp dụng trang hiện tại.';
      showStatus('Đã đọc thành công '+fmt(data.rows.length)+' sản phẩm trang '+(ui.page+1)+
        '. Ảnh hiển thị trực tiếp từ URL KiotViet.','success');
    }else{
      setStats(data.stats);
      el('psContext').textContent='Danh mục đã được lưu trong Whose. Tìm kiếm toàn bộ qua Supabase; không chứa tồn kho.';
      showStatus('Đã tải '+fmt(data.rows.length)+' sản phẩm Whose.','success');
    }
  }catch(error){
    if(requestId!==ui.requestId)return;
    ui.rows=[];ui.hasMore=false;
    if(view==='kiot')ui.total=null;
    showStatus(error.message,'error');
  }finally{
    if(requestId===ui.requestId){ui.busy=false;render();}
  }
}
function progress(done,total,label,detail){
  el('psProgress').hidden=false;
  const pct=total>0?Math.min(100,Math.floor(100*done/total)):0;
  el('psProgressPercent').textContent=pct+'%';
  el('psProgressLabel').textContent=label;
  el('psProgressDetail').textContent=detail;
  el('psProgressBar').setAttribute('aria-valuenow',String(pct));
  el('psProgressFill').style.width=pct+'%';
}
async function syncAll(){
  if(ui.busy||ui.syncing||!ui.admin||ui.mode!=='kiot'||!Number.isInteger(ui.total)||ui.total<1)return;
  if(!window.confirm('Đồng bộ danh mục '+fmt(ui.total)+' sản phẩm từ KiotViet vào Whose?\nẢnh và thuộc tính được lưu tham chiếu, KHÔNG cập nhật tồn kho hoặc gửi dữ liệu sang KiotViet.'))return;
  ui.syncing=true;ui.stop=false;
  const total=ui.total;
  let offset=ui.resumePage*100,created=0,updated=0;
  const start=ui.resumePage;
  render();
  showStatus('Đang kiểm tra và ghi nhận từng trang sản phẩm vào Whose.');
  try{
    for(let page=start;offset<total;page++){
      progress(offset,total,'Đang đồng bộ sản phẩm',
        'Trang '+(page+1)+' · Đã xác minh '+fmt(offset)+' / '+fmt(total)+' SKU');
      const item=await request(api,{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({page})
      });
      const expected=Math.min(100,total-offset);
      if(item.total!==total||item.received!==expected||item.stored!==expected||
         item.hasMore!==(offset+expected<total))
        throw new Error('KiotViet thay đổi số lượng sản phẩm trong khi đồng bộ. Đã dừng để đối soát.');
      offset+=expected;created+=item.created;updated+=item.updated;
      ui.resumePage=page+1;
      progress(offset,total,'Đang đồng bộ sản phẩm',
        'Đã lưu '+fmt(offset)+' / '+fmt(total)+' SKU · Tạo mới '+fmt(created)+' · Cập nhật '+fmt(updated));
      if(ui.stop&&offset<total){
        showStatus('Đã tạm dừng an toàn sau trang '+(page+1)+'. Có thể tiếp tục từ trang kế tiếp.','info');
        return;
      }
    }
    ui.resumePage=0;
    progress(total,total,'Đồng bộ hoàn tất',
      'Đã duyệt '+fmt(total)+' SKU · Tạo mới '+fmt(created)+' · Cập nhật '+fmt(updated));
    showStatus('Đồng bộ thành công '+fmt(total)+' sản phẩm từ KiotViet vào danh mục Whose.','success');
  }catch(error){
    showStatus('Đồng bộ dừng tại trang '+(ui.resumePage+1)+': '+error.message+
      ' Các trang trước đã được ghi nhận; thử tiếp tục để không tạo trùng.','error');
  }finally{
    ui.syncing=false;el('psStopSync').disabled=false;
    render();
    // Refresh persisted totals even when the user stays in Kiot preview.
    try{
      const latest=await request(api+'?view=catalog&page=0');
      if(latest?.stats)setStats(latest.stats);
    }catch{
      // A catalog stats failure is not a false import success.
      showStatus('Kết quả đồng bộ đã được báo phía trên. Chưa xác minh lại được thống kê Whose; hãy bấm Làm mới danh mục.','error');
    }
  }
}
let searchTimer=null;
function onSearch(){
  ui.query=el('psSearch').value.trim();
  if(ui.mode==='kiot'){render();return;}
  clearTimeout(searchTimer);
  searchTimer=setTimeout(()=>{ui.page=0;void load();},270);
}
function openPage(page){
  ui.page=page;
  if(ui.mode==='kiot')ui.resumePage=0;
  void load();
}
el('psShowWhose').onclick=()=>{ui.mode='whose';ui.page=0;ui.query='';
  el('psSearch').value='';ui.filter='all';el('psImageFilter').value='all';void load();};
el('psShowKiot').onclick=()=>{if(!ui.admin)return;ui.mode='kiot';ui.page=0;
  ui.query='';el('psSearch').value='';ui.filter='all';el('psImageFilter').value='all';void load();};
el('psRefresh').onclick=()=>void load();
el('psSyncAll').onclick=()=>void syncAll();
el('psStopSync').onclick=()=>{ui.stop=true;el('psStopSync').disabled=true;
  showStatus('Đã yêu cầu dừng; trang đang xử lý sẽ hoàn tất trước khi dừng.');};
el('psSearch').addEventListener('input',onSearch);
el('psImageFilter').addEventListener('change',()=>{
  ui.filter=el('psImageFilter').value;
  if(ui.mode==='whose'){ui.page=0;void load();}
  else render();
});
el('psPrev').onclick=()=>{if(ui.page>0)openPage(ui.page-1);};
el('psNext').onclick=()=>{if(ui.hasMore)openPage(ui.page+1);};
const previousNavigate=navigate;
navigate=function(page){
  previousNavigate(page);
  if(page==='productSync'){
    const user=state.session?.user?.id||state.session?.user?.email||null;
    if(ui.sessionUser!==user){
      ui.sessionUser=user;
      ui.mode='whose';ui.page=0;ui.query='';ui.filter='all';
      ui.rows=[];ui.hasMore=false;ui.total=null;ui.stats=null;
      ui.resumePage=0;ui.seen=false;ui.requestId++;
      el('psSearch').value='';el('psImageFilter').value='all';
      el('psProgress').hidden=true;
      for(const id of ['psTotal','psWithImages','psLastSync'])el(id).textContent='—';
    }
    ui.admin=state.session?.is_global_admin===true;
    if(!ui.seen){ui.seen=true;render();void load();}
    else render();
  }
};
})();
