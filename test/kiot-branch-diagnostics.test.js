const test=require('node:test');
const assert=require('node:assert/strict');
const {classifyFailure,safeDetails}=require('../lib/kiot-branch-diagnostics');
const {readAllBranches}=require('../lib/kiot-branches');

test('Kiot failed token and branch calls classify without leaking upstream provider content',()=>{
  assert.equal(classifyFailure('KiotViet token failed (401): private auth response'),'KIOT_TOKEN_DENIED');
  assert.equal(classifyFailure('KiotViet GET /branches failed (403): private body'),'KIOT_BRANCH_UNAUTHORIZED');
  assert.equal(classifyFailure('KiotViet GET /branches failed (400): private body'),'KIOT_BRANCH_BAD_REQUEST');
  assert.equal(classifyFailure('KiotViet GET /branches failed (500): private body'),'KIOT_BRANCH_UNAVAILABLE');
  const msg=safeDetails({code:'KIOT_TOKEN_DENIED',page:1});
  assert.equal(msg.code,'KIOT_TOKEN_DENIED');
  assert.equal(msg.page,1);
  assert.ok(!JSON.stringify(msg).includes('private'));
});

test('Kiot reader requests documented pagination without speculative sort fields',async()=>{
  const calls=[];
  const result=await readAllBranches(async(_,params)=>{
    calls.push(params);
    return {ok:true,data:{total:1,data:[{id:1,branchName:'Chi nhánh thực'}]}};
  });
  assert.equal(result.branches.length,1);
  assert.deepEqual(calls,[{pageSize:100,currentItem:0}]);
});

test('upstream API authentication response becomes safe error with useful code',async()=>{
  await assert.rejects(()=>readAllBranches(async()=>({
    ok:false,error:'KiotViet GET /branches failed (401): token_private_body'
  })),err=>{
    assert.equal(err.code,'KIOT_BRANCH_UNAUTHORIZED');
    assert.equal(err.page,1);
    assert.ok(!JSON.stringify(safeDetails(err)).includes('token_private_body'));
    return true;
  });
});
