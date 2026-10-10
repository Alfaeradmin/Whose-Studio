const test=require('node:test');
const assert=require('node:assert/strict');
const {safeRead,oauthFailureCode,tokenFailure}=require('../lib/kiotviet');
const {classifyFailure,safeDetails,issue}=require('../lib/kiot-branch-diagnostics');
const {readAllBranches}=require('../lib/kiot-branches');

test('OAuth diagnostic parser only allows standard OAuth codes',()=>{
  assert.equal(oauthFailureCode('{"error":"invalid_client","error_description":"SECRET-DO-NOT-SHOW"}'),'invalid_client');
  assert.equal(oauthFailureCode('{"error":"private_provider_error","access_token":"PRIVATE"}'),'unknown');
  assert.equal(oauthFailureCode('HTML server error'), 'unknown');
  assert.equal(tokenFailure(401,'{"error":"invalid_client","error_description":"SECRET-DO-NOT-SHOW"}').message,
    'KiotViet token failed (401): invalid_client');
});
test('errors distinguish invalid credentials, scope and endpoint failures without secrets',()=>{
 for(const [message,expected] of [
  ['KiotViet token failed (401): invalid_client','KIOT_TOKEN_INVALID_CLIENT'],
  ['KiotViet token failed (400): invalid_scope','KIOT_TOKEN_SCOPE'],
  ['KiotViet token failed (400): unauthorized_client','KIOT_TOKEN_UNAUTHORIZED_CLIENT'],
  ['KiotViet token failed (400): invalid_request','KIOT_TOKEN_REQUEST_INVALID'],
  ['KiotViet token failed (429): unknown','KIOT_TOKEN_THROTTLED'],
  ['KiotViet token failed (503): unknown','KIOT_TOKEN_PROVIDER_UNAVAILABLE']
 ]) assert.equal(classifyFailure(message),expected);
 const err=issue('KIOT_TOKEN_INVALID_CLIENT',0);
 err.upstreamStatus=401;
 const details=safeDetails(err);
 assert.deepEqual({code:details.code,page:details.page,upstreamStatus:details.upstreamStatus},
   {code:'KIOT_TOKEN_INVALID_CLIENT',page:1,upstreamStatus:401});
 assert.ok(!JSON.stringify(details).includes('SECRET-DO-NOT-SHOW'));
});
test('HTTP invalid_client uses a single token request; does not retry or leak provider description',async()=>{
 const prev={id:process.env.KIOTVIET_CLIENT_ID,secret:process.env.KIOTVIET_CLIENT_SECRET};
 const origFetch=global.fetch;
 process.env.KIOTVIET_CLIENT_ID='test-client-id';
 process.env.KIOTVIET_CLIENT_SECRET='SHOULD-NEVER-APPEAR';
 let requests=0;
 global.fetch=async(url,options)=>{
   requests++;
   assert.equal(new URL(url).hostname,'id.kiotviet.vn');
   assert.equal(options.method,'POST');
   assert.equal(options.body.get('scopes'),'PublicApi.Access');
   return new Response(JSON.stringify({error:'invalid_client',error_description:'TOP-SECRET-DO-NOT-SHOW'}),{status:401});
 };
 try{
   const response=await safeRead('branches',{pageSize:100,currentItem:0});
   assert.equal(response.ok,false);
   assert.equal(requests,1);
   assert.equal(response.error,'KiotViet token failed (401): invalid_client');
   assert.ok(!JSON.stringify(response).includes('TOP-SECRET-DO-NOT-SHOW'));
   assert.ok(!JSON.stringify(response).includes('SHOULD-NEVER-APPEAR'));
   await assert.rejects(()=>readAllBranches(async()=>response),err=>{
     assert.equal(err.code,'KIOT_TOKEN_INVALID_CLIENT');
     assert.equal(err.upstreamStatus,401);
     return true;
   });
 }finally{
   global.fetch=origFetch;
   if(prev.id===undefined)delete process.env.KIOTVIET_CLIENT_ID;
   else process.env.KIOTVIET_CLIENT_ID=prev.id;
   if(prev.secret===undefined)delete process.env.KIOTVIET_CLIENT_SECRET;
   else process.env.KIOTVIET_CLIENT_SECRET=prev.secret;
 }
});
