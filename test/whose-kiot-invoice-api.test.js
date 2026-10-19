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
async function verify({wrongBranch=false,admin=true,duplicate=false,invalid=false}={}){
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
   else if(s.includes('/invoices/code/'))result=wrongBranch?{...data,branchId:1280205}:data;
   else if(s.includes('whose_department_chats'))result=[{id,branch_id:branch,status:'received'}].concat(duplicate?[{id:chat2,branch_id:branch,status:'received'}]:[]);
   else if(s.includes('whose_department_chat_lines')){
    result=[{id:'123e4567-e89b-42d3-a456-426614174003',chat_id:id,sku:'SKU-M',qty_received:2,qty_returned:0,product:{kiot_product_id:801}}];
    if(duplicate)result.push({id:'123e4567-e89b-42d3-a456-426614174004',chat_id:chat2,sku:'SKU-M',qty_received:2,qty_returned:0,product:{kiot_product_id:801}});
   }else throw Error('Unexpected lookup '+s);
   return {ok:code===200,status:code,text:async()=>JSON.stringify(result),json:async()=>result};
  };
  const reply=res();
  await api({method:'GET',headers:{authorization:'Bearer fixture-token'},query:{branch_id:branch,bill_code:invalid?'../../secret':'HD01055'}},reply);
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
