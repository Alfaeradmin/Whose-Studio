const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {overviewConnectionStatus}=require('../lib/kiot-overview-status');
const source=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const api=fs.readFileSync(path.join(__dirname,'../api/overview.js'),'utf8');
const ok={ok:true,ms:60,error:null};

test('Kiot access is connected only when checked API calls succeed',()=>{
 const s=overviewConnectionStatus({branches:ok,settings:ok,orders:ok});
 assert.deepEqual({state:s.state,connected:s.connected,succeeded:s.succeeded,failed:s.failed,branchesOk:s.branchesOk},
  {state:'connected',connected:true,succeeded:3,failed:0,branchesOk:true});
});
test('a rejected optional Kiot endpoint is not a global connection failure',()=>{
 const s=overviewConnectionStatus({branches:ok,products:ok,orders:{ok:false,error:'KiotViet GET /orders failed (400)'},settings:{ok:false,error:'KiotViet GET /settings failed (404)'}});
 assert.equal(s.state,'partial');
 assert.equal(s.connected,true);
 assert.equal(s.branchesOk,true);
 assert.equal(s.succeeded,2);
 assert.equal(s.failed,2);
 assert.deepEqual(s.failedResources,['orders','settings']);
});
test('other valid API successes still prove partial Kiot connection if branches fail',()=>{
 const s=overviewConnectionStatus({branches:{ok:false,error:'KiotViet GET /branches failed (503)'},products:ok});
 assert.equal(s.state,'partial');
 assert.equal(s.connected,true);
 assert.equal(s.branchesOk,false);
});
test('credential failure is only claimed when every checked API fails with explicit token auth error',()=>{
 const s=overviewConnectionStatus({branches:{ok:false,error:'KiotViet token failed (400): invalid_client'},products:{ok:false,error:'KiotViet token failed (400): invalid_client'}});
 assert.equal(s.state,'authentication_failed');
 assert.equal(s.connected,false);
 const provider=overviewConnectionStatus({branches:{ok:false,error:'KiotViet token failed (503): temporarily_unavailable'}});
 assert.equal(provider.state,'token_unavailable');
});
test('provider/network errors and no checks do not masquerade as invalid Client Secret',()=>{
 assert.equal(overviewConnectionStatus({branches:{ok:false,error:'KiotViet GET /branches failed (500)'}}).state,'unavailable');
 assert.equal(overviewConnectionStatus({}).state,'not_checked');
});
test('response status contains no raw credential or provider detail',()=>{
 const s=overviewConnectionStatus({branches:{ok:false,error:'raw DO-NOT-DISCLOSE-SECRET'},settings:ok});
 assert.ok(!JSON.stringify(s).includes('DO-NOT-DISCLOSE-SECRET'));
 assert.deepEqual(s.failedResources,['branches']);
});
test('startup banner separates partial read failures and credential errors',()=>{
 assert.match(source,/healthState === 'partial'/);
 assert.match(source,/Một phần dữ liệu lỗi/);
 assert.match(source,/healthState === 'authentication_failed'/);
 assert.match(source,/Đây là kiểm tra cấu hình, không thay thế xác thực API KiotViet/);
 assert.doesNotMatch(source,/KiotViet chưa kết nối thành công/);
 assert.match(api,/overviewConnectionStatus\(connectivity\)/);
 assert.match(api,/console\.warn\('\[Whose\/Kiot\/overview\]'/);
});
