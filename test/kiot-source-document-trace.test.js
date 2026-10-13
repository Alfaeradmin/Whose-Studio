'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {scanPage,validatedDocument,PAGE_SIZE}=require('../lib/kiot-source-document-trace');
const SKU='SP009461',P_ID=14423686;
function readFixture(overrides={}){
 const doc={id:101,code:'HD101',status:1,branchId:1263919,
  invoiceDetails:[{productId:P_ID,quantity:2},{productId:999,quantity:1}],
  customerName:'do not leak',phoneNumber:'secret'};
 const data={
  ['products/code/'+SKU]:{ok:true,data:{id:P_ID,code:SKU}},
  invoices:{ok:true,data:{total:2,data:[{id:101},{id:102}]}},
  'invoices/101':{ok:true,data:doc},
  'invoices/102':{ok:true,data:{id:102,code:'HD102',invoiceDetails:[{productId:2,quantity:1}]}}
 };
 const calls=[];
 return {calls,read:async(path,params)=>{calls.push({path,params});return overrides[path]??data[path]??{ok:false};}};
}
test('scan reads exact product code and provider document detail only, no writes',async()=>{
 const {read,calls}=readFixture();
 const result=await scanPage({sku:SKU,domain:'invoices',page:0,providerRead:read});
 assert.equal(PAGE_SIZE,8);
 assert.equal(result.checkedDocuments,2);
 assert.equal(result.totalDocuments,2);
 assert.equal(result.matchedDocuments.length,1);
 assert.equal(result.matchedDocuments[0].code,'HD101');
 assert.equal(result.matchedDocuments[0].lines[0].quantity,2);
 assert.equal(result.stockDeltaVerified,false);
 assert.equal(result.hasMore,false);
 assert.equal(result.source,'kiotviet_direct_read');
 assert.deepEqual(calls.map(x=>x.path),['products/code/'+SKU,'invoices','invoices/101','invoices/102']);
 assert.deepEqual(calls[1].params,{pageSize:8,currentItem:0});
 assert.ok(!JSON.stringify(result).includes('do not leak'));
 assert.ok(!JSON.stringify(result).includes('secret'));
});
test('empty page proves only the inspected page has no matching documents',async()=>{
 const {read}=readFixture({invoices:{ok:true,data:{total:0,data:[]}}});
 const result=await scanPage({sku:SKU,domain:'invoices',page:0,providerRead:read});
 assert.equal(result.matchedDocuments.length,0);
 assert.equal(result.checkedDocuments,0);
 assert.equal(result.stockDeltaVerified,false);
});
test('partial scans never claim full history',async()=>{
 const {read}=readFixture({invoices:{ok:true,data:{
  total:10,data:Array.from({length:8},(_,i)=>({id:101+i}))}}});
 const wrapped=async(path,options)=>{
  if(path.startsWith('invoices/')&&path!=='invoices/101')
   return {ok:true,data:{id:Number(path.split('/')[1]),invoiceDetails:[]}};
  return read(path,options);
 };
 const result=await scanPage({sku:SKU,domain:'invoices',page:0,providerRead:wrapped});
 assert.equal(result.hasMore,true);
 assert.equal(result.partialHistory,true);
 assert.equal(result.checkedDocuments,8);
});
test('Kiot detail failures fail the entire scan; never hide missing transactions',async()=>{
 const {read}=readFixture({'invoices/102':{ok:false,error:'KiotViet GET failed'}});
 await assert.rejects(scanPage({sku:SKU,domain:'invoices',page:0,providerRead:read}),/SOURCE_DOCUMENT_DETAIL_FAILED/);
});
test('stock transfer reports sent vs received separately without invented delta',()=>{
 const r=validatedDocument('transfers',{id:45,code:'CH45',
  fromBranchId:1263919,toBranchId:1280205,
  transferDetails:[{productId:P_ID,sendQuantity:6,recivedQuantity:4}]},45,P_ID);
 assert.equal(r.lines[0].quantity,6);
 assert.equal(r.lines[0].receivedQuantity,4);
 assert.equal(r.stockDeltaVerified,false);
 assert.equal(r.fromBranchId,'1263919');
 assert.equal(r.toBranchId,'1280205');
});
test('rejects invalid document identities, absent lines, invalid quantity',()=>{
 assert.throws(()=>validatedDocument('invoices',{id:1,invoiceDetails:[]},2,P_ID),/ID_MISMATCH/);
 assert.throws(()=>validatedDocument('invoices',{id:1},1,P_ID),/LINES_UNAVAILABLE/);
 assert.throws(()=>validatedDocument('invoices',{id:1,invoiceDetails:[{productId:P_ID,quantity:null}]},1,P_ID),/INVALID_SOURCE_LINE_QUANTITY/);
});
test('rejects incomplete/duplicate pages and mismatched Kiot product',async()=>{
 const {read}=readFixture({invoices:{ok:true,data:{total:4,data:[{id:101}]}}});
 await assert.rejects(scanPage({sku:SKU,domain:'invoices',page:0,providerRead:read}),/INCOMPLETE_SOURCE_DOCUMENT_PAGE/);
 const {read:duplicate}=readFixture({invoices:{ok:true,data:{total:2,data:[{id:101},{id:101}]}}});
 await assert.rejects(scanPage({sku:SKU,domain:'invoices',page:0,providerRead:duplicate}),/UNVERIFIED_SOURCE_DOCUMENT_IDS/);
 const {read:incorrect}=readFixture({['products/code/'+SKU]:{ok:true,data:{id:P_ID,code:'OTHER'}}});
 await assert.rejects(scanPage({sku:SKU,domain:'invoices',page:0,providerRead:incorrect}),/PRODUCT_IDENTITY_MISMATCH/);
});
test('invalid filters stop before any Kiot request',async()=>{
 let reads=0;
 await assert.rejects(scanPage({sku:SKU,domain:'invalid',page:0,providerRead:async()=>{reads++;}}),/INVALID_TRACE_INPUT/);
 await assert.rejects(scanPage({sku:SKU,domain:'invoices',page:-1,providerRead:async()=>{reads++;}}),/INVALID_TRACE_INPUT/);
 assert.equal(reads,0);
});
