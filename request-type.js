'use strict';
// Presentation labels only: do not infer KiotViet sales or stock events.
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.WhoseRequestType=api;
})(typeof window!=='undefined'?window:null,function(){
 const labels=Object.freeze({trial:'Khách thử',display:'Trưng bày',exchange:'Đổi hàng',restock:'Bổ sung hàng'});
 function formatPurpose(kind,note){
  if(!labels[kind])throw Error('Unsupported purpose category');
  const details=String(note||'').normalize('NFC').trim();
  if(details.length>950||(details.length>0&&details.length<3))throw Error('Purpose note must be empty or 3–950 characters');
  return details?labels[kind]+' · '+details:labels[kind];
 }
 function classify(value){
  const purpose=String(value||'').trim();
  for(const [kind,label] of Object.entries(labels)){
   if(purpose===label)return {kind,label,note:''};
   if(purpose.startsWith(label+' · '))return {kind,label,note:purpose.slice(label.length+3)};
  }
  return {kind:'other',label:'Chưa phân loại',note:purpose};
 }
 function sortedQueue(rows){
  return [...(rows||[])].sort((a,b)=>{
   const done=s=>['completed','cancelled'].includes(s);
   const stage=Number(done(a.status))-Number(done(b.status));
   if(stage)return stage;
   const pa=a.priority==='urgent'?0:1,pb=b.priority==='urgent'?0:1;
   if(!done(a.status)&&pa!==pb)return pa-pb;
   const ta=Date.parse(a.created_at)||0,tb=Date.parse(b.created_at)||0;
   return done(a.status)?tb-ta:ta-tb;
  });
 }
 function perspectives({memberships=[],is_global_admin=false},branchId){
  if(!branchId)return [];
  if(is_global_admin)return ['store','warehouse'];
  const roles=(memberships||[]).filter(x=>x.branch_id===branchId&&x.is_active!==false).map(x=>x.role);
  if(roles.includes('manager')||roles.includes('admin'))return ['store','warehouse'];
  return ['store','warehouse'].filter(role=>roles.includes(role));
 }
 return {labels,formatPurpose,classify,sortedQueue,perspectives};
});
