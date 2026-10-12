'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Module=require('node:module');
const target=require('node:path').join(__dirname,'../api/kiot-inventory-sync.js');
const original=Module._load;
const calls=[];
let staff={ok:true,is_global_admin:false};
Module._load=function(request,parent,isMain){
 if(parent?.filename===target){
  if(request==='../lib/whose-auth')return {validateStaffBearer:async()=>staff,verifyOrigin:()=>true};
  if(request==='../lib/whose-backend')return {
   accessToken:()=> 'Bearer test-only',
   rest:async(path,opts)=>{calls.push({path,opts});return {ok:true,data:{total:1,rows:[{sku:'ABC'}],branches:['WHOSE STUDIO NVT']}};}
  };
  if(request==='../lib/kiotviet')return {safeRead:async()=>{throw Error('Kiot provider must not be called for database reads')}};
 }
 return original.apply(this,arguments);
};
let handler;
try{delete require.cache[require.resolve(target)];handler=require(target);}
finally{Module._load=original;}
function response(){
 return {statusCode:200,body:null,setHeader(){},status(code){this.statusCode=code;return this;},
  json(data){this.body=data;return this;}};
}
test('branch staff can read scoped inventory via database RPC without Kiot provider',async()=>{
 calls.length=0;
 const res=response();
 await handler({method:'GET',headers:{},query:{view:'stored',offset:'0',q:' Shirt ',branch:'WHOSE STUDIO NVT'}},res);
 assert.equal(res.statusCode,200);
 assert.equal(calls[0].path,'rpc/whose_inventory_search_page');
 assert.deepEqual(calls[0].opts.body,{p_limit:100,p_offset:0,p_query:'Shirt',p_branch:'WHOSE STUDIO NVT'});
});
test('branch staff reports use permission-enforced filtered RPC',async()=>{
 calls.length=0;
 const res=response();
 await handler({method:'GET',headers:{},query:{view:'summary',branch:'WHOSE STUDIO LVS'}},res);
 assert.equal(res.statusCode,200);
 assert.equal(calls[0].path,'rpc/whose_inventory_summary_filtered');
 assert.deepEqual(calls[0].opts.body,{p_branch:'WHOSE STUDIO LVS'});
});
test('branch staff cannot import Kiot stock snapshots',async()=>{
 calls.length=0;
 const res=response();
 await handler({method:'POST',headers:{},body:{page:0,confirm:'IMPORT_KIOT_INVENTORY'},query:{}},res);
 assert.equal(res.statusCode,403);
 assert.equal(res.body.error,'ADMIN_REQUIRED');
 assert.equal(calls.length,0);
});
test('search rejects oversized filters before querying database',async()=>{
 calls.length=0;
 const res=response();
 await handler({method:'GET',headers:{},query:{view:'stored',q:'x'.repeat(81),offset:'0'}},res);
 assert.equal(res.statusCode,400);
 assert.equal(calls.length,0);
});
