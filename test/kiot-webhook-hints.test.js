'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {notificationHints}=require('../lib/kiot-webhook-hints');
test('converts each notification row to deterministic refresh hint',()=>{
 const data={Id:'evt-22',Notifications:[{Action:'product.update',Data:[{Id:12},{Id:13}]}]};
 const a=notificationHints(data,'whose'),b=notificationHints(data,'whose');
 assert.deepEqual(a,b);assert.equal(a.length,2);assert.equal(a[0].domain,'products');
});
test('unknown domain cannot create stock mutations',()=>{
 const hints=notificationHints({Id:'evt-23',Notifications:[{Action:'stock.update',Data:[{Id:4}]}]},'whose');
 assert.deepEqual(hints,[]);
});
test('malformed notification envelope is rejected',()=>{
 assert.throws(()=>notificationHints({Id:'evt',Notifications:null},'whose'),/NOTIFICATIONS/);
});
