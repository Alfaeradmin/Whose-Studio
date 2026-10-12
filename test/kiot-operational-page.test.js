'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {assessPage}=require('../lib/kiot-operational-page');
test('accepts proven empty Kiot operational pages without invented rows',()=>{
 assert.deepEqual(assessPage({total:0},{resource:'orders'}),{ok:true,total:0,returned:0,empty:true});
 assert.equal(assessPage({total:'0',data:[]},{resource:'productOnHands'}).ok,true);
});
test('rejects ambiguous and truncated operational responses',()=>{
 assert.equal(assessPage({total:3},{resource:'orders'}).code,'MISSING_DATA');
 assert.equal(assessPage({total:3,data:[]},{resource:'orders'}).code,'EMPTY_NONZERO_PAGE');
 assert.equal(assessPage({total:null,data:[]}).code,'INVALID_TOTAL');
 assert.equal(assessPage({total:4,data:[{id:1},{id:1}]},{pageSize:2,resource:'orders'}).code,'DUPLICATED_PAGE_ID');
 assert.equal(assessPage({total:4,data:[{id:1},{id:2}]},{pageSize:1,resource:'orders'}).code,'PAGE_OVERFLOW');
});
test('accepts bounded uniquely identified orders without inferring business state',()=>{
 assert.deepEqual(assessPage({total:3,data:[{id:12}]},{resource:'orders'}),{ok:true,total:3,returned:1,empty:false});
});
