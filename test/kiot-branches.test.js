const test=require('node:test');
const assert=require('node:assert/strict');
const {normalizeBranch,readAllBranches}=require('../lib/kiot-branches');
const handler=require('../api/kiot-branches');
test('uses actual KiotViet retail field names, without inventing status or warehouse kind',()=>{
 const b=normalizeBranch({id:42,branchName:'Cửa hàng A',branchCode:'CN-A',address:'Đường A'});
 assert.deepEqual(b,{id:42,name:'Cửa hàng A',code:'CN-A',address:'Đường A',isActive:null});
 assert.equal(Object.hasOwn(b,'kind'),false);
});
test('reads all KiotViet branch pages, preserving real data exactly once',async()=>{
 const all=Array.from({length:102},(_,i)=>({id:i+1,branchName:'Branch '+(i+1)}));
 const result=await readAllBranches(async(_,q)=>({
   ok:true,data:{total:102,data:all.slice(q.currentItem,q.currentItem+q.pageSize)}
 }));
 assert.equal(result.total,102);
 assert.equal(result.pages,2);
 assert.equal(result.branches.length,102);
 assert.equal(result.branches[101].id,102);
});
test('rejects a partial or duplicate KiotViet response instead of importing truncated data',async()=>{
 await assert.rejects(()=>readAllBranches(async()=>({
   ok:true,data:{total:105,data:[{id:1,branchName:'One'}]}
 })),/incomplete page/);
 await assert.rejects(()=>readAllBranches(async(_,q)=>({
   ok:true,data:{total:101,data:q.currentItem===0?
     Array.from({length:100},()=>({id:2,branchName:'Duplicate'})):
     [{id:101,branchName:'Last'}]}
 })),/Duplicate KiotViet/);
});
test('non-authenticated branch import is blocked before KiotViet fetch',async()=>{
 const response={statusCode:null,body:null,setHeader(){return this;},status(v){this.statusCode=v;return this;},json(v){this.body=v;return this;}};
 await handler({method:'POST',headers:{}},response);
 assert.equal(response.statusCode,401);
});
