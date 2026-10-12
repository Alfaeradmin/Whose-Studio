'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const handler=require('../api/kiot-connection-check');
function mockReq(method='GET',auth){return {method,headers:auth?{authorization:auth}:{}};}
function mockRes(){return {code:null,data:null,setHeader(){},status(code){this.code=code;return this;},json(data){this.data=data;return this;}};}
test('connection checker refuses unauthenticated users before provider requests',async()=>{
 const res=mockRes();
 await handler(mockReq('GET'),res);
 assert.equal(res.code,401);
 assert.deepEqual(res.data,{error:'STAFF_AUTH_REQUIRED'});
});
test('connection checker is GET only',async()=>{
 const res=mockRes();
 await handler(mockReq('POST'),res);
 assert.equal(res.code,405);
 assert.deepEqual(res.data,{error:'GET_ONLY'});
});
