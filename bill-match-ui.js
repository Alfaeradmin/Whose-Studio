'use strict';
// Bill reconciliation preview: no auto-commit or stock updates.
(()=>{
 const el=id=>document.getElementById(id);
 let installed=false,ticket=0;
 const text=(tag,cls,value)=>{
  const n=document.createElement(tag);if(cls)n.className=cls;
  if(value!==undefined)n.textContent=String(value);return n;
 };
 function reset(){
  ticket++;
  const results=el('wcBillMatchResults'),state=el('wcBillMatchState');
  if(results)results.replaceChildren();
  if(state)state.textContent='Nhập mã bill để kiểm tra nguồn bán. Kết quả là đề xuất, chưa ghi nhận đã bán.';
  if(el('wcBillMatchCode'))el('wcBillMatchCode').value='';
 }
 async function lookup(e){
  e.preventDefault();
  const code=el('wcBillMatchCode').value.trim();
  const branch=window.whoseWarehouse?.(),chatId=window.whoseCallingCurrentId?.();
  const request=++ticket;
  const user=window.whoseSession?.()?.user?.id;
  const token=await window.whoseAccessToken?.();
  if(request!==ticket||window.whoseCallingCurrentId?.()!==chatId)return;
  if(!/^[A-Za-z0-9][A-Za-z0-9_-]{0,47}$/.test(code)||!branch?.id||!chatId||!token){
   el('wcBillMatchState').textContent='Cần chọn đúng chi nhánh, đăng nhập và nhập mã hóa đơn hợp lệ.';return;
  }
  const scope=branch.id;
  const button=el('wcBillMatchLookup');button.disabled=true;
  const state=el('wcBillMatchState'),results=el('wcBillMatchResults');
  state.textContent='Đang đối chiếu chứng từ KiotViet…';results.replaceChildren();
  try{
   const qs=new URLSearchParams({branch_id:scope,bill_code:code});
   const response=await fetch('/api/kiot-invoice-match?'+qs,{headers:{Authorization:'Bearer '+token},cache:'no-store'});
   const data=await response.json().catch(()=>({}));
   if(request!==ticket||window.whoseWarehouse?.()?.id!==scope||window.whoseSession?.()?.user?.id!==user||window.whoseCallingCurrentId?.()!==chatId)return;
   if(!response.ok)throw Error(data.error||'Không đọc được hóa đơn Kiot');
   const bill=data.bill||{},match=data.result||{};
   const status=match.kind==='candidates'?'Có dòng phù hợp':
    match.kind==='review'?'Cần xác minh':
    match.kind==='blocked'?'Không đủ điều kiện':'Chưa tìm thấy nguồn';
   state.textContent=(bill.code||code)+' · '+status+' · Chưa ghi nhận bán tự động';
   const box=text('div','wc-bill-match-summary',
    'SKU đề xuất '+(match.proposedLines||0)+' · Cần xác minh '+(match.reviewedLines||0)+' · Chưa khớp '+(match.unmatchedLines||0));
   results.append(box);
   const reasons={
    wrong_branch:'Bill thuộc chi nhánh khác',invoice_not_completed:'Bill chưa hoàn tất hoặc đã hủy',
    multiple_request_sources:'Nhiều yêu cầu có thể là nguồn bán',
    insufficient_received_custody:'Số lượng cửa hàng đã nhận không đủ',
    no_received_source:'Chưa xác định yêu cầu đã nhận hàng tương ứng',
    product_identity_unverified:'Cần xác minh mã sản phẩm KiotViet',
    invoice_line_unverifiable:'Không xác minh được mã và số lượng từ bill',
    invoice_lines_missing:'Chứng từ chưa có dòng sản phẩm',
    manual_review_required:'Có dòng cần xác minh thủ công',
    request_source_missing:'Chưa có nguồn yêu cầu được xác minh'
   };
   for(const row of match.lines||[]){
    const item=text('div','wc-bill-match-line');
    const label=text('strong','',row.code+' × '+row.qty);
    const description=row.kind==='candidate'
      ?'Đề xuất: YC '+row.chatId.slice(0,8).toUpperCase()+' · đủ hàng đã nhận'
      :(reasons[row.reason]||'Chưa thể đối soát');
    const small=text('small','',description);
    item.dataset.kind=row.kind;item.append(label,small);results.append(item);
   }
   if(match.kind==='blocked')results.append(text('div','wc-bill-match-warning',reasons[match.reason]||'Bill chưa đủ điều kiện để đối chiếu.'));
   results.append(text('p','wc-bill-match-disclaimer',
    'Không tự trừ Kiot, không tự chốt trách nhiệm hàng. Cần sổ đối soát được xác thực để ghi nhận chính thức.'));
  }catch(err){
   if(request===ticket)state.textContent='Không thể đối chiếu: '+err.message;
  }finally{if(request===ticket)button.disabled=false}
 }
 function install(){
  if(installed)return;
  const form=el('wcBillMatchForm');if(!form)return;
  form.addEventListener('submit',lookup);
  installed=true;
 }
 window.WhoseBillMatchUI={install,reset};
})();
