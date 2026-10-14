/* Pure sample-only Store↔Warehouse state machine. No network, stock or real records. */
(function(root,factory){
 const api=factory();
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 if(root)root.WhoseOpsDemoModel=api;
})(typeof window!=='undefined'?window:null,function(){
 'use strict';
 const DUTIES=['seller','picker','runner','receiver','lead','admin'];
 const REASONS={try_on:'Khách thử đồ',purchase:'Khách xem / mua',display:'Bổ sung quầy',size_check:'Đổi size',other:'Lý do khác'};
 const PRODUCTS=['DEMO-TEE-01','DEMO-PANT-02','DEMO-SHIRT-03','DEMO-BAG-04','DEMO-JACKET-05','DEMO-CAP-06'];
 const ZONES=['MAIN','BACK'];
 const activeStatuses=new Set(['queued','picking','ready','in_transit','delivered']);
 const fail=(code)=>{throw new Error(code)};
 const niceDuty={seller:'Bán hàng',picker:'Soạn kho',runner:'Vận chuyển',receiver:'Nhận tại quầy',lead:'Trưởng ca',admin:'Quản trị viên'};
 function employees(branch){
  const names=['Bán hàng A','Kho khu MAIN','Kho khu BACK','Vận chuyển A','Nhận hàng A','Trưởng ca','Admin'];
  const duties=['seller','picker','picker','runner','receiver','lead','admin'];
  return names.map((name,i)=>({id:branch+'-EMP-'+(i+1),name:name+' (demo)',branch,
   duty:duties[i],zone:duties[i]==='picker'?(i===2?'BACK':'MAIN'):'ALL',active:branch!=='NVT'||i!==2}));
 }
 function initial(){
  const state={version:3,sequence:1,waveSequence:1,employees:[...employees('LVS'),...employees('NVT')],calls:[],invoices:[],links:[]};
  seed(state,'LVS',22);
  seed(state,'NVT',15);
  // Explicit DEMO fixtures: a sold borrow, a partly sold borrow, and an ambiguous SKU.
  for(const index of [0,1,2]){
   const call=state.calls[index];call.status='completed';
   for(const line of call.lines){line.picked=line.requested;line.received=line.requested;line.returned=0;}
   call.events.push({at:Date.now()-60000,actor:'LVS-EMP-5',action:'Cửa hàng đã nhận hàng (demo)'});
  }
  const c=state.calls[0],sku=c.lines[0].sku;
  state.invoices.push({id:'9001001',code:'HD-DEMO-001',branch:'LVS',warehouse:c.zone,
   at:new Date(Date.now()-20000).toISOString(),status:'finalized',verified:true,
   lines:[{sku,qty:1}]});
  state.links.push({invoiceId:'9001001',callId:c.id,sku,qty:1,confirmed:true});
  const u=state.calls[1];state.invoices.push({id:'9001002',code:'HD-DEMO-002',branch:'LVS',warehouse:u.zone,
   at:new Date(Date.now()-19000).toISOString(),status:'finalized',verified:true,
   lines:[{sku:u.lines[0].sku,qty:1}]});
  return state;
 }
 function seed(state,branch,count){
  if(!Number.isInteger(count)||count<1||count>150)fail('INVALID_DEMO_SEED');
  for(let i=0;i<count;i++){
   const n=state.sequence++,zone=(branch==='NVT'?'MAIN':i%5===0?'BACK':'MAIN'),sku=PRODUCTS[n%PRODUCTS.length];
   const lines=[{sku,requested:(n%3)+1,picked:0,received:0,returned:0,shortage:''}];
   if(n%3===0)lines.push({sku:PRODUCTS[(n+2)%PRODUCTS.length],requested:2,picked:0,received:0,returned:0,shortage:''});
   state.calls.push({id:'DEMO-'+branch+'-'+String(n).padStart(4,'0'),branch,zone,priority:n%7===0?1:0,
    note:'Khách chờ thử đồ • lượt mô phỏng '+n,reason:'try_on',createdBy:branch+'-EMP-1',created:Date.now()-((count-i)*120000),
    status:'queued',wave:null,picker:null,runner:null,receiver:null,
    lines,events:[{at:Date.now(),action:'Đã gọi hàng (demo)'}],version:0});
  }
  return state;
 }
 function who(state,id){const p=state.employees.find(x=>x.id===id);if(!p||!p.active)fail('NOT_ON_SHIFT');return p}
 function task(state,id){const c=state.calls.find(x=>x.id===id);if(!c)fail('NO_ORDER');return c}
 function role(p,branch,duty,zone){
  if(p.branch!==branch||p.duty!=='admin'&&p.duty!==duty)return false;
  return p.zone==='ALL'||p.zone===zone;
 }
 function event(c,actor,action){c.version++;c.events.push({at:Date.now(),actor,action});}
 function createCall(state,employeeId,branch,zone,items,note,reason){
  const p=who(state,employeeId);if(!role(p,branch,'seller',zone))fail('SELLER_SHIFT_REQUIRED');
  if(!Array.isArray(items)||!items.length||items.length>30||!ZONES.includes(zone))fail('INVALID_LINES');
  if(!Object.hasOwn(REASONS,reason))fail('BORROW_REASON_REQUIRED');
  const set=new Set(),lines=items.map(x=>{
   if(!/^[A-Z0-9._-]{1,40}$/.test(x.sku)||!Number.isInteger(x.qty)||x.qty<1||x.qty>100||
    set.has(x.sku))fail('INVALID_LINES');
   set.add(x.sku);return{sku:x.sku,requested:x.qty,picked:0,received:0,returned:0,shortage:''};
  });
  const n=state.sequence++,c={id:'DEMO-'+branch+'-'+String(n).padStart(4,'0'),branch,zone,
   priority:0,note:String(note||'').slice(0,240),reason,createdBy:employeeId,created:Date.now(),status:'queued',
   picker:null,runner:null,receiver:null,wave:null,lines,events:[],version:0};
  event(c,p.id,'Cửa hàng gửi yêu cầu');
  state.calls.push(c);return c;
 }
 function claimWave(state,employeeId,ids){
  const p=who(state,employeeId);if(p.duty!=='picker'&&p.duty!=='admin'||!Array.isArray(ids)||ids.length<1||ids.length>8||
   new Set(ids).size!==ids.length)fail('INVALID_WAVE');
  const targets=ids.map(id=>task(state,id)),zone=targets[0].zone,branch=targets[0].branch;
  if(!role(p,branch,'picker',zone)||targets.some(c=>c.status!=='queued'||c.branch!==branch||c.zone!==zone))
   fail('WAVE_CONFLICT_OR_ZONE');
  const wave='DEMO-WAVE-'+String(state.waveSequence++).padStart(3,'0');
  targets.forEach(c=>{c.status='picking';c.picker=employeeId;c.wave=wave;event(c,employeeId,'Nhận đơn vào lượt '+wave)});
  return wave;
 }
 function scan(state,employeeId,id,sku){
  const p=who(state,employeeId),c=task(state,id);
  if(c.status!=='picking'||c.picker!==p.id||!role(p,c.branch,'picker',c.zone))fail('NOT_PICKER_OWNER');
  const line=c.lines.find(x=>x.sku===sku);
  if(!line)fail('WRONG_SKU');
  if(line.picked>=line.requested)fail('OVERPICK');
  line.picked++;if(line.picked>=line.requested)line.shortage='';event(c,p.id,'Scan '+sku+' +1 vào giỏ '+c.id);
  return c;
 }
 function short(state,employeeId,id,sku,reason){
  const p=who(state,employeeId),c=task(state,id);
  if(c.status!=='picking'||c.picker!==p.id||!role(p,c.branch,'picker',c.zone))fail('NOT_PICKER_OWNER');
  const line=c.lines.find(x=>x.sku===sku);
  if(!line||line.picked===line.requested)fail('NO_SHORTAGE');
  if(String(reason||'').trim().length<4)fail('SHORTAGE_REASON_REQUIRED');
  line.shortage=String(reason).trim().slice(0,300);event(c,p.id,'Báo thiếu '+sku+': '+line.shortage);
 }
 function ready(state,employeeId,id){
  const p=who(state,employeeId),c=task(state,id);
  if(c.status!=='picking'||c.picker!==p.id||!role(p,c.branch,'picker',c.zone))fail('NOT_PICKER_OWNER');
  if(c.lines.some(x=>x.picked<x.requested&&!x.shortage))fail('MUST_PICK_OR_SHORT');
  if(c.lines.reduce((s,l)=>s+l.picked,0)===0)fail('NOTHING_TO_HANDOFF');
  c.status='ready';event(c,p.id,'Đã soạn, từng giỏ chờ vận chuyển');return c;
 }
 function take(state,employeeId,id){
  const p=who(state,employeeId),c=task(state,id);
  if(c.status!=='ready'||!role(p,c.branch,'runner',c.zone))fail('RUNNER_NOT_ALLOWED');
  c.status='in_transit';c.runner=p.id;event(c,p.id,'Nhận giỏ để vận chuyển');return c;
 }
 function deliver(state,employeeId,id){
  const p=who(state,employeeId),c=task(state,id);
  if(c.status!=='in_transit'||c.runner!==p.id||!role(p,c.branch,'runner',c.zone))fail('NOT_RUNNER_OWNER');
  c.status='delivered';event(c,p.id,'Đã giao giỏ tại quầy');return c;
 }
 function receive(state,employeeId,id,quantities,reason){
  const p=who(state,employeeId),c=task(state,id);
  if(c.status!=='delivered'||!role(p,c.branch,'receiver',c.zone))fail('RECEIVER_NOT_ALLOWED');
  if(!quantities||c.lines.some(l=>!Number.isInteger(quantities[l.sku])||
   quantities[l.sku]<0||quantities[l.sku]>l.picked))fail('INVALID_RECEIVE');
  const discrep=c.lines.some(l=>quantities[l.sku]!==l.picked);
  if(discrep&&String(reason||'').trim().length<4)fail('RECEIPT_REASON_REQUIRED');
  c.lines.forEach(l=>{l.received=quantities[l.sku]});
  c.receiver=p.id;c.status=discrep?'disputed':'completed';
  event(c,p.id,discrep?'Nhận lệch: '+String(reason).trim():'Cửa hàng xác nhận đã nhận đủ');
  return c;
 }
 function confirmReturn(state,employeeId,callId,sku,quantity,reason){
  const p=who(state,employeeId),c=task(state,callId);
  if(!role(p,c.branch,'picker',c.zone)&&!role(p,c.branch,'lead',c.zone))fail('WAREHOUSE_RETURN_REQUIRED');
  if(!['delivered','completed','disputed'].includes(c.status))fail('NOT_DELIVERED');
  const line=c.lines.find(x=>x.sku===sku);
  if(!line||!Number.isInteger(quantity)||quantity<1||String(reason||'').trim().length<4)fail('INVALID_RETURN');
  const sold=(state.links||[]).filter(x=>x.confirmed&&x.callId===callId&&x.sku===sku)
   .reduce((a,x)=>a+x.qty,0);
  const issued=c.status==='delivered'?line.picked:line.received;
  if(quantity>issued-sold-(line.returned||0))fail('RETURN_EXCEEDS_UNSOLD');
  line.returned=(line.returned||0)+quantity;
  event(c,p.id,'Đã nhận trả kho '+sku+' ×'+quantity+' · '+String(reason).trim().slice(0,160));
  return c;
 }
 function assign(state,leadId,targetId,duty,zone){
  const lead=who(state,leadId),target=who(state,targetId);
  if(!['lead','admin'].includes(lead.duty)||lead.branch!==target.branch||!DUTIES.includes(duty)||duty==='admin'||target.duty==='admin'||
   ![...ZONES,'ALL'].includes(zone)||duty==='picker'&&zone==='ALL')fail('SHIFT_MANAGER_REQUIRED');
  target.duty=duty;target.zone=zone;return target;
 }
 function visible(state,branch,employeeId){
  const p=who(state,employeeId);
  return state.calls.filter(c=>c.branch===branch&&
   (['lead','admin'].includes(p.duty)||p.zone==='ALL'||p.zone===c.zone))
   .sort((a,b)=>(activeStatuses.has(a.status)?0:1)-(activeStatuses.has(b.status)?0:1)||
     b.priority-a.priority||a.created-b.created||a.id.localeCompare(b.id));
 }
 return {DUTIES,REASONS,PRODUCTS,ZONES,niceDuty,initial,seed,who,task,role,createCall,claimWave,
  scan,short,ready,take,deliver,receive,confirmReturn,assign,visible,activeStatuses};
});
