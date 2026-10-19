const test=require('node:test');
const assert=require('node:assert/strict');
const api=require('../api/kiot-invoice-match');
const branch='123e4567-e89b-42d3-a456-426614174000';
const id='123e4567-e89b-42d3-a456-426614174001';
const chat2='123e4567-e89b-42d3-a456-426614174002';
const data={id:1055,code:'HD01055',branchId:1263919,status:1,invoiceDetails:[{id:321,productId:801,productCode:'SKU-M',quantity:1}]};
function res(){
 return {statusCode:null,headers:{},body:null,setHeader(k,v){this.headers[k]=v;return this},status(s){this.statusCode=s;return this},json(x){this.body=x;return this}};
}
async function verify({wrongBranch=false,admin=true,duplicate=false,invalid=false,recent=false,sourceQty=2}={}){
 const prev={url:process.env.SUPABASE_URL,key:process.env.SUPABASE_PUBLISHABLE_KEY,
  retailer:process.env.KIOTVIET_RETAILER,id:process.env.KIOTVIET_CLIENT_ID,secret:process.env.KIOTVIET_CLIENT_SECRET};
 const oldFetch=global.fetch,paths=[];
 try{
  process.env.SUPABASE_URL='https://fjauxxunyxxboduyxjyr.supabase.co/';
  process.env.SUPABASE_PUBLISHABLE_KEY='sb_publishable_test';
  process.env.KIOTVIET_RETAILER='whose-test';
  process.env.KIOTVIET_CLIENT_ID='mock-client';
  process.env.KIOTVIET_CLIENT_SECRET='mock-secret';
  global.fetch=async(url,opts={})=>{
   const s=String(url);paths.push(s);
   let result,code=200;
   if(s.endsWith('/auth/v1/user'))result={id:'123e4567-e89b-42d3-a456-426614174010'};
   else if(s.includes('whose_staff_memberships'))result=[];
   else if(s.includes('whose_my_global_admin'))result=admin;
   else if(s.includes('whose_branches'))result=[{id:branch,kiot_branch_id:1263919,is_active:true}];
   else if(s.includes('id.kiotviet.vn'))result={access_token:'token-fixture',expires_in:3600};
   else if(s.includes('/invoices/code/')){
    const invoice=s.includes('HD01056')?{...data,id:1056,code:'HD01056'}:data;
    result=wrongBranch?{...invoice,branchId:1280205}:invoice;
   }
   else if(s.startsWith('https://public.kiotapi.com/invoices?'))
    result={data:[data,{...data,id:1056,code:'HD01056'}]};
   else if(s.includes('whose_department_chats'))result=[{id,branch_id:branch,status:'received'}].concat(duplicate?[{id:chat2,branch_id:branch,status:'received'}]:[]);
   else if(s.includes('whose_department_chat_lines')){
    result=[{id:'123e4567-e89b-42d3-a456-426614174003',chat_id:id,sku:'SKU-M',qty_received:sourceQty,qty_returned:0,product:{kiot_product_id:801}}];
    if(duplicate)result.push({id:'123e4567-e89b-42d3-a456-426614174004',chat_id:chat2,sku:'SKU-M',qty_received:2,qty_returned:0,product:{kiot_product_id:801}});
   }else throw Error('Unexpected lookup '+s);
   return {ok:code===200,status:code,text:async()=>JSON.stringify(result),json:async()=>result};
  };
  const reply=res();
  await api({method:'GET',headers:{authorization:'Bearer fixture-token'},query:recent?{branch_id:branch,recent:'1'}:{branch_id:branch,bill_code:invalid?'../../secret':'HD01055'}},reply);
  return {reply,paths};
 }finally{
  global.fetch=oldFetch;
  for(const [k,v] of Object.entries(prev)){
   const field={url:'SUPABASE_URL',key:'SUPABASE_PUBLISHABLE_KEY',retailer:'KIOTVIET_RETAILER',
    id:'KIOTVIET_CLIENT_ID',secret:'KIOTVIET_CLIENT_SECRET'}[k];
   if(v===undefined)delete process.env[field];else process.env[field]=v;
  }
 }
}
test('same-branch completed bill returns one PROPOSAL and never claims sale',async()=>{
 const {reply,paths}=await verify();
 assert.equal(reply.statusCode,200);
 assert.equal(reply.body.result.kind,'candidates');
 assert.equal(reply.body.result.applied,false);
 assert.equal(reply.body.saved,false);
 assert.equal(reply.body.result.lines[0].chatId,id);
 assert.equal(reply.body.bill.code,'HD01055');
 assert.ok(paths.some(x=>x.includes('/invoices/code/HD01055')));
 assert.ok(!paths.some(x=>x.includes('rpc/whose_chat_act')));
 assert.ok(!JSON.stringify(reply.body).includes('token-fixture'));
});
test('cross branch invoice cannot be read by Whose staff',async()=>{
 const {reply,paths}=await verify({wrongBranch:true});
 assert.equal(reply.statusCode,404);
 assert.ok(!paths.some(x=>x.includes('whose_department_chats')));
});
test('same SKU belonging to multiple requests is NOT automatically allocated',async()=>{
 const {reply}=await verify({duplicate:true});
 assert.equal(reply.statusCode,200);
 assert.equal(reply.body.result.kind,'review');
 assert.equal(reply.body.result.lines[0].reason,'multiple_request_sources');
});
test('source bill cannot be searched via arbitrary paths',async()=>{
 const {reply,paths}=await verify({invalid:true});
 assert.equal(reply.statusCode,400);
 assert.deepEqual(paths,[]);
});
test('unapproved staff cannot request invoice details',async()=>{
 const {reply,paths}=await verify({admin:false});
 assert.equal(reply.statusCode,403);
 assert.ok(!paths.some(x=>x.includes('/invoices/code/')));
});

test('UI isolates invoice proposal responses per current request and never persists them',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const src=fs.readFileSync(path.resolve(__dirname,'../bill-match-ui.js'),'utf8');
 assert.match(src,/const request=\+\+ticket/);
 assert.match(src,/window\.whoseCallingCurrentId\?\.\(\)!==chatId/);
 assert.match(src,/match\.kind==='candidates'/);
 assert.doesNotMatch(src,/method:\s*['"]POST['"]/);
 assert.doesNotMatch(src,/localStorage|sessionStorage/);
});

test('recent invoice scan is bounded and suggests sources without recording sales',async()=>{
 const {reply,paths}=await verify({recent:true});
 assert.equal(reply.statusCode,200);
 assert.equal(reply.body.recent,true);
 assert.equal(reply.body.scanned,2);
 assert.equal(reply.body.limitedTo,8);
 assert.equal(reply.body.saved,false);
 assert.equal(reply.body.results.length,2);
 assert.ok(reply.body.results.every(item=>item.result.applied===false));
 assert.ok(paths.some(x=>x.includes('/invoices?')));
 assert.equal(paths.filter(x=>x.includes('/invoices/code/')).length,2);
});
test('recent scan cannot allocate same physical custody twice across two bills',async()=>{
 const {reply}=await verify({recent:true,sourceQty:1});
 assert.equal(reply.statusCode,200);
 for(const item of reply.body.results){
  assert.equal(item.result.kind,'review');
  assert.equal(item.result.lines[0].reason,'multiple_invoice_claims');
 }
});
test('manual scanning is opt-in, never started in calling navigation',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const ui=fs.readFileSync(path.resolve(__dirname,'../bill-match-ui.js'),'utf8');
 const chat=fs.readFileSync(path.resolve(__dirname,'../calling-chat-box.js'),'utf8');
 assert.match(ui,/wcScanRecentBills/);
 assert.match(ui,/recent:'1'/);
 assert.doesNotMatch(chat,/\/api\/kiot-invoice-match\?recent/);
});
